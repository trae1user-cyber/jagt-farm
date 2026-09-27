JF.Data = JF.Data || {};

JF.Data.MockAdapter = (function () {
  const LS_KEY = "jf_mock_db_v1";
  const { Interface, entities } = JF.Data.DataAdapter;

  class MockAdapter extends Interface {
    constructor() {
      super();
      this.listeners = new Map();
      this.db = this._load();
    }

    _default() {
      const d = {};
      entities.forEach((e) => { d[e] = {}; });
      d._meta = { seq: {} };
      return d;
    }

    _load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return this._default();
        const p = JSON.parse(raw);
        entities.forEach((e) => { if (!p[e]) p[e] = {}; });
        if (!p._meta) p._meta = { seq: {} };
        return p;
      } catch (e) {
        console.warn("MockAdapter load failed:", e);
        return this._default();
      }
    }

    _save() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.db)); } catch (e) { console.warn(e); } }

    seq(entity) {
      // Sequence counters persist inside the mock DB itself (_meta), so the UI layer
      // never needs localStorage for ID generation.
      const s = ((this.db._meta?.seq?.[entity]) || 0) + 1;
      if (!this.db._meta) this.db._meta = {};
      if (!this.db._meta.seq) this.db._meta.seq = {};
      this.db._meta.seq[entity] = s;
      this._save();
      return s;
    }

    getSeq(entity) { return (this.db._meta?.seq?.[entity]) || 0; }

    on(evt, fn) { if (!this.listeners.has(evt)) this.listeners.set(evt, new Set()); this.listeners.get(evt).add(fn); return () => this.listeners.get(evt)?.delete(fn); }
    emit(evt, payload) { (this.listeners.get(evt) || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } }); (this.listeners.get("*") || []).forEach((fn) => { try { fn({ event: evt, payload }); } catch (e) {} }); }

    async list(entity) { return Object.values(this.db[entity] || {}); }
    async get(entity, id) { return this.db[entity]?.[id] || null; }
    async find(entity, predicate) { return (await this.list(entity)).filter(predicate); }
    async create(entity, data) {
      if (!this.db[entity]) this.db[entity] = {};
      const id = data.id || data[`${entity.slice(0,1).toUpperCase()}${entity.slice(1)}ID`] || `${entity}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const rec = {
        ...data,
        id,
        CreatedAt: data.CreatedAt || new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      };
      this.db[entity][id] = rec;
      this._save();
      this.emit(`${entity}:created`, rec);
      this.emit("change", { entity, action: "create", id, record: rec });
      return rec;
    }
    async update(entity, id, patch) {
      const prev = this.db[entity]?.[id];
      if (!prev) return null;
      const rec = { ...prev, ...patch, UpdatedAt: new Date().toISOString(), id: prev.id };
      this.db[entity][id] = rec;
      this._save();
      this.emit(`${entity}:updated`, { before: prev, after: rec });
      this.emit("change", { entity, action: "update", id, record: rec });
      return rec;
    }
    async delete(entity, id) {
      const rec = this.db[entity]?.[id];
      if (!rec) return null;
      delete this.db[entity][id];
      this._save();
      this.emit(`${entity}:deleted`, rec);
      this.emit("change", { entity, action: "delete", id, record: rec });
      return rec;
    }
    async seed(initial) {
      // Fresh replace, preserving sequence counters.
      const oldSeq = this.db._meta?.seq || {};
      entities.forEach((e) => {
        this.db[e] = {};
        (initial?.[e] || []).forEach((r) => { this.db[e][r.id || r.AnimalID || Object.keys(this.db[e]).length] = r; });
      });
      this.db._meta = { seq: oldSeq, ...(initial?._meta || {}) };
      this._save();
      this.emit("seeded", {});
      return true;
    }
    async clear() { this.db = this._default(); this._save(); this.emit("cleared", {}); return true; }
    async exportRaw() { return JSON.parse(JSON.stringify(this.db)); }
  }

  return MockAdapter;
})();
