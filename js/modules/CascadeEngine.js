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

  

  // Update animal status by AnimalID regardless of the adapter's internal record id
  // (adapter-generated records have id != AnimalID; seed records alias the two).
  const setAnimalStatus = async (animalId, status) => {
    const animals = await JF.Store.animals.list();
    const a = JF.Utils.findAnimal(animals, animalId);
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
    const stillborn = /still/i.test(String(c.CalfHealth || "") + String(c.CalvingType || ""));      if (!calfId && c.AnimalID && !stillborn) {
        const year = new Date(c.Date || c.CalvingDate || Date.now()).getFullYear();
        calfId = `CALF-${year}-${JF.Utils.uid().slice(-4)}`;
        await JF.Store.calving.update(c.id, { CalfID: calfId });
      }
      if (calfId && c.AnimalID) {
        const animals = await JF.Store.animals.list();
        const exists = JF.Utils.findAnimal(animals, calfId);
        if (!exists) {
          // Resolve the mother by any alias so the calf inherits parents even
          // when the calving was logged against a typed name.
          const mother = JF.Utils.findAnimal(animals, c.AnimalID);
          await JF.Store.animals.create({
            id: calfId, AnimalID: calfId, Name: c.CalfName || calfId, TagNumber: null,
            Species: mother?.Species || "Cattle", Breed: mother?.Breed || null,
            Gender: c.CalfGender || "Female",          DateOfBirth: c.Date || c.CalvingDate,
            Category: "Calf",
            // Link to the mother's canonical AnimalID when she is a farm animal,
            // otherwise keep the name that was typed on the calving entry.
            CurrentStatus: "Calf", MotherID: (mother && (mother.AnimalID || mother.id)) || c.AnimalID,
            // Pedigree: the sire recorded on the calving entry wins (farm bull ID
            // or a custom name); fall back to the mother's own recorded sire.
            FatherID: c.SireID || mother?.FatherID || null,
            SireName: c.SireID ? null : (c.SireName || mother?.SireName || null),
            PhotoURL: c.PhotoURL || JF.Utils.portraitSVG(calfId, "calf"),
            CurrentGroup: "Young Stock", CurrentLocation: mother?.CurrentLocation || "Maternity Barn",
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

  // (2) NEXT-DUE STAMPS + ACCOUNTING
  // Reminders themselves are derived by RuleEngine.live() on read — nothing here
  // writes them. What remains is stamping a next-due date back onto the entry
  // itself (so the profile can show it) and firing the accounting cascade.

  on("deworming:created", async (d) => {
    if (!d.AnimalID || !d.Date) return;
    const intv = await getCfg("DewormingIntervalDays", 90);
    const next = JF.Utils.addDays(d.Date, intv);
    if (d.id && !d.NextDueDate) {
      try { await JF.Store.deworming.update(d.id, { NextDueDate: JF.Utils.formatDate(next, "yyyy-MM-dd") }); } catch (e) {}
    }
    if (d.Cost) fire("accounting:autoCreate", { kind: "deworming", record: d });
  });

  on("vaccination:created", async (v) => {
    if (v.Cost) fire("accounting:autoCreate", { kind: "vaccination", record: v });
  });

  on("health:created", async (h) => {
    if (h.TreatmentCost) fire("accounting:autoCreate", { kind: "health", record: h });
  });

  // (3) ACCOUNTING double-entry journal creation.
  // Every department that spends or earns money posts here, so Finance and the
  // Dashboard head always agree with the operational entry that caused it.
  const mapping = {
    health:       { dr: "Veterinary Expense",  cr: "Cash" },
    deworming:    { dr: "Deworming Expense",   cr: "Cash" },
    vaccination:  { dr: "Vaccination Expense", cr: "Cash" },
    // Reproduction: an AI costs money the moment it is recorded (AI-018).
    insemination: { dr: "Veterinary Expense",  cr: "Cash" },
    ai:           { dr: "Veterinary Expense",  cr: "Cash" },
    purchases:    { dr: "Livestock",           cr: "Cash" },
    sales:        { dr: "Cash",                cr: "Cattle Sales" },
  };

  // The cash/bank side follows the payment method everywhere (UPI/Card/UPI → Bank), so
  // the Cash Book only moves when cash actually moved.
  const payAccountOf = (method) => ({ "Bank Transfer": "Bank", Cheque: "Bank", UPI: "Bank", Card: "Bank", Cash: "Cash" }[method] || "Cash");

  /**
   * Post one journal row for a cost-bearing entry. Idempotent per source record:
   * if a row for this record already exists (a re-run, a sync, a duplicate
   * event) it is updated instead of doubled, so Finance can never drift.
   */
  const postCost = async (kind, record, amount, description) => {
    if (!record) return false;
    const m = mapping[kind];
    const amt = Number(amount || 0);
    if (!m || !(amt > 0)) return false;
    const journal = await JF.Store.journal.list();
    const dupe = journal.find((j) => j.ReferenceID && String(j.ReferenceID) === String(record.id) && j.TransactionType === kind);
    if (dupe) {
      if (Number(dupe.Amount) !== amt) {
        await JF.Store.journal.update(dupe.id, { Amount: amt, Date: record.Date || record.DateGiven || dupe.Date, Description: description || dupe.Description });
      }
      return false;
    }
    await makeJournal({
      JournalID: `JNL-${JF.Utils.uid("j")}`,
      Date: record.Date || record.DateGiven || JF.Utils.todayISO(),
      ReferenceID: record.id,
      TransactionType: kind,
      Description: description || `${kind} for ${record.AnimalName || record.AnimalID || ""}`,
      DebitAccount: m.dr,
      CreditAccount: payAccountOf(record.PaymentMethod) || m.cr,
      Amount: amt,
      AnimalID: record.AnimalID || null,
      AnimalName: record.AnimalName || null,
      PaymentMethod: record.PaymentMethod || "Cash",
    });
    return true;
  };

  // Reproduction → Finance: insemination cost (AI-018). Fires for the modern
  // "insemination" entity and the legacy "ai" collection alike, and on edit so
  // correcting the price moves Finance with it.
  on("insemination:created", async (ai) => { if (Number(ai?.Cost)) await postCost("insemination", ai, ai.Cost); });
  on("insemination:updated", async (ai) => { if (ai && Number(ai.Cost)) await postCost("insemination", ai, ai.Cost); });

  // Corrections: if a cost is edited on an existing entry, keep the journal row
  // in step instead of leaving the old amount behind.
  on("health:updated", async (h) => { if (h && Number(h.TreatmentCost)) await postCost("health", h, h.TreatmentCost); });
  on("deworming:updated", async (d) => { if (d && Number(d.Cost)) await postCost("deworming", d, d.Cost); });
  on("vaccination:updated", async (v) => { if (v && Number(v.Cost)) await postCost("vaccination", v, v.Cost); });

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
  return { publish, subscribe, on, init, fire, makeJournal, suspend, resume, isSuspended };
})();
