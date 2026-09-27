window.JF = window.JF || {};

/**
 * CareSchedule - age-based preventive-care reminder engine.
 *
 * When a calf is born, this engine schedules its whole care plan as reminders:
 *   first dewormer (default day 14), second dewormer (day 45),
 *   FMD vaccine (day 90), Brucellosis for females (day 150),
 *   BQ + HS vaccines (day 180).
 * All day numbers come from Settings (Health tab) so the farm can tune them.
 *
 * Idempotent: every generated reminder carries ReferenceID "CARE-<AnimalID>-<ruleKey>",
 * so re-syncs update instead of duplicating. Recording the actual deworming/vaccination
 * entry marks the matching care reminder Completed automatically.
 */
JF.CareSchedule = (function () {

  const REF_PREFIX = "CARE-";

  const getCfg = async (key, def) => {
    try {
      const s = await JF.Store.settings.get(key);
      const n = Number(s && s.value);
      return Number.isFinite(n) && n > 0 ? n : def;
    } catch (e) { return def; }
  };

  const ageInDays = (dob) => (dob ? JF.Utils.daysBetween(dob, JF.Utils.todayISO()) : NaN);

  const isFemale = (a) => (a.Gender || "Female") === "Female";

  // Rule definitions; age/lead are resolved from settings at sync time.
  const ruleDefs = [
    { key: "deworm1", type: "Deworming",  label: "First dewormer",   cfg: "CalfFirstDewormAgeDays",   def: 14,  leadCfg: "CalfCareRemindLeadDays", leadDef: 7, store: "deworming",   done: (recs, n) => recs.length >= 1 },
    { key: "deworm2", type: "Deworming",  label: "Second dewormer",  cfg: "CalfSecondDewormAgeDays",  def: 45,  leadCfg: "CalfCareRemindLeadDays", leadDef: 7, store: "deworming",   done: (recs, n) => recs.length >= 2 },
    { key: "fmd",     type: "Vaccination", label: "FMD vaccine",     cfg: "CalfFMDAgeDays",           def: 90,  leadCfg: "CalfCareRemindLeadDays", leadDef: 14, store: "vaccination", match: (r) => /FMD|Foot/i.test(r.Vaccine || ""), done: (recs) => recs.length >= 1 },
    { key: "bruc",    type: "Vaccination", label: "Brucellosis vaccine", cfg: "CalfBrucellaAgeDays",  def: 150, leadCfg: "CalfCareRemindLeadDays", leadDef: 14, store: "vaccination", femaleOnly: true, match: (r) => /Brucell/i.test(r.Vaccine || ""), done: (recs) => recs.length >= 1 },
    { key: "bq",      type: "Vaccination", label: "BQ vaccine",      cfg: "CalfBQAgeDays",            def: 180, leadCfg: "CalfCareRemindLeadDays", leadDef: 14, store: "vaccination", match: (r) => /BQ|Black Quarter/i.test(r.Vaccine || ""), done: (recs) => recs.length >= 1 },
    { key: "hs",      type: "Vaccination", label: "HS vaccine",      cfg: "CalfHSAgeDays",            def: 180, leadCfg: "CalfCareRemindLeadDays", leadDef: 14, store: "vaccination", match: (r) => /HS|Haemorrhagic/i.test(r.Vaccine || ""), done: (recs) => recs.length >= 1 },
  ];

  const statusFor = (dueDate) => {
    const d = JF.Utils.daysBetween(JF.Utils.todayISO(), dueDate);
    if (d < 0) return "Overdue";
    if (d === 0) return "Due Today";
    return "Upcoming";
  };

  // One concurrent sync per animal: two triggers (e.g. calving + the cascade's
  // animals:created) sharing the same promise cannot double-create reminders.
  const inflight = new Map();

  /** Sync (create/update/complete) care reminders for one animal. */
  const syncForAnimal = (animalId) => {
    if (inflight.has(animalId)) return inflight.get(animalId);
    const p = syncForAnimalInner(animalId).finally(() => inflight.delete(animalId));
    inflight.set(animalId, p);
    return p;
  };

  const syncForAnimalInner = async (animalId) => {
    // The sheet-driven RuleEngine supersedes this fixed plan: its calf rules
    // (CF-*, DW-013, DW-017B, VAC-*) cover the same ground but stay editable in
    // the Rules sheet. Keep this engine as the fallback only.
    if (JF.RuleEngine && JF.RuleEngine.isEnabled && JF.RuleEngine.isEnabled()) return 0;
    const a = (await JF.Store.animals.list()).find((x) => x.AnimalID === animalId || x.id === animalId);
    if (!a || !a.DateOfBirth) return 0;
    const dob = a.DateOfBirth;
    const age = ageInDays(dob);
    if (!Number.isFinite(age)) return 0;

    // Active care window: calves up to ~1 year, plus any animal that still has
    // open CARE reminders (so late entries still complete them).
    const existing = (await JF.Store.reminders.list())
      .filter((r) => String(r.ReferenceID || "").startsWith(REF_PREFIX + a.AnimalID));
    const young = age <= 366;
    if (!young && !existing.length) return 0;

    const [dews, vaxs] = await Promise.all([JF.Store.deworming.list(), JF.Store.vaccination.list()]);
    const afterBirth = (list) => list.filter((r) => r.AnimalID === a.AnimalID && (!r.Date && !r.DateGiven || JF.Utils.daysBetween(dob, r.Date || r.DateGiven) >= -3));
    const dewsMine = afterBirth(dews);
    const vaxsMine = afterBirth(vaxs);

    let touched = 0;
    for (const rule of ruleDefs) {
      if (rule.femaleOnly && !isFemale(a)) continue;
      const ageDays = await getCfg(rule.cfg, rule.def);
      const lead = await getCfg(rule.leadCfg, rule.leadDef);
      const refId = `${REF_PREFIX}${a.AnimalID}-${rule.key}`;
      const due = JF.Utils.formatDate(JF.Utils.addDays(dob, ageDays), "yyyy-MM-dd");
      const remindOn = JF.Utils.formatDate(JF.Utils.addDays(due, -lead), "yyyy-MM-dd");
      const records = rule.store === "deworming" ? dewsMine : vaxsMine.filter(rule.match || (() => true));
      const done = rule.done(records);
      const prev = existing.find((r) => r.ReferenceID === refId);

      if (!prev && !young) continue; // do not start new reminders for adults
      // Plan step appears once its reminder date is within 60 days (or already passed).
      const daysToRemind = JF.Utils.daysBetween(JF.Utils.todayISO(), remindOn);
      if (!prev && daysToRemind > 60) continue;

      const payload = {
        ReminderID: `RMN-CARE-${a.AnimalID}-${rule.key}`,
        AnimalID: a.AnimalID,
        ReminderType: rule.type,
        ReferenceID: refId,
        DueDate: due,
        ReminderDate: remindOn,
        Priority: age > ageDays ? "High" : "Normal",
        Status: done ? "Completed" : statusFor(due),
        Notes: `Calf care plan: ${rule.label} (due at ${ageDays}d old)`,
      };
      if (prev) {
        if (prev.Status !== payload.Status || prev.DueDate !== due) {
          await JF.Store.reminders.update(prev.id, payload);
          touched++;
        }
      } else if (!done) {
        await JF.Store.reminders.create(payload);
        touched++;
      }
    }
    return touched;
  };

  /** Sync every animal in the herd. */
  const syncAll = async () => {
    const animals = await JF.Store.animals.list();
    let n = 0;
    for (const a of animals) {
      try { n += await syncForAnimal(a.AnimalID); } catch (e) { console.warn("CareSchedule:", a.AnimalID, e); }
    }
    return n;
  };

  const init = () => {
    // Re-sync when life happens: calf born, dewormer/vaccine recorded.
    const resync = (idGetter) => async (rec) => {
      const id = idGetter(rec);
      if (id) { try { await syncForAnimal(id); } catch (e) {} }
    };
    JF.Cascade.on("calving:created", async (c) => { if (c.CalfID) resync(() => c.CalfID)(c); });
    JF.Cascade.on("animals:created", resync((r) => r.AnimalID || r.id));
    JF.Cascade.on("deworming:created", resync((r) => r.AnimalID));
    JF.Cascade.on("vaccination:created", resync((r) => r.AnimalID));
    // Initial pass after boot/seed (deferred so the store is ready).
    setTimeout(() => syncAll().catch((e) => console.warn("CareSchedule init:", e)), 600);
  };

  return { init, syncAll, syncForAnimal };
})();
