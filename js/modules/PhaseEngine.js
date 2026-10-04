window.JF = window.JF || {};

/**
 * PhaseEngine - the farm's automatic life-phase & asset-value engine.
 *
 * PHASES (females; males are Calf -> Young Bull -> Bull):
 *   Calf        : female under ~6 months (or no DOB known but marked Calf)
 *   Heifer      : female >= 6 months, never calved, not confirmed pregnant
 *   Preg Heifer : never calved + latest pregnancy check Positive (or expected
 *                 calving in the future confirmed by records)
 *   Cow         : has calved (lactating when inside a lactation, Dry after a
 *                 dry-off, Open/Pregnant between cycles)
 *   The animal master's CurrentStatus keeps the classic values the rest of the
 *   app already speaks (Calf/Heifer/Pregnant/Lactating/Dry/Open/...); Category
 *   follows the phase so lists and filters agree.
 *
 * ASSET VALUES (the farm's fixed schedule, booked to the ledger automatically):
 *   calf / young stock ₹40,000 · pregnant heifer ₹70,000 · lactating or dry cow ₹1,50,000
 *   This module decides the VALUE; it does not write the journal. It asks
 *   JF.Cascade.bookValuation() whenever the value changes and CascadeEngine —
 *   which owns every journal row in the app — posts the revaluation
 *   (Dr Livestock · Cr/Ld Owner Capital), idempotent, one row per change.
 *   The value is DERIVED from the phase, never typed in: PhaseEngine is its only
 *   writer, every other screen just reads animal.AssetValue.
 *
 * Nothing here invents facts: phases derive from DOB + calving + pregnancy
 * records, and every phase change is stamped UpdatedAt with the source.
 */
