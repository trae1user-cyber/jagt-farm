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
 *                 dry-off, Open/Pregnant between cycles) — grouped "Milking Herd"
 *   The animal master's CurrentStatus keeps the classic values the rest of the
 *   app already speaks (Calf/Heifer/Pregnant/Lactating/Dry/Open/...); Category
 *   and CurrentGroup follow the phase so lists and groups agree.
 *
 * ASSET VALUES (farm's fixed schedule, written to the journal automatically):
 *   non-pregnant calf  ₹70,000 · pregnant heifer ₹1,20,000 · calved/lactating cow ₹1,80,000
 *   A revaluation journal entry (Dr Livestock · Cr/Ld Owner Capital) is posted
 *   whenever an animal's phase value changes — idempotent, one row per change.
 *
 * Nothing here invents facts: phases derive from DOB + calving + pregnancy
 * records, and every phase change is stamped UpdatedAt with the source.
 */
JF.PhaseEngine = (function () {

  const VALUES = { calf: 70000, pregHeifer: 120000, cow: 180000 };

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
    if (["Sold", "Deceased"].includes(a.CurrentStatus)) return { phase: a.CurrentStatus, group: a.CurrentGroup, value: null, reason: "left the herd" };

    const calvings = (d.calving || []).filter((c) => c.AnimalID === id).map((c) => c.Date || c.CalvingDate).filter(Boolean).sort(byDate);
    const parity = calvings.length;
    const ageDays = a.DateOfBirth ? JF.Utils.daysBetween(a.DateOfBirth, todayISO()) : null;

    // Pregnancy: latest positive check (or a future expected calving) AFTER the last calving.
    const lastCalving = parity ? calvings[parity - 1] : null;
    const positives = (d.pregnancy || [])
      .filter((p) => p.AnimalID === id && String(p.Result || "").toLowerCase() === "positive" && p.Date)
      .map((p) => p.Date).sort(byDate);
    const lastPositive = positives[positives.length - 1] || null;
    const pregnant = !!lastPositive && (!lastCalving || lastPositive > lastCalving);

    if (!female) {
      const phase = parity > 0 || (ageDays != null && ageDays > 365) ? "Bull" : "Calf";
      return { phase, group: phase === "Bull" ? "Breeding" : "Young Stock", value: phaseValue(phase), reason: "male line" };
    }
    if (parity > 0) {
      // Cow: dry only when a dry-off happened after the last calving.
      const dryOffs = (d.dryOff || []).filter((x) => x.AnimalID === id).map((x) => x.Date).filter(Boolean).sort(byDate);
      const lastDry = dryOffs[dryOffs.length - 1] || null;
      const dry = lastDry && (!lastCalving || lastDry > lastCalving);
      const phase = "Cow";
      return { phase, group: "Milking Herd", status: dry ? "Dry" : "Lactating", value: phaseValue(phase), reason: `${parity} calving(s)` };
    }
    if (pregnant) {
      return { phase: "Preg Heifer", group: "Breeding", status: "Pregnant", value: phaseValue("Preg Heifer"), reason: `positive check ${lastPositive}, no calving yet` };
    }
    if (ageDays == null) {
      // No DOB: trust the stored status if it is a phase word, else classify as heifer.
      const guess = ["Calf", "Heifer"].includes(a.CurrentStatus) ? a.CurrentStatus : "Heifer";
      return { phase: guess, group: guess === "Calf" ? "Young Stock" : "Breeding", value: phaseValue(guess), reason: "no DOB — kept current phase" };
    }
    const phase = ageDays < 180 ? "Calf" : "Heifer";
    return { phase, group: ageDays < 180 ? "Young Stock" : "Breeding", status: ageDays < 180 ? "Calf" : "Open", value: phaseValue(phase), reason: `${ageDays}d old` };
  };

  /**
   * Keep the Livestock asset for this animal EQUAL to the phase value. The
   * journal delta posted = phase value − already-booked value, where booked =
   * the purchase price (if any) + every prior phase-revaluation row. So a
   * purchased cow booked at cost is topped up (or written down) to the farm's
   * fixed schedule, and each Calf→Preg Heifer→Cow step-up posts only its step.
   */
  const postRevaluation = async (animal, value, phase) => {
    const id = animal.AnimalID || animal.id;
    const journal = await JF.Store.journal.list();
    const mine = journal.filter((j) => j.ReferenceID && String(j.ReferenceID).startsWith(`PHASE-REVAL-${id}-`));
    const purchaseBooked =
      Number(animal.PurchasePrice || 0) ||
      (await JF.Store.purchases.list().catch(() => [])).filter((p) => p.AnimalID === id).reduce((s, p) => s + Number(p.PurchasePrice || p.TotalCost || 0), 0);
    const booked = purchaseBooked + mine.reduce((s, j) => s + (j.CreditAccount === "Livestock" ? -Number(j.Amount || 0) : Number(j.Amount || 0)), 0);
    const delta = Math.round(value - booked);
    if (Math.abs(delta) < 1) return false;
    const ref = `PHASE-REVAL-${id}-${mine.length + 1}-${String(phase).replace(/\s+/g, "")}`;
    const up = delta > 0; // up: Dr Livestock / Cr Owner Capital; down: reversed
    await JF.Store.journal.create({
      JournalID: `JNL-${JF.Utils.uid("j")}`,
      Date: todayISO(),
      DebitAccount: up ? "Livestock" : "Owner Capital",
      CreditAccount: up ? "Owner Capital" : "Livestock",
      Amount: Math.abs(delta),
      AnimalID: id,
      ReferenceID: ref,
      TransactionType: "Asset Revaluation",
      Description: `${animal.Name || id} → ${phase}: livestock asset value ${up ? "increased to" : "reduced to"} ₹${value.toLocaleString("en-IN")}`,
    });
    return true;
  };

  /** Sync phases (and asset values) for the whole herd. Returns change count. */
  const syncAll = async () => {
    const d = {
      animals: await JF.Store.animals.list(),
      calving: await JF.Store.calving.list(),
      pregnancy: await JF.Store.pregnancy.list(),
      dryOff: await JF.Store.dryOff.list(),
    };
    let changes = 0;
    for (const a of d.animals) {
      try {
        const { phase, group, status, value, reason } = phaseOf(a, d);
        const patch = {};
        if (phase && a.Category !== phase && !["Sold", "Deceased"].includes(a.CurrentStatus)) patch.Category = phase;
        if (group && a.CurrentGroup !== group) patch.CurrentGroup = group;
        if (status && a.CurrentStatus !== status) patch.CurrentStatus = status;
        if (Object.keys(patch).length) {
          patch.UpdatedAt = new Date().toISOString();
          await JF.Store.animals.update(a.id, patch);
          changes++;
          console.info(`[PhaseEngine] ${a.AnimalID}: ${a.Category || "?"}/${a.CurrentStatus} → ${patch.Category || phase}${patch.CurrentStatus ? "/" + patch.CurrentStatus : ""} (${reason})`);
        }
        if (value != null && phase !== "Sold" && phase !== "Deceased") {
          if (await postRevaluation(a, value, phase)) changes++;
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

  return { phaseOf, syncAll, VALUES, init };
})();
