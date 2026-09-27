JF.Cascade = (function () {
  const subs = new Map();
  let suspended = false; // true while bulk seeding: cascades must NOT auto-generate reminders/journal for pre-baked seed data

  const on = (event, fn) => {
    if (!subs.has(event)) subs.set(event, new Set());
    subs.get(event).add(fn);
    return () => subs.get(event)?.delete(fn);
  };

  const fire = async (event, payload) => {
    if (suspended) return [];
    const handlers = [...(subs.get(event) || []), ...(subs.get("*") || [])];
    const results = [];
    for (const fn of handlers) {
      try { results.push(await fn(payload, event)); }
      catch (e) { console.error(`[Cascade:${event}]`, e); }
    }
    return results;
  };

  const publish = async (event, payload) => fire(event, payload);
  const subscribe = on;

  // 5 cascade subscribers (per spec):
  // (1) Timeline: writes timeline-row on each event
  // (2) Reminders: heat→next heat; AI→preg check; deworming/vaccination→next; health→followup; calving→post-calving;
  // (3) Accounting: treatment/deworming/vaccination cost; purchase/sale/expense
  // (4) Animal Status: heat→In Heat; pos preg→Pregnant; neg→Open; calving→Lactating; death→Deceased; sale→Sold
  // (5) Derived calculations (e.g. heat cycle averages stored per animal)

  // Helper: settings or default
  const getCfg = async (key, def) => {
    try { const s = await JF.Store.settings.get(key); return s?.value != null ? s.value : def; }
    catch { return def; }
  };

  const makeReminder = async (base) => JF.Store.reminders.create({
    Status: "Upcoming",
    Priority: "Normal",
    CreatedAt: new Date().toISOString(),
    ...base,
  });

  // Update animal status by AnimalID regardless of the adapter's internal record id
  // (adapter-generated records have id != AnimalID; seed records alias the two).
  const setAnimalStatus = async (animalId, status) => {
    const animals = await JF.Store.animals.list();
    const a = animals.find((x) => x.AnimalID === animalId || x.id === animalId);
    if (!a) return false;
    await JF.Store.animals.update(a.id, { CurrentStatus: status, UpdatedAt: new Date().toISOString() });
    return true;
  };

  const makeJournal = async (base) => JF.Store.journal.create({
    CreatedBy: "system",
    CreatedAt: new Date().toISOString(),
    ...base,
  });

  // (1) TIMELINE subscriber
  on("change", async ({ entity, action, record }) => {
    if (action !== "create" || !record) return;
    const map = {
      heat:        { Type: "heat",      Title: "🔥 Heat detected" },
      deworming:   { Type: "deworm",    Title: "💊 Deworming completed" },
      vaccination: { Type: "vaccine",   Title: "💉 Vaccination given" },
      insemination:{ Type: "ai",        Title: "❤️ Insemination performed" },
      health:      { Type: "health",    Title: "🩺 Veterinary treatment" },
      calving:     { Type: "calving",   Title: "👶 Calving event" },
      purchases:   { Type: "purchase",  Title: "🐄 Cattle purchase" },
      sales:       { Type: "sale",      Title: "🏷 Cattle sale" },
      death:       { Type: "death",     Title: "⚰ Death recorded" },
      expenses:    { Type: "expense",   Title: "💰 Expense recorded" },
    };
    const meta = map[entity];
    if (!meta || !record.AnimalID) return;
    // We don't have a timeline table; the TimelineService aggregates from source tables dynamically.
    // Cascade event published for any listener that wants to update caches.
    fire("timeline:updated", { animalId: record.AnimalID });
  });

  // (4) ANIMAL STATUS updater
  on("heat:created", async (heat) => {
    if (!heat.AnimalID) return;
    if (await setAnimalStatus(heat.AnimalID, "In Heat")) fire("animal:statusChanged", { animalId: heat.AnimalID, newStatus: "In Heat" });
  });
  on("pregnancy:created", async (preg) => {
    if (!preg.AnimalID || !preg.Result) return;
    let s = null;
    if (preg.Result === "Positive") s = "Pregnant";
    else if (preg.Result === "Negative") s = "Open";
    if (s) await setAnimalStatus(preg.AnimalID, s);
    if (s) fire("animal:statusChanged", { animalId: preg.AnimalID, newStatus: s });
  });
  on("calving:created", async (c) => {
    if (c.AnimalID) {
      if (await setAnimalStatus(c.AnimalID, "Lactating")) fire("animal:statusChanged", { animalId: c.AnimalID, newStatus: "Lactating" });
    }
    // Calf master record - created here so EVERY entry path (QuickEntry, profile
    // actions, future GAS sync) produces the same calf-with-parents record.
    // If the caller did not supply a CalfID, generate one (unless stillborn).
    let calfId = c.CalfID || null;
    const stillborn = /still/i.test(String(c.CalfHealth || "") + String(c.CalvingType || ""));
    if (!calfId && c.AnimalID && !stillborn) {
      const year = new Date(c.Date || c.CalvingDate || Date.now()).getFullYear();
      calfId = `CALF-${year}-${JF.Utils.uid().slice(-4)}`;
      await JF.Store.calving.update(c.id, { CalfID: calfId });
    }
    if (calfId && c.AnimalID) {
      const animals = await JF.Store.animals.list();
      const exists = animals.find((a) => a.AnimalID === calfId || a.id === calfId);
      if (!exists) {
        const mother = animals.find((a) => a.AnimalID === c.AnimalID || a.id === c.AnimalID);
        await JF.Store.animals.create({
          id: calfId, AnimalID: calfId, Name: c.CalfName || calfId, TagNumber: null,
          Species: mother?.Species || "Cattle", Breed: mother?.Breed || null,
          Gender: c.CalfGender || "Female",          DateOfBirth: c.Date || c.CalvingDate,
          Category: "Calf",
          CurrentStatus: "Calf", MotherID: c.AnimalID,
          FatherID: mother?.FatherID || null,
          PhotoURL: c.PhotoURL || JF.Utils.portraitSVG(calfId, "calf"),
          CurrentGroup: "Maternity", CurrentLocation: "Maternity Barn",
        });
      }
    }
  });
  on("death:created", async (d) => {
    if (d.AnimalID) await setAnimalStatus(d.AnimalID, "Deceased");
  });
  on("sales:created", async (s) => {
    if (s.AnimalID) await setAnimalStatus(s.AnimalID, "Sold");
  });
  on("health:created", async (h) => {
    if (!h.AnimalID) return;
    if (h.RecoveryStatus && ["Open", "Under Treatment"].includes(h.RecoveryStatus)) {
      await setAnimalStatus(h.AnimalID, "Under Treatment");
    }
  });

  // (2) REMINDERS
  // When the sheet-driven RuleEngine is loaded it owns reminder generation (its
  // rules live in the Rules sheet). These handlers remain as the fallback for the
  // case where the engine could not load, so reminders are never silently lost.
  const engineOwnsReminders = () => !!(JF.RuleEngine && JF.RuleEngine.isEnabled && JF.RuleEngine.isEnabled());

  on("heat:created", async (heat) => {
    if (engineOwnsReminders()) return;
    if (!heat.AnimalID || !heat.HeatDate) return;
    const expCyc = await getCfg("ExpectedCycleLength", 21);
    const minCyc = await getCfg("MinimumCycleLength", 18);
    const maxCyc = await getCfg("MaximumCycleLength", 24);
    const before = await getCfg("ReminderDaysBefore", 3);
    const base = JF.Utils.addDays(heat.HeatDate, 0);
    const minDue = JF.Utils.addDays(base, minCyc);
    const maxDue = JF.Utils.addDays(base, maxCyc);
    const remDate = JF.Utils.addDays(base, Math.max(expCyc - before, 1));
    await makeReminder({
      ReminderID: `RMN-HEAT-${JF.Utils.uid("h")}`,
      AnimalID: heat.AnimalID,
      ReminderType: "Heat Expected",
      ReferenceID: heat.id,
      DueDate: JF.Utils.formatDate(minDue, "yyyy-MM-dd"),
      ReminderDate: JF.Utils.formatDate(remDate, "yyyy-MM-dd"),
      Notes: `Expected heat window ${JF.Utils.formatDate(minDue)} – ${JF.Utils.formatDate(maxDue)}`,
      Priority: "High",
    });
  });

  on("insemination:created", async (ai) => {
    if (engineOwnsReminders()) return;
    if (!ai.AnimalID || !ai.Date) return;
    const aiDays = await getCfg("AIPregnancyCheckDays", 30);
    const check = JF.Utils.addDays(ai.Date, aiDays);
    await makeReminder({
      ReminderID: `RMN-PREG-${JF.Utils.uid("p")}`,
      AnimalID: ai.AnimalID,
      ReminderType: "Pregnancy Check",
      ReferenceID: ai.id,
      DueDate: JF.Utils.formatDate(check, "yyyy-MM-dd"),
      ReminderDate: JF.Utils.formatDate(JF.Utils.addDays(check, -2), "yyyy-MM-dd"),
      Notes: `AI on ${JF.Utils.formatDate(ai.Date)}. Check pregnancy on day ${aiDays}.`,
      Priority: "High",
    });
    // Expected calving reminder: Date + 283 days
    const gest = await getCfg("GestationDays", 283);
    const calving = JF.Utils.addDays(ai.Date, gest);
    const alerts = await getCfg("CalvingAlertDays", [90, 60, 30, 14, 7, 1]);
    for (const days of alerts) {
      const d = JF.Utils.addDays(calving, -days);
      await makeReminder({
        ReminderID: `RMN-CAL-${days}-${JF.Utils.uid("c")}`,
        AnimalID: ai.AnimalID,
        ReminderType: "Expected Calving",
        ReferenceID: ai.id,
        DueDate: JF.Utils.formatDate(calving, "yyyy-MM-dd"),
        ReminderDate: JF.Utils.formatDate(d, "yyyy-MM-dd"),
        Notes: `${days} days before expected calving.`,
        Priority: days <= 7 ? "High" : "Normal",
      });
    }
  });

  on("deworming:created", async (d) => {
    if (!d.AnimalID || !d.Date) return;
    const intv = await getCfg("DewormingIntervalDays", 90);
    const before = await getCfg("DewormingReminderBefore", 7);
    const next = JF.Utils.addDays(d.Date, intv);
    const rem = JF.Utils.addDays(next, -before);
    // Stamp the computed next-due back onto the deworming record (spec TR-19.1)
    if (d.id && !d.NextDueDate) {
      try { await JF.Store.deworming.update(d.id, { NextDueDate: JF.Utils.formatDate(next, "yyyy-MM-dd") }); } catch (e) {}
    }
    if (engineOwnsReminders()) { if (d.Cost) fire("accounting:autoCreate", { kind: "deworming", record: d }); return; }
    await makeReminder({
      ReminderID: `RMN-DEW-${JF.Utils.uid("dw")}`,
      AnimalID: d.AnimalID,
      ReminderType: "Deworming",
      ReferenceID: d.id,
      DueDate: JF.Utils.formatDate(next, "yyyy-MM-dd"),
      ReminderDate: JF.Utils.formatDate(rem, "yyyy-MM-dd"),
      Notes: `Next deworming (${d.Medicine || "dewormer"})`,
      Priority: "Normal",
    });
    if (d.Cost) fire("accounting:autoCreate", { kind: "deworming", record: d });
  });

  on("vaccination:created", async (v) => {
    if (!v.AnimalID) return;
    if (engineOwnsReminders()) { if (v.Cost) fire("accounting:autoCreate", { kind: "vaccination", record: v }); return; }
    if (v.NextDueDate) {
      const before = await getCfg("VaccinationReminderBefore", 7);
      const rem = JF.Utils.addDays(v.NextDueDate, -before);
      await makeReminder({
        ReminderID: `RMN-VAC-${JF.Utils.uid("v")}`,
        AnimalID: v.AnimalID,
        ReminderType: "Vaccination",
        ReferenceID: v.id,
        DueDate: JF.Utils.formatDate(v.NextDueDate, "yyyy-MM-dd"),
        ReminderDate: JF.Utils.formatDate(rem, "yyyy-MM-dd"),
        Notes: `Vaccine: ${v.Vaccine || ""}`,
        Priority: "Normal",
      });
    }
    if (v.Cost) fire("accounting:autoCreate", { kind: "vaccination", record: v });
  });

  on("health:created", async (h) => {
    if (h.FollowUpDate && h.AnimalID && !engineOwnsReminders()) {
      await makeReminder({
        ReminderID: `RMN-FUP-${JF.Utils.uid("f")}`,
        AnimalID: h.AnimalID,
        ReminderType: "Treatment Follow-up",
        ReferenceID: h.id,
        DueDate: JF.Utils.formatDate(h.FollowUpDate, "yyyy-MM-dd"),
        ReminderDate: JF.Utils.formatDate(JF.Utils.addDays(h.FollowUpDate, -1), "yyyy-MM-dd"),
        Notes: h.Problem ? `Follow-up: ${h.Problem}` : "Scheduled follow-up",
        Priority: "High",
      });
    }
    if (h.TreatmentCost) fire("accounting:autoCreate", { kind: "health", record: h });
  });

  // (3) ACCOUNTING double-entry journal creation
  const mapping = {
    health:      { dr: "Veterinary Expense", cr: "Cash" },
    deworming:   { dr: "Deworming Expense",  cr: "Cash" },
    vaccination: { dr: "Vaccination Expense",cr: "Cash" },
    purchases:   { dr: "Livestock",          cr: "Cash" },
    sales:       { dr: "Cash",               cr: "Cattle Sales" },
  };

  on("accounting:autoCreate", async ({ kind, record }) => {
    const m = mapping[kind];
    if (!m || !record) return;
    const amt = Number(record.TreatmentCost ?? record.Cost ?? record.TotalCost ?? record.NetSale ?? record.Amount ?? 0);
    if (!amt) return;
    await makeJournal({
      JournalID: `JNL-${JF.Utils.uid("j")}`,
      Date: record.Date || JF.Utils.todayISO(),
      ReferenceID: record.id,
      TransactionType: kind,
      Description: `${kind} for ${record.AnimalID || ""}`,
      DebitAccount: m.dr,
      CreditAccount: m.cr,
      Amount: amt,
      AnimalID: record.AnimalID || null,
      PaymentMethod: record.PaymentMethod || "Cash",
    });
  });

  // Milk payment received: the dairy's core income. Dr Cash/Bank · Cr Milk Sales.
  on("milkSales:created", async (m) => {
    const amt = Number(m.Amount || 0);
    if (!amt) return;
    const payAccount = { "Bank Transfer": "Bank", Cheque: "Bank", UPI: "Bank", Card: "Bank", Cash: "Cash" };
    await makeJournal({
      JournalID: `JNL-${JF.Utils.uid("j")}`,
      Date: m.Date || JF.Utils.todayISO(),
      ReferenceID: m.id,
      TransactionType: "milk-sale",
      Description: `Milk sale${m.Shift ? " · " + m.Shift : ""}${m.QuantityLitres ? " · " + m.QuantityLitres + "L" : ""}${m.Buyer ? " · " + m.Buyer : ""}`,
      DebitAccount: payAccount[m.PaymentMethod] || "Cash",
      CreditAccount: "Milk Sales",
      Amount: amt,
      PaymentMethod: m.PaymentMethod || "Cash",
    });
  });

  on("expenses:created", async (e) => {
    if (!e || !Number(e.Amount)) return;
    const categoryMap = {
      Veterinary: "Veterinary Expense",
      Medicine: "Medicine Expense",
      Vaccination: "Vaccination Expense",
      Deworming: "Deworming Expense",
      Labor: "Labor Expense",
      Electricity: "Electricity Expense",
      Water: "Water Expense",
      Fuel: "Fuel Expense",
      Transportation: "Transportation Expense",
      Maintenance: "Maintenance Expense",
      Equipment: "Equipment Expense",
      "Cattle Purchase": "Livestock",
      "Raw Material Purchase": "Other Farm Expense",
      "Other Farm Expense": "Other Farm Expense",
    };
    const payAccount = { "Bank Transfer": "Bank", Cheque: "Bank", UPI: "Bank", Card: "Bank", Cash: "Cash" };
    await makeJournal({
      JournalID: `JNL-${JF.Utils.uid("j")}`,
      Date: e.Date || JF.Utils.todayISO(),
      ReferenceID: e.id,
      TransactionType: "expense",
      Description: e.Description || `${e.Category || "Farm"} expense`,
      DebitAccount: categoryMap[e.Category] || "Other Farm Expense",
      CreditAccount: payAccount[e.PaymentMethod] || "Cash",
      Amount: Number(e.Amount),
      AnimalID: e.AnimalID || null,
      PaymentMethod: e.PaymentMethod || "Cash",
    });
  });

  on("purchases:created", async (p) => fire("accounting:autoCreate", { kind: "purchases", record: { ...p, TreatmentCost: p.TotalCost } }));
  on("sales:created", async (s) => fire("accounting:autoCreate", { kind: "sales", record: { ...s, TreatmentCost: s.NetSale || s.SalePrice } }));

  const init = () => { /* listeners already wired */ };
  const suspend = () => { suspended = true; };
  const resume = () => { suspended = false; };
  const isSuspended = () => suspended;
  return { publish, subscribe, on, init, fire, makeReminder, makeJournal, suspend, resume, isSuspended };
})();
