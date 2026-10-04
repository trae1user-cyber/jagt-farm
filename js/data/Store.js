JF.Store = (function () {
  let adapter;
  let dataAdapter; // farm DATA adapter (MongoDB farm API or the local mock)
  let backend = "mock";
  let bridged = false; // set true once app.js bridges events to the CascadeEngine

  /**
   * SINGLE BACKEND: farm data (animals, heat, milk, expenses, reminders...)
   * AND the three rule entities (Rules / Rule_Parameters / Rule_Overrides)
   * all live in the same adapter - MongoDB through the farm API, or this
   * device in offline mode. The former Google Sheet rulebook layer has been
   * removed; rules are edited in the app's Rules screen and saved to MongoDB.
   */
  const RULE_ENTITIES = new Set(["rules", "ruleParameters", "ruleOverrides"]);
  const makeComposite = (data, sheet) => {
    const routed = (entity) => (RULE_ENTITIES.has(entity) ? sheet : data);
    return {
      // Identity/behaviour used by views and the RuleEngine
      isPlaceholder: data.isPlaceholder,
      get dataBackend() { return data; },
      get sheetBackend() { return sheet; },
      // CRUD is routed per entity
      list: (entity) => routed(entity).list(entity),
      get: (entity, id) => routed(entity).get(entity, id),
      create: (entity, rec) => routed(entity).create(entity, rec),
      update: (entity, id, patch) => routed(entity).update(entity, id, patch),
      delete: (entity, id) => routed(entity).delete(entity, id),
      // Whole-store operations stay with the DATA adapter (never wipe the sheet)
      seed: (d) => data.seed(d),
      clear: () => data.clear(),
      exportBackup: () => data.exportBackup ? data.exportBackup() : Promise.reject(new Error("not supported")),
      // Diagnostics for both halves
      testConnection: () => data.testConnection(),
      verify: () => data.verify ? data.verify() : Promise.reject(new Error("not supported")),
      testRuleSheet: () => sheet.testConnection(),
      verifyRuleSheet: () => sheet.verify(),
      // Bulk rule installs still make sense on both sides (the sheet adapter
      // falls through to data when no sheet URL is set)
      seedRules: (payload) => sheet.seedRules(payload),
      syncRules: (payload) => sheet.syncRules(payload),
      // Event bus (events flow through the data adapter like before)
      on: (...a) => data.on(...a),
      emit: (...a) => data.emit(...a),
    };
  };

  const init = (type) => {
    const savedType = type || localStorage.getItem("jf_backend") || "mock";
    backend = savedType;
    if (savedType === "mongo") dataAdapter = new JF.Data.MongoApiAdapter();
    else dataAdapter = new JF.Data.MockAdapter();
    adapter = makeComposite(dataAdapter, dataAdapter);
    return adapter;
  };

  const isBridged = () => bridged;
  const markBridged = () => { bridged = true; };

  const getAdapter = () => adapter;
  const setBackend = (type) => {
    try { localStorage.setItem("jf_backend_user", "1"); } catch (e) {} // pins the user's choice against self-heal
    try { localStorage.setItem("jf_backend", type); } catch (e) {}
    return init(type); // rebuilds the adapter
  };
  /** Kept for compatibility - the Google Sheet rulebook layer is removed. */
  const configureRuleSheet = () => {};
  const getRuleSheetAdapter = () => null;
  /** Which adapter actually holds a given entity right now (for UI hints). */
  const homeOf = (entity) => (backend === "mongo" && dataAdapter && !dataAdapter.isPlaceholder ? "mongo" : "device");
  const on = (...a) => adapter.on(...a);
  const emit = (...a) => adapter.emit(...a);

  const wrapEntity = (entity) => ({
    list: () => adapter.list(entity),
    get: (id) => adapter.get(entity, id),
    find: (pred) => typeof adapter.find === "function" ? adapter.find(entity, pred) : adapter.list(entity).then((xs) => xs.filter(pred)),
    create: (data) => adapter.create(entity, data),
    update: (id, patch) => adapter.update(entity, id, patch),
    delete: (id) => adapter.delete(entity, id),
  });

  const bus = {
    publish: (event, payload) => adapter.emit(event, payload),
    subscribe: (event, fn) => adapter.on(event, fn),
  };

  const stats = {
    herd: async () => {
      const list = await adapter.list("animals");
      const active = list.filter((a) => a.CurrentStatus !== "Sold" && a.CurrentStatus !== "Deceased");
      return {
        total: active.length,
        female: active.filter((a) => a.Gender === "Female").length,
        male: active.filter((a) => a.Gender === "Male").length,
        calves: active.filter((a) => a.CurrentStatus === "Calf" || (a.DateOfBirth && JF.Utils.ageInYears(a.DateOfBirth) < 1)).length,
        pregnant: active.filter((a) => a.CurrentStatus === "Pregnant").length,
        open: active.filter((a) => a.CurrentStatus === "Open").length,
        inHeat: active.filter((a) => a.CurrentStatus === "In Heat").length,
        sick: active.filter((a) => a.CurrentStatus === "Sick" || a.CurrentStatus === "Under Treatment").length,
      };
    },
  };

  const seed = (data) => adapter.seed(data);
  const clearAll = () => adapter.clear();

  /**
   * Erase all operational records but KEEP configuration (settings + backend prefs).
   * Used by Settings > "Start Fresh" so the user gets a clean farm without losing config.
   */
  const eraseRecords = async () => {
    const keep = await adapter.list("settings");
    await adapter.clear();
    for (const s of keep) await adapter.create("settings", s);
  };

  // Force a fresh seed run on next boot (used by verification tooling).
  const forceReseed = () => { try { localStorage.setItem("jf_force_seed", "1"); } catch (e) {} };
  // Consume the force-seed flag (called once by app bootstrap).
  const consumeForceSeed = () => {
    try {
      const on = localStorage.getItem("jf_force_seed") === "1";
      if (on) localStorage.removeItem("jf_force_seed");
      return on;
    } catch (e) { return false; }
  };

  // Backend preference accessors - the ONLY place browser storage is touched
  // outside the adapter itself, so UI modules never import localStorage.
  const getConfig = (key) => { try { return localStorage.getItem(`jf_${key}`); } catch (e) { return null; } };
  const setConfig = (key, val) => { try { localStorage.setItem(`jf_${key}`, val); } catch (e) {} };

  // Entity accessors
  const api = {
    init, setBackend, getAdapter, on, emit, bus, stats, seed, clearAll, eraseRecords,
    isBridged, markBridged, forceReseed, consumeForceSeed, getConfig, setConfig,
    configureRuleSheet, getRuleSheetAdapter, homeOf,
    animals: wrapEntity("animals"),
    heat: wrapEntity("heat"),
    insemination: wrapEntity("insemination"),
    pregnancy: wrapEntity("pregnancy"),
    calving: wrapEntity("calving"),
    health: wrapEntity("health"),
    deworming: wrapEntity("deworming"),
    vaccination: wrapEntity("vaccination"),
    death: wrapEntity("death"),
    purchases: wrapEntity("purchases"),
    sales: wrapEntity("sales"),
    milkSales: wrapEntity("milkSales"),
    expenses: wrapEntity("expenses"),
    journal: wrapEntity("journal"),
    // Reminders are derived (RuleEngine.live) - this collection holds only the
    // farmer's OWN reminders plus their Done/Dismiss/Snooze decisions, keyed by
    // the derived row's id. Nothing the system computes is ever stored.
    reminders: wrapEntity("reminders"),
    reminderState: wrapEntity("reminderState"),
    files: wrapEntity("files"),
    dryOff: wrapEntity("dryOff"),
    rules: wrapEntity("rules"),
    ruleParameters: wrapEntity("ruleParameters"),
    ruleOverrides: wrapEntity("ruleOverrides"),
    audit: wrapEntity("audit"),
    // Raw settings-entity CRUD (the typed settings.{get,set,allMap} API sits alongside).
    settingsEntity: wrapEntity("settings"),
    settings: {
      async list() { return adapter.list("settings"); },
      async get(key) { const all = await adapter.list("settings"); return all.find((s) => s.key === key); },
      async set(key, value) {
        const all = await adapter.list("settings");
        const existing = all.find((s) => s.key === key);
        if (existing) return adapter.update("settings", existing.id, { value });
        return adapter.create("settings", { key, value });
      },
      async allMap() { const all = await adapter.list("settings"); return Object.fromEntries(all.map((s) => [s.key, s.value])); },
    },
    };

  // Auto-initialize from localStorage preference. Default is the MongoDB farm
  // API (endpoint+token are baked into MongoApiAdapter), falling back to the
  // device store only when the API is unreachable - checked asynchronously.
  //
  // SELF-HEALING: a "mock" preference that was written automatically (no user
  // choice recorded) is retried against MongoDB on every boot — a Render cold
  // start once sent a device to mock mode and it must come back on its own.
  const savedBackend = localStorage.getItem("jf_backend");
  const userChoseBackend = localStorage.getItem("jf_backend_user") === "1";
  if (savedBackend && userChoseBackend) {
    init(savedBackend);
    if (savedBackend === "mongo") dataAdapter.warmup?.();
  } else {
    // Auto path: always try MongoDB first, drop to device only while offline.
    init("mongo");
    // One-shot boot fetch: warms the entity cache AND checks reachability in
    // the same round trip (the old boot fired an expensive ping that counted
    // every collection). If the baked-in API cannot be reached at all, drop
    // to the offline device store — without recording it as a user choice,
    // so the next boot tries MongoDB again.
    Promise.resolve(dataAdapter.warmup?.()).then((data) => {
      if (!data && !localStorage.getItem("jf_backend_user")) {
        init("mock");
        try { localStorage.setItem("jf_backend", "mock"); } catch (e) {}
      }
    }).catch(() => {});
  }

  return api;
})();
