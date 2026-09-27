/**
 * Jagt Farm — Rulebook Console (Google Apps Script)
 *
 * The HYBRID split the farm asked for:
 *   • MongoDB (farm API on Render) holds the farm DATA: animals, heat, milk,
 *     expenses, reminders, photos… — the things the app writes all day.
 *   • THIS spreadsheet is the easy-to-edit RULE/ADMIN system: three tabs the
 *     owner can open like a spreadsheet — Rules, Rule_Parameters,
 *     Rule_Overrides — while the website reads/writes them live.
 *
 * SETUP (3 minutes): see RULEBOOK-SHEET-SETUP.md in the repo.
 *   1. Create a Google Spreadsheet → Extensions → Apps Script → paste this file.
 *   2. Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone.
 *   3. Copy the /exec URL into the website: Settings → Rulebook Google Sheet URL.
 *
 * PROTOCOL (same envelope as the farm API):
 *   POST { action, payload, token }  ->  { success, data | error }
 *   Actions: ping | verify | list | get | create | update | delete |
 *            seedRules | clear        (rule entities only)
 *   Reads also work as GET ?action=ping etc, so the URL can be checked in a browser.
 */

// Optional shared secret. Leave '' while testing; when set, the website must
// send the same token (Settings → Rulebook token).
const TOKEN = '';

const ENTITY_TABS = {
  rules: 'Rules',
  ruleParameters: 'Rule_Parameters',
  ruleOverrides: 'Rule_Overrides',
};
const KEY_COLUMNS = {
  rules: 'RuleID',
  ruleParameters: 'ParameterID',
  ruleOverrides: 'OverrideID',
};
const HEADERS = {
  Rules: [
    'RuleID', 'Active', 'Category', 'RuleName', 'AppliesTo', 'TriggerEvent',
    'Condition', 'StartAfter', 'EndAfter', 'Interval', 'ReminderBefore',
    'ActionType', 'Action', 'Priority', 'DataRequired', 'DefaultValue', 'Unit',
    'ParamID', 'SourceType', 'Source', 'Configurable', 'VetOverride', 'Notes',
  ],
  Rule_Parameters: ['ParameterID', 'Parameter', 'Value', 'Unit', 'Active', 'Notes'],
  Rule_Overrides: [
    'OverrideID', 'RuleID', 'AnimalID', 'Value', 'Unit', 'StartDate', 'EndDate',
    'Reason', 'ApprovedBy', 'Active',
  ],
};

function doGet(e) { return handle_(params_(e)); }

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (_) {}
  return handle_(Object.assign({}, e.parameter || {}, body));
}

function params_(e) { return Object.assign({}, (e && e.parameter) || {}); }