JF.PhaseEngine = (function () {

  const VALUES = { calf: 40000, pregHeifer: 70000, cow: 150000 };

  const todayISO = () => JF.Utils.todayISO();
  const byDate = (a, b) => String(a).localeCompare(String(b));

  const phaseValue = (phase, pregnant) => {
    if (phase === "Calf") return VALUES.calf;
    if (phase === "Heifer" || phase === "Bull") return VALUES.calf; // young stock
    if (phase === "Preg Heifer") return VALUES.pregHeifer;
    if (phase === "Cow") return VALUES.cow; // calved/lactating (incl. dry & open cows)
    return null;
  };

  /** Derived phase for one animal from raw records. Pure. */
  const phaseOf = (a, d) => {
    const id = a.AnimalID || a.id;
    const female = (a.Gender || "Female") === "Female";
    if (["Sold", "Deceased"].includes(a.CurrentStatus)) return { phase: a.CurrentStatus, value: null, reason: "left the herd" };

    // Records may point at this animal by AnimalID, by name the farmer typed, or
    // by tag — match on any alias so a calving logged against "dabbi" still
    // makes her a Cow instead of leaving her showing as a Heifer. The matching
    // policy itself lives in JF.Utils.recordBelongsTo (the reminder engine uses
    // the same one); what is IN scope here is deliberately narrower — a calf's
    // own calving row names her as CalfID, and counting that would make every
    // calf a Cow on her first birthday.
    const mine = (list, idKey) => (list || []).filter((r) =>
      JF.Utils.recordBelongsTo(r, a, { idKey, also: ["MotherID", "FatherID"] }));

    const calvings = mine(d.calving, "AnimalID").map((c) => c.Date || c.CalvingDate).filter(Boolean).sort(byDate);
    const parity = calvings.length;
    const ageDays = a.DateOfBirth ? JF.Utils.daysBetween(a.DateOfBirth, todayISO()) : null;

    // Pregnancy: latest positive check (or a future expected calving) AFTER the last calving.
    const lastCalving = parity ? calvings[parity - 1] : null;
    const positives = mine(d.pregnancy, "AnimalID")
      .filter((p) => String(p.Result || "").toLowerCase() === "positive" && p.Date)
      .map((p) => p.Date).sort(byDate);
    const lastPositive = positives[positives.length - 1] || null;
    const pregnant = !!lastPositive && (!lastCalving || lastPositive > lastCalving);

    if (!female) {
      const phase = parity > 0 || (ageDays != null && ageDays > 365) ? "Bull" : "Calf";
      return { phase, value: phaseValue(phase), reason: "male line" };
    }
    if (parity > 0) {
      // Cow: dry only when a dry-off happened after the last calving.
      const dryOffs = mine(d.dryOff, "AnimalID").map((x) => x.Date).filter(Boolean).sort(byDate);
      const lastDry = dryOffs[dryOffs.length - 1] || null;
      const dry = lastDry && (!lastCalving || lastDry > lastCalving);
      const phase = "Cow";
      return { phase, status: dry ? "Dry" : "Lactating", value: phaseValue(phase), reason: `${parity} calving(s)` };
    }
    if (pregnant) {
      return { phase: "Preg Heifer", status: "Pregnant", value: phaseValue("Preg Heifer"), reason: `positive check ${lastPositive}, no calving yet` };
    }
    if (ageDays == null) {
      // No DOB: trust the stored status if it is a phase word, else classify as heifer.
      const guess = ["Calf", "Heifer"].includes(a.CurrentStatus) ? a.CurrentStatus : "Heifer";
      return { phase: guess, value: phaseValue(guess), reason: "no DOB — kept current phase" };
    }
    const phase = ageDays < 180 ? "Calf" : "Heifer";
    return { phase, status: ageDays < 180 ? "Calf" : "Open", value: phaseValue(phase), reason: `${ageDays}d old` };
  };

  /**
   * Heal the pedigree links the entry flow could not know about: a calf whose
   * birth was recorded without parents inherits them from its calving record,
   * and a parent recorded only as a typed name is linked to the real animal of
   * that name when one exists. Runs before phases so the very next sweep sees
   * the true family. Returns the number of records repaired.
   */
  const linkRelationships = async (d) => {
    const calvings = d.calving || [];
    let fixed = 0;
    for (const calf of d.animals) {
      if (["Sold", "Deceased"].includes(calf.CurrentStatus)) continue;
      const patch = {};
      const cv = calvings.find((c) => JF.Utils.sameAnimal(calf, c.CalfID));
      if (cv) {
        if (!calf.MotherID && cv.AnimalID) patch.MotherID = cv.AnimalID;
        if (!calf.FatherID && cv.SireID) patch.FatherID = cv.SireID;
        if (!calf.SireName && !cv.SireID && cv.SireName) patch.SireName = cv.SireName;
        if (!calf.DateOfBirth && (cv.Date || cv.CalvingDate)) patch.DateOfBirth = cv.Date || cv.CalvingDate;
        if ((!calf.Name || calf.Name === calf.AnimalID) && cv.CalfName) patch.Name = cv.CalfName;
      }
      // Mother/father recorded only as a typed name → link the real animal.
      if (!patch.MotherID && !calf.MotherID && calf.MotherName) {
        const m = JF.Utils.findAnimal(d.animals, calf.MotherName);
        if (m && m.id !== calf.id) patch.MotherID = m.AnimalID || m.id;
      }
      if (!patch.FatherID && !calf.FatherID && calf.SireName) {
        const f = JF.Utils.findAnimal(d.animals, calf.SireName);
        if (f && f.id !== calf.id) patch.FatherID = f.AnimalID || f.id;
      }
      if (Object.keys(patch).length) {
        try {
          await JF.Store.animals.update(calf.id, { ...patch, UpdatedAt: new Date().toISOString() });
          Object.assign(calf, patch);
          fixed++;
        } catch (e) { console.warn("[PhaseEngine:link]", calf.AnimalID, e.message); }
      }
    }
    return fixed;
  };

  /**
   * Sync phases (and asset values) for the whole herd. Returns change count.
   * Only one pass runs at a time: two overlapping passes would each read the
   * journal before the other's rows landed and post the same revaluation twice.
   */
  let inflight = null;
  const syncAll = () => {
    if (inflight) return inflight;
    inflight = run().finally(() => { inflight = null; });
    return inflight;
  };

  const run = async () => {
    const d = {
      animals: await JF.Store.animals.list(),
      calving: await JF.Store.calving.list(),
      pregnancy: await JF.Store.pregnancy.list(),
      dryOff: await JF.Store.dryOff.list(),
    };
    let changes = await linkRelationships(d);
    for (const a of d.animals) {
      try {
        const { phase, status, value, reason } = phaseOf(a, d);
        const patch = {};
        if (phase && a.Category !== phase && !["Sold", "Deceased"].includes(a.CurrentStatus)) patch.Category = phase;
        
        if (status && a.CurrentStatus !== status) patch.CurrentStatus = status;
        // The asset value is derived, so it is written from here and from nowhere
        // else — it follows the animal through a calving without anyone typing it.
        if (value != null && Number(a.AssetValue || 0) !== value) patch.AssetValue = value;
        if (Object.keys(patch).length) {
          patch.UpdatedAt = new Date().toISOString();
          await JF.Store.animals.update(a.id, patch);
          changes++;
          console.info(`[PhaseEngine] ${a.AnimalID}: ${a.Category || "?"}/${a.CurrentStatus} → ${patch.Category || phase}${patch.CurrentStatus ? "/" + patch.CurrentStatus : ""} (${reason})`);
        }
        if (value != null && phase !== "Sold" && phase !== "Deceased") {
          if (await JF.Cascade.bookValuation(a, value, phase)) changes++;
        }
      } catch (e) { console.warn("[PhaseEngine]", a.AnimalID, e.message); }
    }
    return changes;
  };

  const init = () => {
    // React to the entries that can change a phase — debounced into one sweep.
    let t = null;
    const schedule = () => { clearTimeout(t); t = setTimeout(() => syncAll().catch(() => {}), 2500); };
    ["calving:created", "pregnancy:created", "dryOff:created", "animals:created"].forEach((evt) => JF.Cascade.on(evt, schedule));
    setTimeout(() => syncAll().catch(() => {}), 1200); // boot pass (after LifeCycle's promotions)
  };

  return { phaseOf, syncAll, linkRelationships, VALUES, init };
})();
