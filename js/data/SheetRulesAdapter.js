JF.Data = JF.Data || {};

/**
 * SheetRulesAdapter - talks to the farm's Google Apps Script web app.
 *
 * The HYBRID split: MongoDB holds the farm DATA (animals, milk, expenses...),
 * while a Google Spreadsheet is the easy-to-edit RULE/ADMIN system. This
 * adapter serves ONLY the three rule entities - Rules, Rule_Parameters,
 * Rule_Overrides - which live as three tabs the owner can edit like a
 * spreadsheet. Store.js routes those entities here; everything else keeps
 * going to the data backend.
 *
 *   POST {sheetUrl}  { action, payload, token }  ->  { success, data | error }
 *   Actions: ping | verify | list | get | create | update | delete | seedRules
 *
 * Graceful layers:
 *   - Sheet URL configured  -> the three tabs ARE the rulebook (source of truth).
 *   - No URL (stub mode)    -> every call falls through to the data adapter
 *     (MongoDB/mock), so rule toggles keep persisting exactly as before and
 *     connecting a sheet later simply lifts the rows into the cloud.
 */
JF.Data.SheetRulesAdapter = (function () {

  const RULE_ENTITIES = ["rules", "ruleParameters", "ruleOverrides"];

  class SheetRulesAdapter extends JF.Data.MongoApiAdapter {
    /**
     * @param {object} fallback data adapter used while no sheet URL is set
     *        (usually the MockAdapter instance the store was opened with).
     */
    constructor(fallback = null) {
      super();
      this.fallback = fallback;
      const stored = (() => { try { return localStorage.getItem("jf_rules_endpoint"); } catch (e) { return null; } })();
      this.endpoint = stored || "";
      this.token = (() => { try { return localStorage.getItem("jf_rules_token") || ""; } catch (e) { return ""; } })();
      this.lastStatus = null;
      this.isPlaceholder = !this._isRealEndpoint();
    }

    configure({ endpoint, token } = {}) {
      if (endpoint !== undefined) { this.endpoint = endpoint; try { localStorage.setItem("jf_rules_endpoint", endpoint); } catch (e) {} }
      if (token !== undefined) { this.token = token; try { localStorage.setItem("jf_rules_token", token); } catch (e) {} }
      this.isPlaceholder = !this._isRealEndpoint();
    }

    _live() { return this._isRealEndpoint(); }
    _fb() { return this.fallback || null; }

    async _call(action, payload = {}) {
      try {
        const res = await fetch(this.endpoint, {
          method: "POST",
          redirect: "follow", // Apps Script redirects to googleusercontent.com
          headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight Apps Script cannot answer
          body: JSON.stringify({ action, payload, token: this.token || "" }),
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); }
        catch (parseErr) {
          if (/<\s*(!doctype|html|body)/i.test(text)) throw new Error("The rulebook URL answered with a web page instead of JSON - paste the /exec URL of the Apps Script Web app deployment.");
          throw new Error("The rulebook URL answered with something the app cannot read (status " + res.status + ").");
        }
        if (!json.success) throw new Error(json.error || "Rulebook sheet call failed");
        return json.data;
      } catch (err) {
        console.error(`[SheetRules:${action}]`, err);
        throw err;
      }
    }

    /* ---------------- entity CRUD (with data-store fallback) ---------------- */

    async list(entity) {
      if (!RULE_ENTITIES.includes(entity)) return [];
      if (!this._live()) return this._fb() ? this._fb().list(entity) : [];
      return this._call("list", { entity }) || [];
    }

    async get(entity, id) {
      if (!RULE_ENTITIES.includes(entity)) return null;
      if (!this._live()) return this._fb() ? this._fb().get(entity, id) : null;
      return this._call("get", { entity, id });
    }

    async create(entity, data) {
      if (!RULE_ENTITIES.includes(entity)) throw new Error(`${entity} lives in the farm database, not the rulebook sheet`);
      if (!this._live()) {
        const r = await this._fb().create(entity, data);
        this.emit(`${entity}:created`, r); this.emit("change", { entity, action: "create", record: r });
        return r;
      }
      const r = await this._call("create", { entity, data });
      this.emit(`${entity}:created`, r);
      this.emit("change", { entity, action: "create", record: r });
      return r;
    }

    async update(entity, id, patch) {
      if (!RULE_ENTITIES.includes(entity)) throw new Error(`${entity} lives in the farm database, not the rulebook sheet`);
      if (!this._live()) {
        const r = await this._fb().update(entity, id, patch);
        this.emit(`${entity}:updated`, r); this.emit("change", { entity, action: "update", id, record: r });
        return r;
      }
      const r = await this._call("update", { entity, id, patch });
      this.emit(`${entity}:updated`, r);
      this.emit("change", { entity, action: "update", id, record: r });
      return r;
    }

    async delete(entity, id) {
      if (!RULE_ENTITIES.includes(entity)) throw new Error(`${entity} lives in the farm database, not the rulebook sheet`);
      if (!this._live()) {
        const r = await this._fb().delete(entity, id);
        this.emit(`${entity}:deleted`, r); this.emit("change", { entity, action: "delete", id });
        return r;
      }
      const r = await this._call("delete", { entity, id });
      this.emit(`${entity}:deleted`, r);
      this.emit("change", { entity, action: "delete", id });
      return r;
    }

    /** Install the built-in rulebook into the sheet's three tabs (upsert mode). */
    async seedRules(book) {
      const src = book || (JF.RuleBook && JF.RuleBook.seedPayload()) || {};
      const body = {
        rules: src.rules || [],
        params: src.ruleParameters || src.params || src.parameters || [],
        overrides: src.overrides || [],
        upsert: true,
      };
      if (!this._live()) return this._fb().seedRules ? this._fb().seedRules(body) : {};
      return this._call("seedRules", body);
    }

    async syncRules(book) { return this.seedRules(book); }

    /* ------------------------------ diagnostics ----------------------------- */

    /** Ping the rulebook sheet: document name + row counts per tab. */
    async testConnection() {
      if (!this._live()) throw new Error("No Rulebook Google Sheet URL configured yet. Create the sheet (see RULEBOOK-SHEET-SETUP.md) and paste its /exec URL.");
      const status = await this._call("ping");
      this.lastStatus = status;
      return status;
    }

    /** Write/read round trip inside the sheet's Admin tab. */
    async verify() {
      if (!this._live()) throw new Error("Configure the Rulebook Google Sheet URL first.");
      const res = await this._call("verify");
      this.lastStatus = res;
      return res;
    }

    /** Backups and file storage stay with the farm data in MongoDB. */
    async exportBackup() { throw new Error("Backup is served by the MongoDB farm API, not the rulebook sheet."); }
    async uploadFile() { throw new Error("Files upload to the MongoDB farm API, not the rulebook sheet."); }
  }

  return SheetRulesAdapter;
})();
