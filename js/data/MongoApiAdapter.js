JF.Data = JF.Data || {};

/**
 * MongoApiAdapter - talks to the farm's Node.js API (Express + MongoDB driver).
 *
 * The website is a static GitHub Pages client; MongoDB can only be reached
 * through a small server that holds the connection string. This adapter speaks
 * the SAME action protocol the app already uses, so every view, the rule engine
 * and the cascade layer work unchanged:
 *
 *   POST {endpoint}  { action, payload }   ->  { success, data | error }
 *
 * Actions: ping | list | get | create | update | delete | seed | clear |
 *          uploadFile | seedRules | syncRules | exportBackup
 *
 * One MongoDB collection per entity (animals, heat, rules, settings, ...),
 * mirroring the farm's record kinds so nothing is re-modelled.
 *
 * Offline/stub mode: until a real API URL is configured (Settings), calls
 * resolve with empty data instead of hitting the network - the app never
 * loses local data because of this, and PhotoUpload's backendLive() gate
 * keeps files on the device.
 */

JF.Data.MongoApiAdapter = (function () {
  const { Interface } = JF.Data.DataAdapter;
  console.info("[JF] MongoApiAdapter v4 — bootstrap batching + entity cache active");

  // Entities that an older server deployment (API v1.0.x) does not recognise.
  // While the capability probe reports an old server, these are served as
  // empty lists WITHOUT a request — no 400s in the console, no lag.
  const NEWER_ENTITIES = new Set(["insemination", "dryOff", "death", "groups"]);

  // Farm API defaults baked into the code, so every device connects with zero
  // setup. Settings can still override them (localStorage wins when present).
  const DEFAULT_ENDPOINT = "https://jagt-farm-api.onrender.com";
  const DEFAULT_TOKEN = "jagt-farm-secret-9271-kxnq";

  class MongoApiAdapter extends Interface {
    constructor() {
      super();
      // Only trust a stored endpoint that is a bare origin (https://host or
      // https://host/). Anything with a path tail means someone pasted the URL
      // and token into one field - ignore it and use the baked-in default.
      const stored = (() => { try { return localStorage.getItem("jf_api_endpoint"); } catch (e) { return null; } })();
      const clean = String(stored || "").trim();
      this.endpoint = /^https?:\/\/[^/]+\/?$/.test(clean) ? clean : DEFAULT_ENDPOINT;
      const storedTok = (() => { try { return localStorage.getItem("jf_api_token"); } catch (e) { return null; } })();
      this.token = storedTok != null ? storedTok : DEFAULT_TOKEN;
      this.listeners = new Map();
      this.lastStatus = null;
      // Real whenever the endpoint is usable (the baked-in default qualifies),
      // so homeOf() reports "mongo" and the boot log shows the true backend.
      this.isPlaceholder = !this._isRealEndpoint();
      // ---- Speed layer -------------------------------------------------
      // Render's free tier cold-starts after ~15 idle minutes, so every extra
      // round trip can cost seconds. The whole boot payload (rules, params,
      // animals, entries, reminders...) is fetched in ONE "bootstrap" call at
      // page load and served from a short-lived in-memory cache afterwards;
      // any write drops that entity's cache entry. A localStorage snapshot
      // per entity keeps the app usable when the API is unreachable.
      this._cache = new Map(); // entity -> { at, rows }
      this._cacheTTL = 30000; // 30s of instant navigation
      this._serverCapabilities = null; // set by warmup()'s version probe
    }

    _cacheGet(entity) {
      const c = this._cache.get(entity);
      if (!c) return null;
      if (Date.now() - c.at > this._cacheTTL) { this._cache.delete(entity); return null; }
      return c.rows.map((r) => ({ ...r })); // copies: callers may mutate freely
    }
    _cacheSet(entity, rows) { if (Array.isArray(rows)) this._cache.set(entity, { at: Date.now(), rows }); }
    _cacheDrop(entity) { this._cache.delete(entity); }
    _snapshot(entity, rows) { try { localStorage.setItem(`jf_snap_${entity}`, JSON.stringify(rows)); } catch (e) { /* quota — ignore */ } }
    _snapshotGet(entity) {
      try {
        const rows = JSON.parse(localStorage.getItem(`jf_snap_${entity}`) || "null");
        return Array.isArray(rows) ? rows.map((r) => ({ ...r })) : null;
      } catch (e) { return null; }
    }

    /**
     * Warm the server AND the cache with a single round trip. Called at page
     * parse time (fire and forget) so the Render cold start overlaps with
     * font/CSS/JS loading instead of blocking the first view.
     */
    async warmup() {
      try {
        // Version gate: ask GET / (always 200, never a console error) whether
        // this deployment knows the bootstrap action (1.1.0+). On an older
        // server we skip straight to the ping fallback — no 400 in the console.
        let supportsBootstrap = true;
        try {
          const res = await fetch(this.endpoint, { method: "GET" });
          const info = await res.json();
          const v = String(info?.data?.version || "1.0.0");
          supportsBootstrap = v.split(".").map(Number)[1] >= 1 || Number(v.split(".")[0]) > 1;
        } catch (e) { /* opaque — optimistically try bootstrap anyway */ }
        this._serverCapabilities = { bootstrap: supportsBootstrap };
        if (!supportsBootstrap) {
          await this._call("ping", {}, { quiet: true });
          return {};
        }
        const data = await this._call("bootstrap", {}, { quiet: true });
        if (data && typeof data === "object") {
          Object.entries(data).forEach(([entity, rows]) => {
            if (Array.isArray(rows)) { this._cacheSet(entity, rows); this._snapshot(entity, rows); }
          });
          console.info(`[JF] Bootstrap: ${Object.keys(data).length} collections fetched in ONE round trip.`);
        }
        return data;
      } catch (e) {
        // Old server without the bootstrap action? A successful ping still
        // proves the API is alive (return {} so the caller stays in mongo mode).
        try { await this._call("ping", {}, { quiet: true }); return {}; } catch (e2) { return null; }
      }
    }

    configure({ endpoint, token } = {}) {
      if (endpoint !== undefined) {
        // Store only bare origins; anything with a path tail (a URL+token paste)
        // is replaced by the baked-in default so it can never poison the app.
        const clean = String(endpoint || "").trim();
        this.endpoint = /^https?:\/\/[^/]+\/?$/.test(clean) ? clean : DEFAULT_ENDPOINT;
        try { localStorage.setItem("jf_api_endpoint", this.endpoint); } catch (e) {}
      }
      if (token !== undefined) { this.token = token; try { localStorage.setItem("jf_api_token", token); } catch (e) {} }
      this.isPlaceholder = !this._isRealEndpoint();
      this._serverCapabilities = null; // re-probe the (possibly new) server on next warmup
    }

    _isRealEndpoint() {
      const ep = String(this.endpoint || "");
      return !!ep && !/YOUR_API_URL|localhost-placeholder/i.test(ep);
    }

    async _call(action, payload = {}, { quiet = false } = {}) {
      if (!this._isRealEndpoint()) {
        if (!quiet) console.warn(`[MongoApi] Offline stub mode (${action}) - configure the farm API URL in Settings to go live.`);
        return this._fallback(action, payload);
      }
      try {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, payload, token: this.token || "" }),
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); }
        catch (parseErr) {
          if (/<\s*(!doctype|html|body)/i.test(text)) throw new Error("The API URL answered with a web page instead of JSON - check that it points at the farm API (e.g. https://jagt-api.onrender.com).");
          throw new Error("The API URL answered with something the app cannot read (status " + res.status + ").");
        }
        if (!json.success) throw new Error(json.error || "Farm API call failed");
        return json.data;
      } catch (err) {
        // Known, handled degradations (old server missing a newer entity/action)
        // get ONE short line — the call sites already cope, so a full stack
        // trace would be noise, not signal.
        if (/Unknown (entity|action)/i.test(String(err.message))) {
          console.warn(`[MongoApi:${action}] ${err.message} (older server deploy — the site degrades gracefully; redeploying the API removes this).`);
        } else if (!quiet) {
          console.error(`[MongoApi:${action}]`, err);
        }
        throw err;
      }
    }

    async _fallback(action, payload) {
      if (action === "list" || action === "listFiles") return [];
      if (action === "get") return null;
      if (action === "create") return { ...(payload?.data || {}), id: "offline_" + Date.now() };
      if (action === "update") return { ...(payload?.patch || {}) };
      if (action === "delete") return true;
      return null;
    }

    /** Ping the farm API: connection + collection counts. */
    async testConnection() {
      if (!this._isRealEndpoint()) throw new Error("No farm API URL configured yet. Deploy the Node API (server/) and paste its URL first.");
      const status = await this._call("ping");
      this.lastStatus = status;
      return status;
    }

    /** End-to-end health check: a real write/read/delete round trip in MongoDB. */
    async verify() {
      const res = await this._call("verify");
      this.lastStatus = res;
      return res;
    }

    on(evt, fn) {
      if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
      this.listeners.get(evt).add(fn);
    }

    emit(evt, p) { (this.listeners.get(evt) || []).forEach((fn) => fn(p)); }

    async list(entity) {
      // Old server deployment: entities it does not know are served as empty
      // straight away — no request, no 400, no console noise. The capability
      // flag refreshes on every boot (warmup), so redeploying the API simply
      // turns this branch off.
      if (this._serverCapabilities && !this._serverCapabilities.bootstrap && NEWER_ENTITIES.has(entity)) return [];
      const hit = this._cacheGet(entity);
      if (hit) return hit;
      try {
        const rows = await this._call("list", { entity });
        this._cacheSet(entity, rows);
        this._snapshot(entity, rows);
        return rows.map((r) => ({ ...r }));
      } catch (err) {
        // API unreachable (cold start timeout, network drop): serve the last
        // known rows so the farm stays readable. Writes will still fail —
        // exactly as before — but the screen is never blank.
        const snap = this._snapshotGet(entity);
        if (snap && snap.length) {
          console.warn(`[MongoApi:list] ${entity} unreachable — showing last-known snapshot (${snap.length} rows).`);
          return snap;
        }
        // "Unknown entity" = the server is older than the site code (needs a
        // Render redeploy). Log ONE short line instead of a full error stack —
        // the app already degrades gracefully on every call site.
        if (/Unknown entity/i.test(String(err.message))) {
          console.warn(`[MongoApi] server does not know "${entity}" yet (older deploy) — treating as empty.`);
          return [];
        }
        throw err;
      }
    }
    async get(entity, id) { return this._call("get", { entity, id }); }

    async create(entity, data) {
      const r = await this._call("create", { entity, data });
      this._cacheDrop(entity);
      this.emit(`${entity}:created`, r);
      this.emit("change", { entity, action: "create", record: r });
      return r;
    }

    async update(entity, id, patch) {
      const r = await this._call("update", { entity, id, patch });
      this._cacheDrop(entity);
      this.emit(`${entity}:updated`, r);
      this.emit("change", { entity, action: "update", id, record: r });
      return r;
    }

    async delete(entity, id) {
      const r = await this._call("delete", { entity, id });
      this._cacheDrop(entity);
      this.emit(`${entity}:deleted`, r);
      this.emit("change", { entity, action: "delete", id, record: r });
      return r;
    }

    async seed(data) { return this._call("seed", { data }); }

    /** Install the farm's default rulebook (upsert mode: edits are preserved). */
    async seedRules(book) {
      const src = book || (JF.RuleBook && JF.RuleBook.seedPayload()) || {};
      return this._call("seedRules", {
        rules: src.rules || [],
        params: src.ruleParameters || src.params || src.parameters || [],
        overrides: src.overrides || [],
        upsert: true,
      });
    }

    /** Push this device's full rule configuration into MongoDB (update mode). */
    async syncRules(book) { return this.seedRules(book); }

    /**
     * Upload a file (photo/document) to the farm API - stored in MongoDB
     * GridFS so image bytes live with the records they belong to.
     */
    async uploadFile({ dataUrl, animalId = "", kind = "Profile", category = "", fileName = "file", recordId = "" } = {}) {
      if (!dataUrl) throw new Error("No file data provided");
      const m = String(dataUrl).match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/);
      if (!m) throw new Error("File must be a base64 data URL");
      return this._call("uploadFile", { mimeType: m[1], base64: m[2], animalId, kind, category, recordId, fileName });
    }

    async exportBackup() { return this._call("exportBackup"); }
    async clear() { return this._call("clear", {}); }
  }

  return MongoApiAdapter;
})();