function J_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handle_(p) {
  const action = String(p.action || '');
  try {
    if (TOKEN && String(p.token || '') !== TOKEN) throw new Error('Invalid rulebook token');
    const payload = p.payload && typeof p.payload === 'object' ? p.payload : {};
    switch (action) {
      case 'ping': {
        return J_({ success: true, data: {
          status: 'online', backend: 'Google Sheets',
          document: SpreadsheetApp.getActiveSpreadsheet().getName(),
          rules: rowCount_('Rules'), ruleParameters: rowCount_('Rule_Parameters'),
          ruleOverrides: rowCount_('Rule_Overrides'),
          time: new Date().toISOString(),
        } });
      }
      case 'verify': return J_({ success: true, data: verify_() });
      case 'list': {
        return J_({ success: true, data: readRows_(tab_(String(p.entity || payload.entity || ''))) });
      }
      case 'get': {
        const entity = String(p.entity || payload.entity || '');
        const id = String(p.id || payload.id || '');
        const row = readRows_(tab_(entity)).find((r) => String(r.id) === id) || null;
        return J_({ success: true, data: row });
      }
      case 'create': {
        const entity = String(p.entity || payload.entity || '');
        return J_({ success: true, data: upsert_(entity, payload.data || {}) });
      }
      case 'update': {
        const entity = String(p.entity || payload.entity || '');
        const id = String(p.id || payload.id || '');
        return J_({ success: true, data: upsert_(entity, Object.assign({}, payload.patch || {}, { id: id })) });
      }
      case 'delete': {
        const entity = String(p.entity || payload.entity || '');
        return J_({ success: true, data: deleteRow_(entity, String(p.id || payload.id || '')) });
      }
      case 'seedRules': {
        return J_({ success: true, data: seedRules_(payload, truthy_(payload.upsert)) });
      }
      case 'clear': {
        for (const tab of Object.values(ENTITY_TABS)) clearTab_(tab);
        return J_({ success: true, data: { cleared: true } });
      }
      default:
        return J_({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return J_({ success: false, error: String((err && err.message) || err) });
  }
}

function truthy_(v) {
  return v === true || v === 1 || /^(true|yes|1)$/i.test(String(v == null ? '' : v));
}

/* ------------------------------------------------------------------ */
/* Tab plumbing                                                        */
/* ------------------------------------------------------------------ */

function tab_(entity) {
  const name = ENTITY_TABS[entity];
  if (!name) throw new Error('Unknown entity: ' + entity);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  const headers = HEADERS[name];
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  } else if (sh.getLastRow() < 1 || String(sh.getRange(1, 1).getValue()).trim() === '') {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
    .map((h) => String(h).trim()).filter(Boolean);
}

function readRows_(sh) {
  if (sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const headers = values[0].map((h) => String(h).trim()).filter(Boolean);
  const keyCol = KEY_COLUMNS[ENTITY_TABS[sh.getName()]] || 'id';
  const keyIdx = headers.indexOf(keyCol) >= 0 ? headers.indexOf(keyCol) : 0;
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const line = values[r];
    if (!line.some((c) => String(c).trim() !== '')) continue;
    if (String(line[keyIdx]).trim() === '') continue; // stray/blank key row
    const obj = {};
    headers.forEach((h, i) => { obj[h] = line[i]; });
    obj.id = line[keyIdx];
    rows.push(obj);
  }
  return rows;
}

/** Create-or-update one record by its key column; returns the stored record. */
function upsert_(entity, rec) {
  const sh = tab_(entity);
  const headers = headers_(sh);
  const key = KEY_COLUMNS[entity];
  const id = String(rec[key] != null ? rec[key] : (rec.id != null ? rec.id : '')).trim();
  if (!id) throw new Error(entity + ': missing ' + key);

  const values = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues() : [];
  const keyIdx = headers.indexOf(key);
  let rowNum = 0, existing = null;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][keyIdx >= 0 ? keyIdx : 0]).trim() === id) { rowNum = i + 2; existing = values[i]; break; }
  }

  const row = headers.map((h, i) => {
    if (h === key) return rec[key] != null ? rec[key] : id;
    if (rec[h] !== undefined) return rec[h];
    return existing ? existing[i] : '';
  });
  if (rowNum) sh.getRange(rowNum, 1, 1, headers.length).setValues([row]);
  else sh.appendRow(row);

  const stored = {};
  headers.forEach((h, i) => { stored[h] = row[i]; });
  stored.id = id;
  return stored;
}

function deleteRow_(entity, id) {
  const sh = tab_(entity);
  const headers = headers_(sh);
  const key = KEY_COLUMNS[entity];
  const keyIdx = headers.indexOf(key) >= 0 ? headers.indexOf(key) : 0;
  if (sh.getLastRow() < 2) return false;
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][keyIdx]).trim() === String(id).trim()) {
      sh.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

function seedRules_(payload, upsert) {
  const out = {
    rules: { added: 0, updated: 0 },
    parameters: { added: 0, updated: 0 },
    overrides: { added: 0, updated: 0 },
  };
  const put = (entity, rows, bucket) => {
    for (const row of rows || []) {
      if (!row) continue;
      const key = KEY_COLUMNS[entity];
      const id = String(row[key] != null ? row[key] : row.id || '').trim();
      if (!id) continue;
      const exists = readRows_(tab_(entity)).some((r) => String(r.id).trim() === id);
      if (exists && !upsert) continue;
      upsert_(entity, row);
      out[bucket][exists ? 'updated' : 'added']++;
    }
  };
  put('rules', payload.rules, 'rules');
  put('ruleParameters', payload.ruleParameters || payload.params || payload.parameters, 'parameters');
  put('ruleOverrides', payload.overrides, 'overrides');
  return out;
}

function verify_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Admin');
  if (!sh) { sh = ss.insertSheet('Admin'); sh.getRange(1, 1, 1, 3).setValues([['id', 'at', 'n']]); }
  const probe = { id: 'verify_probe', at: new Date().toISOString(), n: Math.random() };
  upsertAdmin_(sh, probe);
  const back = readAdmin_(sh).find((r) => r.id === 'verify_probe');
  const match = !!back && Number(back.n) === probe.n;
  return {
    ok: match, write: true, read: !!back,
    document: ss.getName(),
    at: probe.at,
    message: match ? 'Google Sheet write/read verified' : 'Google Sheet round-trip mismatch',
  };
}

function upsertAdmin_(sh, probe) {
  const rows = readAdmin_(sh);
  const idx = rows.findIndex((r) => r.id === probe.id);
  if (idx >= 0) sh.getRange(idx + 2, 1, 1, 3).setValues([[probe.id, probe.at, probe.n]]);
  else sh.appendRow([probe.id, probe.at, probe.n]);
}

function readAdmin_(sh) {
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter((r) => String(r[0]).trim())
    .map((r) => ({ id: r[0], at: r[1], n: Number(r[2]) }));
}

function rowCount_(tabName) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  return sh && sh.getLastRow() > 1 ? sh.getLastRow() - 1 : 0;
}

function clearTab_(tabName) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
}
