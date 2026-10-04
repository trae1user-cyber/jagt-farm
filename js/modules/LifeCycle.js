window.JF = window.JF || {};

/**
 * LifeCycle - the derived cow life-cycle & lactation model.
 *
 * NOTHING here stores new facts; everything is computed from records the farm
 * already entered (calvings, AIs, PDs, treatments, expenses). This is the
 * single source the Calving Board, profile life-cycle card, medical-cost
 * analytics and herd KPIs read from, so all screens agree by construction.
 *
 * Model
 * -----
 * parity          : completed calvings (lactation # = parity)
 * lactation       : starts at each calving; DIM = days in milk since last calving
 * dry period      : a dryoff record ends the lactation (status Dry)
 * expected calving: latest AI + gestation (283d), cancelled by a calving or a
 *                   negative PD after that AI; marked "confirmed" by a positive PD
 * medical cost    : treatments + dewormers + vaccines + medical expense entries
 */
JF.LifeCycle = (function () {

  const MEDICAL_CATEGORIES = ["Veterinary", "Medicine", "Vaccination", "Deworming"];
  const GESTATION_DEFAULT = 283;

  const cfg = async (key, def) => {
    try { const s = await JF.Store.settings.get(key); const n = Number(s && s.value); return Number.isFinite(n) && n > 0 ? n : def; }
    catch (e) { return def; }
  };

  const dateOf = (rec, ...keys) => { for (const k of keys) if (rec && rec[k]) return rec[k]; return null; };
  const byDate = (a, b) => new Date(a) - new Date(b);

  /** Load every store once; returns plain arrays. */
  const loadAll = async () => {
    const keys = ["animals", "calving", "insemination", "pregnancy", "health", "deworming", "vaccination", "expenses", "dryOff"];
    const out = {};
    await Promise.all(keys.map(async (k) => { out[k] = (await (JF.Store[k] || { list: async () => [] }).list().catch(() => [])) || []; }));
    return out;
  };

  // A record belongs to an animal when any of its id/parent fields names that
  // animal — by AnimalID, internal id, name the farmer typed, or tag.
  const belongs = (animal, rec) => JF.Utils.recordBelongsTo(rec, animal, {
    idKey: "AnimalID", also: ["AnimalID", "MotherID", "FatherID", "CalfID", "id", "AnimalName"],
  });

  const medicalCostOf = (animal, d) => {
    const parts = { treatments: 0, deworming: 0, vaccination: 0, expenses: 0 };
    d.health.filter((h) => belongs(animal, h)).forEach((h) => parts.treatments += Number(h.TreatmentCost || 0));
    d.deworming.filter((x) => belongs(animal, x)).forEach((x) => parts.deworming += Number(x.Cost || 0));
    d.vaccination.filter((x) => belongs(animal, x)).forEach((x) => parts.vaccination += Number(x.Cost || 0));
    d.expenses.filter((e) => belongs(animal, e) && MEDICAL_CATEGORIES.includes(e.Category)).forEach((e) => parts.expenses += Number(e.Amount || 0));
    const total = parts.treatments + parts.deworming + parts.vaccination + parts.expenses;
    // ISO string (not a Date object) so the >= comparisons below are string-safe.
    const yearAgo = JF.Utils.formatDate(JF.Utils.addDays(JF.Utils.todayISO(), -365), "yyyy-MM-dd");
    const last12m =
      d.health.filter((h) => belongs(animal, h) && h.Date >= yearAgo).reduce((s, h) => s + Number(h.TreatmentCost || 0), 0) +
      d.deworming.filter((x) => belongs(animal, x) && (x.Date || x.DateGiven) >= yearAgo).reduce((s, x) => s + Number(x.Cost || 0), 0) +
      d.vaccination.filter((x) => belongs(animal, x) && x.DateGiven >= yearAgo).reduce((s, x) => s + Number(x.Cost || 0), 0) +
      d.expenses.filter((e) => belongs(animal, e) && MEDICAL_CATEGORIES.includes(e.Category) && e.Date >= yearAgo).reduce((s, e) => s + Number(e.Amount || 0), 0);
    const events = d.health.filter((h) => belongs(animal, h)).length;
    return { parts, total, last12m, events };
  };

  const expectedCalvingOf = (animal, d, gestation) => {
    const calvAfter = (date) => d.calving.some((c) => belongs(animal, c) && (c.Date || c.CalvingDate) > date);
    const ais = d.insemination.filter((x) => belongs(animal, x)).sort((a, b) => byDate(b.Date, a.Date));
    for (const ai of ais) {
      if (calvAfter(ai.Date)) return null; // an AI followed by a calving is history
      const pdAfter = d.pregnancy.filter((p) => belongs(animal, p) && p.Date > ai.Date).sort((a, b) => byDate(b.Date, a.Date));
      if (pdAfter.length && pdAfter[0].Result === "Negative") continue; // this AI failed; try the previous one
      const confirmed = pdAfter.some((p) => p.Result === "Positive");
      return {
        date: JF.Utils.formatDate(JF.Utils.addDays(ai.Date, gestation), "yyyy-MM-dd"),
        aiDate: ai.Date,
        confirmed,
      };
    }
    return null;
  };

  /** Full life-cycle record for one animal. Pure math on the loaded data. */
  const lifecycleOf = (animal, rawData, gestation) => {
    const d = {
      animals: [], calving: [], insemination: [], pregnancy: [], health: [],
      deworming: [], vaccination: [], expenses: [], dryOff: [],
      ...(rawData || {}),
    };
    const id = animal.AnimalID || animal.id;
    const isFemale = (animal.Gender || "Female") === "Female";
    const calvings = d.calving.filter((c) => belongs(animal, c)).sort((a, b) => byDate(a.Date || a.CalvingDate, b.Date || b.CalvingDate));
    const parity = calvings.length;
    const lastCalving = parity ? (calvings[parity - 1].Date || calvings[parity - 1].CalvingDate) : null;

    // Calving interval: average gap between consecutive calvings (needs 2+).
    let calvingInterval = null;
    if (parity >= 2) {
      const gaps = [];
      for (let i = 1; i < parity; i++) gaps.push(JF.Utils.daysBetween(calvings[i - 1].Date || calvings[i - 1].CalvingDate, calvings[i].Date || calvings[i].CalvingDate));
      const valid = gaps.filter((g) => g > 150 && g < 700); // biologically plausible
      if (valid.length) calvingInterval = Math.round(valid.reduce((s, g) => s + g, 0) / valid.length);
    }

    // Dry-off history ends a lactation.
    const dryOffs = d.dryOff.filter((x) => belongs(animal, x)).sort((a, b) => byDate(b.Date, a.Date));
    const lastDryOff = dryOffs[0] || null;
    const activeLactation = lastCalving && (!lastDryOff || (lastDryOff.Date < lastCalving));

    let dim = null, daysDry = null;
    if (animal.CurrentStatus === "Dry") {
      daysDry = lastDryOff ? JF.Utils.daysBetween(lastDryOff.Date, JF.Utils.todayISO()) : null;
    } else if (animal.CurrentStatus === "Lactating" && activeLactation) {
      dim = JF.Utils.daysBetween(lastCalving, JF.Utils.todayISO());
    }

    const expected = isFemale ? expectedCalvingOf(animal, d, gestation || GESTATION_DEFAULT) : null;
    const medical = medicalCostOf(animal, d);

    const ageDays = animal.DateOfBirth ? JF.Utils.daysBetween(animal.DateOfBirth, JF.Utils.todayISO()) : null;
    const serviceReady = isFemale && !parity && ageDays != null && ageDays >= 410 && ageDays <= 900; // ~15-30 months, unborn-heifer window

    // Economics verdict: lifetime medical cost vs configured attention threshold.
    const verdict = (medical.total === 0 && !medical.events) ? null
      : (medical.last12m >= 30000 || medical.events >= 5) ? "cost-watch"
      : (medical.last12m >= 15000) ? "watch" : "ok";

    return {
      animalId: id,
      parity,
      lactationNo: parity,
      lastCalving,
      calvingInterval,
      activeLactation,
      dim, daysDry,
      lastDryOff: lastDryOff ? lastDryOff.Date : null,
      expectedCalving: expected,
      medical,
      verdict,
      serviceReady,
      ageDays,
      isFemale,
    };
  };

  /** Compute for the whole herd in one pass. Returns Map(animalId -> lifecycle). */
  const snapshot = async () => {
    const d = await loadAll();
    const gestation = await cfg("GestationDays", GESTATION_DEFAULT);
    const map = new Map();
    (d.animals || []).forEach((a) => map.set(a.AnimalID || a.id, lifecycleOf(a, d, gestation)));
    return { map, data: d, gestation };
  };

  /** Calving Board rows: females with a pending expected calving, soonest first. */
  const calvingBoard = async () => {
    const { map, data } = await snapshot();
    const rows = [];
    for (const a of data.animals) {
      const id = a.AnimalID || a.id;
      if ((a.Gender || "Female") !== "Female" || ["Sold", "Deceased"].includes(a.CurrentStatus)) continue;
      const lc = map.get(id);
      if (!lc || !lc.expectedCalving) continue;
      const daysTo = JF.Utils.daysBetween(JF.Utils.todayISO(), lc.expectedCalving.date);
      const alreadyCalved = lc.lastCalving && lc.lastCalving > lc.expectedCalving.aiDate;
      if (alreadyCalved) continue;
      rows.push({
        animal: a,
        lc,
        daysTo,
        urgency: daysTo < 0 ? "overdue" : daysTo <= 7 ? "this-week" : daysTo <= 30 ? "soon" : "later",
        dryOffDue: daysTo <= 60 && a.CurrentStatus === "Lactating", // standard ~45-60d dry period
      });
    }
    rows.sort((x, y) => x.daysTo - y.daysTo);
    return rows;
  };

  /** Per-animal medical economics, sorted worst first (for Finance/Analytics). */
  const medicalEconomics = async () => {
    const { map, data } = await snapshot();
    return data.animals
      .map((a) => ({ animal: a, lc: map.get(a.AnimalID || a.id) }))
      .filter((x) => x.lc && (x.lc.medical.total > 0 || x.lc.medical.events > 0))
      .sort((x, y) => y.lc.medical.last12m - x.lc.medical.last12m || y.lc.medical.total - x.lc.medical.total);
  };

  /* ---------- Automatic status transitions ---------- */

  // Restore the pre-illness status when a case is marked Recovered/Closed.
  // A RECOVERY entry is the farmer saying "she's well": any earlier case still
  // marked open is closed with it, so the animal never stays stuck in Sick.
  const restoreAfterRecovery = async (animalId) => {
    let animals = await JF.Store.animals.list();
    let a = animals.find((x) => x.AnimalID === animalId || x.id === animalId);
    if (!a) return false;

    const healths = (await JF.Store.health.list()).filter((h) => h.AnimalID === animalId);
    const openCases = healths.filter((h) => ["Open", "Under Treatment", "Follow-up Required"].includes(h.RecoveryStatus));
    for (const h of openCases) {
      await JF.Store.health.update(h.id, {
        RecoveryStatus: "Recovered",
        Notes: [h.Notes, "Closed automatically when a later recovery entry was recorded."].filter(Boolean).join(" "),
      });
    }
    // Re-read: those updates may have already triggered a restore.
    animals = await JF.Store.animals.list();
    a = animals.find((x) => x.AnimalID === animalId || x.id === animalId);
    if (!a) return false;
    if (!["Under Treatment", "Sick"].includes(a.CurrentStatus)) return false;
    // Restore to the reproductive state the records imply: a cow still inside a
    // lactation (calved, not dried off since) goes back to Lactating; otherwise Open.
    const lactationStart = a.LactationStart || a.LastCalvingDate || null;
    const driedSince = a.DryOffDate && lactationStart && a.DryOffDate >= lactationStart;
    const inMilk = lactationStart && !driedSince;
    const fallback = (a.Gender || "Female") === "Female"
      ? (a.PreviousStatus || (inMilk ? "Lactating" : "Open"))
      : (a.PreviousStatus || "Active");
    await JF.Store.animals.update(a.id, { CurrentStatus: fallback, PreviousStatus: null, UpdatedAt: new Date().toISOString() });
    JF.Toast && JF.Toast.show(`${a.Name || animalId} back to ${fallback} — recovery recorded.`, "success");
    return true;
  };

  // Age-based promotions: Calf -> Heifer / Young Bull at ~6 months.
  const runAgePromotions = async () => {
    const animals = await JF.Store.animals.list();
    let n = 0;
    for (const a of animals) {
      if (!a.DateOfBirth || ["Sold", "Deceased"].includes(a.CurrentStatus)) continue;
      const age = JF.Utils.daysBetween(a.DateOfBirth, JF.Utils.todayISO());
      if (a.CurrentStatus === "Calf" && age >= 180) {
        const next = (a.Gender || "Female") === "Female" ? "Heifer" : "Young Bull";
        await JF.Store.animals.update(a.id, { CurrentStatus: next, Category: next, UpdatedAt: new Date().toISOString() });
        n++;
      } else if (a.CurrentStatus === "Heifer" && (a.Category || "") !== "Heifer") {
        await JF.Store.animals.update(a.id, { Category: "Heifer", UpdatedAt: new Date().toISOString() });
      }
    }
    return n;
  };

  const init = () => {
    // A recovery entry (new or edited) releases the animal from Sick/Under Treatment.
    JF.Cascade.on("health:created", async (h) => {
      if (h.AnimalID && ["Recovered", "Closed"].includes(h.RecoveryStatus)) await restoreAfterRecovery(h.AnimalID);
    });
    // NOTE: the adapter bridge forwards the updated record itself (not {before,after}),
    // so accept either shape.
    JF.Cascade.on("health:updated", async (payload) => {
      const rec = payload && payload.after ? payload.after : payload;
      if (rec && rec.AnimalID && ["Recovered", "Closed"].includes(rec.RecoveryStatus)) await restoreAfterRecovery(rec.AnimalID);
    });

    // Calving completes a lactation cycle: mother → Lactating Cow, parity stamped.
    // The mother may be referenced by name/id/tag, so resolve by alias.
    JF.Cascade.on("calving:created", async (c) => {
      if (!c.AnimalID) return;
      const animals = await JF.Store.animals.list();
      const a = JF.Utils.findAnimal(animals, c.AnimalID);
      if (!a) return;
      const parity = (await JF.Store.calving.list()).filter((x) => belongs(a, x)).length;
      const date = c.Date || c.CalvingDate || JF.Utils.todayISO();
      await JF.Store.animals.update(a.id, {
        CurrentStatus: "Lactating", Category: "Cow", PreviousStatus: null,
        LastCalvingDate: date, LactationStart: date, CalvingCount: parity,
        DryOffDate: null, UpdatedAt: new Date().toISOString(),
      });
      // Link the newborn's master record back to both parents (the cascade may
      // have created it before the mother's own aliases were known).
      if (c.CalfID) {
        const calf = JF.Utils.findAnimal(animals, c.CalfID);
        if (calf) {
          const patch = {};
          if (!calf.MotherID) patch.MotherID = a.AnimalID || a.id;
          if (!calf.FatherID && c.SireID) patch.FatherID = c.SireID;
          if (!calf.SireName && !c.SireID && c.SireName) patch.SireName = c.SireName;
          if (Object.keys(patch).length) {
            try { await JF.Store.animals.update(calf.id, { ...patch, UpdatedAt: new Date().toISOString() }); } catch (e) { console.warn(e); }
          }
        }
      }
    });

    // Dry-off ends the lactation.
    JF.Cascade.on("dryOff:created", async (r) => {
      if (!r.AnimalID) return;
      const animals = await JF.Store.animals.list();
      const a = animals.find((x) => x.AnimalID === r.AnimalID || x.id === r.AnimalID);
      if (!a) return;
      await JF.Store.animals.update(a.id, {
        CurrentStatus: "Dry", DryOffDate: r.Date || JF.Utils.todayISO(),
        CurrentLocation: "Dry Lot", UpdatedAt: new Date().toISOString(),
      });
      // The pre-calving check a dry cow needs is derived by the rule engine
      // (DR-001 / CL-002 read ExpectedCalvingDate via the dry-off entry), so
      // there is nothing to write here.
    });

    // Age promotions: on boot and whenever animals change.
    JF.Cascade.on("animals:created", () => runAgePromotions().catch(() => {}));
    setTimeout(() => runAgePromotions().catch(() => {}), 900);
  };

  return { loadAll, lifecycleOf, snapshot, calvingBoard, medicalEconomics, restoreAfterRecovery, runAgePromotions, MEDICAL_CATEGORIES, init };
})();
