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
  console.info("[JF] MongoApiAdapter v3 — baked-in farm API + URL sanitizer active");

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
      this.isPlaceholder = true; // flips false once a real endpoint is configured
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
    }

    _isRealEndpoint() {
      const ep = String(this.endpoint || "");
      return !!ep && !/YOUR_API_URL|localhost-placeholder/i.test(ep);
    }

    async _call(action, payload = {}) {
      if (!this._isRealEndpoint()) {
        console.warn(`[MongoApi] Offline stub mode (${action}) - configure the farm API URL in Settings to go live.`);
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
        console.error(`[MongoApi:${action}]`, err);
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

    async list(entity) { return this._call("list", { entity }); }
    async get(entity, id) { return this._call("get", { entity, id }); }

    async create(entity, data) {
      const r = await this._call("create", { entity, data });
      this.emit(`${entity}:created`, r);
      this.emit("change", { entity, action: "create", record: r });
      return r;
    }

    async update(entity, id, patch) {
      const r = await this._call("update", { entity, id, patch });
      this.emit(`${entity}:updated`, r);
      this.emit("change", { entity, action: "update", id, record: r });
      return r;
    }

    async delete(entity, id) {
      const r = await this._call("delete", { entity, id });
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
