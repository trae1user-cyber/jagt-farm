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
        calfId = await JF.Utils.nextAnimalId(`CALF-${year}`);
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
            CurrentLocation: mother?.CurrentLocation || "Maternity Barn",
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
  });

  // A deleted animal takes its derived asset row with it, so the Livestock
  // balance never carries the value of an animal that no longer exists.
  on("animals:deleted", (a) => JF.PhaseEngine?.forgetAnimal(a?.AnimalID || (typeof a === "string" ? a : a?.id)));

  // (3) ACCOUNTING double-entry journal creation.
  // Every department that spends or earns money posts through post() below, so
  // the Finance view and the Dashboard head always agree with the operational
  // entry that caused it.
  //
  // The cash/bank side follows the payment method everywhere (UPI/Card/Cheque →
  // Bank), so the Cash Book only moves when cash actually moved.
  const payAccountOf = (method) => ({ "Bank Transfer": "Bank", Cheque: "Bank", UPI: "Bank", Card: "Bank" }[method] || "Cash");

  const EXPENSE_ACCOUNT = {
    Veterinary: "Veterinary Expense", Medicine: "Medicine Expense",
    Vaccination: "Vaccination Expense", Deworming: "Deworming Expense",
    Labor: "Labor Expense", Electricity: "Electricity Expense", Water: "Water Expense",
    Fuel: "Fuel Expense", Transportation: "Transportation Expense",
    Maintenance: "Maintenance Expense", Equipment: "Equipment Expense",
    "Cattle Purchase": "Livestock", "Raw Material Purchase": "Other Farm Expense",
    "Other Farm Expense": "Other Farm Expense",
  };

  // THE one place a source record becomes a journal entry: which accounts, which
  // amount, what it is called. Everything else just says which kind it is.
  const LEDGER = {
    milk:         { type: "milk-sale",   dr: (r) => payAccountOf(r.PaymentMethod), cr: () => "Milk Sales",        amt: (r) => r.Amount },
    purchases:    { type: "purchases",   dr: () => "Livestock",                    cr: (r) => payAccountOf(r.PaymentMethod), amt: (r) => r.TotalCost ?? r.PurchasePrice ?? r.Amount },
    sales:        { type: "sales",       dr: (r) => payAccountOf(r.PaymentMethod), cr: () => "Cattle Sales",      amt: (r) => r.NetSale ?? r.SalePrice ?? r.Amount },
    expenses:     { type: "expense",     dr: (r) => EXPENSE_ACCOUNT[r.Category] || "Other Farm Expense", cr: (r) => payAccountOf(r.PaymentMethod), amt: (r) => r.Amount },
    health:       { type: "health",      dr: () => "Veterinary Expense",           amt: (r) => r.TreatmentCost },
    deworming:    { type: "deworming",   dr: () => "Deworming Expense",            amt: (r) => r.Cost },
    vaccination:  { type: "vaccination", dr: () => "Vaccination Expense",          amt: (r) => r.Cost },
    // Reproduction: an AI costs money the moment it is recorded (AI-018).
    insemination: { type: "insemination", dr: () => "Veterinary Expense",          amt: (r) => r.Cost },
  };

  const describe = (kind, r) =>
    kind === "milk"
      ? `Milk sale${r.Shift ? " · " + r.Shift : ""}${r.QuantityLitres ? " · " + r.QuantityLitres + "L" : ""}${r.Buyer ? " · " + r.Buyer : ""}`
      : kind === "expenses"
        ? (r.Description || `${r.Category || "Farm"} expense`)
        : `${kind} for ${r.AnimalName || r.AnimalID || ""}`.trim();

  const posting = new Set();

  /**
   * Book one source record into the ledger, exactly once.
   *
   * The reference is derived from the record id (JE-<kind>-<record id>), so the
   * same event arriving twice — a re-fired cascade, an edit, a sync, a backfill —
   * finds its own row and corrects it instead of adding a mirror. Rows written
   * before the key existed are recognised by their old bare-record-id reference
   * too, so no farmer row is ever duplicated or orphaned.
   */
  const post = async (kind, record) => {
    const spec = LEDGER[kind];
    if (!spec || !record || !record.id) return false;
    const amt = Math.round(Number(spec.amt(record) || 0));
    if (!(amt > 0)) return false;
    const key = `JE-${kind}-${record.id}`;
    if (posting.has(key)) return false; // same record already in flight
    posting.add(key);
    try {
      const journal = await JF.Store.journal.list();
      const dupe = journal.find((j) => String(j.ReferenceID) === key ||
        (String(j.ReferenceID) === String(record.id) && j.TransactionType === spec.type));
      const date = record.Date || record.DateGiven || JF.Utils.todayISO();
      if (dupe) {
        if (Number(dupe.Amount) !== amt || String(dupe.Date || "") !== String(date)) {
          await JF.Store.journal.update(dupe.id, { Amount: amt, Date: date });
        }
        return false;
      }
      await makeJournal({
        JournalID: `JNL-${JF.Utils.uid("j")}`,
        Date: date,
        ReferenceID: key,
        TransactionType: spec.type,
        Description: describe(kind, record),
        DebitAccount: spec.dr(record),
        CreditAccount: spec.cr ? spec.cr(record) : payAccountOf(record.PaymentMethod),
        Amount: amt,
        AnimalID: record.AnimalID || null,
        AnimalName: record.AnimalName || null,
        PaymentMethod: record.PaymentMethod || "Cash",
      });
      return true;
    } finally {
      posting.delete(key);
    }
  };

  // Money in and money out, at the moment the record is created — and on edit,
  // so a corrected amount corrects the ledger rather than adding a second row.
  [["milkSales", "milk"], ["purchases", "purchases"], ["sales", "sales"], ["expenses", "expenses"],
   ["health", "health"], ["deworming", "deworming"], ["vaccination", "vaccination"], ["insemination", "insemination"],
  ].forEach(([entity, kind]) => {
    on(`${entity}:created`, (record) => post(kind, record));
    on(`${entity}:updated`, (record) => post(kind, record));
  });

  /**
   * Bring the ledger up to date with records that were made before this posting
   * path existed (the seeded milk, purchases and sales never fired a cascade).
   * post() is idempotent, so this sweep converges: it books what is missing and
   * leaves every existing row alone. Returns how many it booked.
   */
  const syncLedger = async () => {
    const seen = new Set((await JF.Store.journal.list()).map((j) => String(j.ReferenceID)));
    let booked = 0;
    for (const [entity, kind] of [["milkSales", "milk"], ["purchases", "purchases"], ["sales", "sales"], ["expenses", "expenses"]]) {
      const list = await JF.Store[entity].list().catch(() => []);
      for (const record of list) {
        if (!record?.id || seen.has(`JE-${kind}-${record.id}`)) continue;
        if (await post(kind, record)) { seen.add(`JE-${kind}-${record.id}`); booked++; }
      }
    }
    return booked;
  };

  const init = () => { /* listeners already wired; syncLedger runs from app boot */ };
  const suspend = () => { suspended = true; };
  const resume = () => { suspended = false; };
  const isSuspended = () => suspended;
  return { publish, subscribe, on, init, fire, post, syncLedger, makeJournal, suspend, resume, isSuspended };
})();
