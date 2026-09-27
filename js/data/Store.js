JF.Store = (function () {
  let adapter;
  let dataAdapter; // farm DATA adapter (MongoDB farm API or the local mock)
  let sheetAdapter; // rulebook adapter (Google Sheet) - always present
  let backend = "mock";
  let bridged = false; // set true once app.js bridges events to the CascadeEngine

  /**
   * HYBRID BACKEND: farm data (animals, heat, milk, expenses, reminders...)
   * lives in the data adapter (MongoDB through the farm API, or this device),
   * while the three rule entities (Rules / Rule_Parameters / Rule_Overrides)
   * are routed to the Google Sheet rulebook console when its URL is configured
   * in Settings. With no sheet configured, rule entities transparently fall
   * through to the data adapter, so offline behaviour is unchanged.
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
    sheetAdapter = new JF.Data.SheetRulesAdapter(dataAdapter);
    adapter = makeComposite(dataAdapter, sheetAdapter);
    return adapter;
  };

  const isBridged = () => bridged;
  const markBridged = () => { bridged = true; };

  const getAdapter = () => adapter;
  const setBackend = (type) => init(type); // rebuilds both halves (sheet URL/token live in localStorage)
  /** Configure the Google Sheet rulebook console (Settings -> Rulebook). */
  const configureRuleSheet = ({ endpoint, token } = {}) => {
    if (!sheetAdapter) return;
    sheetAdapter.configure({ endpoint, token });
  };
  const getRuleSheetAdapter = () => sheetAdapter;
  /** Which adapter actually holds a given entity right now (for UI hints). */
  const homeOf = (entity) => (RULE_ENTITIES.has(entity) && sheetAdapter && sheetAdapter._live()
    ? "sheet"
    : (backend === "mongo" && dataAdapter && !dataAdapter.isPlaceholder ? "mongo" : "device"));
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
    reminders: wrapEntity("reminders"),
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
    groups: wrapEntity("groups"),
  };

  // Auto-initialize from localStorage preference (defaults to mock for first load)
  const savedBackend = localStorage.getItem("jf_backend");
  init(savedBackend || "mock");

  return api;
})();
