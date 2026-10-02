window.JF = window.JF || {};

/**
 * RuleEngine - the farm's configurable rule engine.
 *
 * Flow (the architecture the farm asked for):
 *   ENTRY -> stored in MongoDB/local store
 *         -> active Rules matched against the animal + its own records
 *         -> Rule_Parameters and per-animal Rule_Overrides resolve the real value
 *         -> CALCULATION / REMINDER / ALERT produced
 *         -> shown on the dashboard, the reminders list and the animal timeline
 *
 * Everything is recomputed from real records, so the output is deterministic:
 * running it twice changes nothing, and "Rebuild reminders" reproduces exactly
 * the same set from the entries that exist. Nothing is stored as a guess:
 * every produced row is labelled FACT, CALCULATION or REMINDER.
 *
 * Value layering, most specific wins:
 *   rule DefaultValue  <  Rule_Parameters.Value  <  Rule_Overrides (per animal)
 *
 * Persistence (why edits survive a refresh on any device):
 *   Every edit (rule toggle, lead time, parameter value, override) is written
 *   THROUGH into the rulebook home - the three entities Rules / Rule_Parameters /
 *   Rule_Overrides, which the store routes to the Google Sheet rule console when
 *   its URL is configured (HYBRID: MongoDB holds the farm DATA, the Sheet holds
 *   the RULES), and to MongoDB/this device otherwise. Every device picks changes
 *   up on its next load (boot, or the moment the tab is refocused). On boot the
 *   stored rows are read FIRST and the built-in rulebook only fills rows the home
 *   has never seen - so the rulebook home, not the code, is the source of truth.
 */
JF.RuleEngine = (function () {

  const BOOK = () => JF.RuleBook;
  const today = () => JF.Utils.todayISO();
  const addDays = (d, n) => JF.Utils.formatDate(JF.Utils.addDays(d, n), "yyyy-MM-dd");

  let rules = [];
  let params = {};
  let overrides = [];
  let loadedAt = null;
  let loadSource = "defaults";
  const inflight = new Map();
  let bulkRunning = false; // a full rebuild is in progress: per-animal hooks must stand down

  const truthy = (v) => v === true || v === 1 || /^(true|yes|1|active)$/i.test(String(v == null ? "" : v));
  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

  /* ------------------------------------------------------------------ */
  /* Configuration loading                                               */
  /* ------------------------------------------------------------------ */

  /**
   * There is no secondary mirror: the store routes the three rule entities to
   * their home (Google Sheet when configured, else the data adapter), so one
   * write-through is the whole story. See Store.js makeComposite().
   */

  const load = async () => {
    const book = BOOK();
    // Built-in rulebook is the default LAYER; every row present in the rulebook
    // home (Google Sheet tabs, MongoDB collections or the device store) overrides
    // it. Partial installs and single-row edits therefore never drop the rest.
    const merge = (base, overlay, key) => {
      const map = new Map();
      base.forEach((x) => map.set(String(x[key]), { ...x }));
      (overlay || []).forEach((o) => {
        const k = String(o[key] || o.id || "");
        if (!k) return;
        map.set(k, { ...(map.get(k) || {}), ...o, [key]: o[key] || k });
      });
      return [...map.values()];
    };
    let sheetRules = 0, sheetParams = 0, autoInstalled = 0;
    try {
      // Each rule entity degrades independently: a 400 on one collection
      // (old server version, entity not deployed yet) must not fall back to
      // the built-in book and wipe the farm's own rule edits from view.
      const safeList = async (call) => { try { return await call; } catch (e) { console.warn("[RuleEngine] rule row list unavailable:", e.message); return []; } };
      const [rRows, pRows, oRows] = await Promise.all([
        safeList(JF.Store.rules.list()), safeList(JF.Store.ruleParameters.list()), safeList(JF.Store.ruleOverrides.list()),
      ]);
      // First connection: the rulebook home exists but is empty. Install the
      // built-in rulebook once, so the home (sheet tabs or database collections)
      // becomes the source of truth from day one and every later device boots
      // from the same rows. Bulk seed where available (sheet/Mongo), else one
      // create per row through the store.
      if (!(rRows || []).length && !(pRows || []).length) {
        try {
          // A remote backend with a bulk seed gets one server call; otherwise rows
          // are created one by one through the store.
          const ad = JF.Store.getAdapter();
          let res = null;
          if (ad && typeof ad.seedRules === "function") {
            const s = await ad.seedRules(BOOK().seedPayload());
            res = { rules: (s && s.rules && (s.rules.added || s.rules.updated)) || 0, params: (s && s.parameters && (s.parameters.added || s.parameters.updated)) || 0 };
          }
          // A home without a bulk seed (device store, or a cold sheet fallback)
          // reports zero counts: install row-by-row through the store instead.
          if (!res || (!res.rules && !res.params)) res = await installDefaults();
          autoInstalled = (res.rules || 0) + (res.params || 0);
          const [r2, p2] = await Promise.all([JF.Store.rules.list(), JF.Store.ruleParameters.list()]);
          rRows.splice(0, rRows.length, ...r2);
          pRows.splice(0, pRows.length, ...p2);
        } catch (e) { console.warn("[RuleEngine] auto-install into the database failed:", e.message); }
      }
      rules = merge(book.RULES, (rRows || []).map((x) => ({ ...x, Active: truthy(x.Active) })), "RuleID");
      sheetRules = (rRows || []).length;
      const mergedParams = merge(book.PARAMS, pRows || [], "ParameterID");
      params = Object.fromEntries(mergedParams.map((x) => [String(x.ParameterID), x]));
      sheetParams = (pRows || []).length;
      overrides = (oRows || []).filter((x) => truthy(x.Active));
    } catch (e) {
      console.warn("[RuleEngine] stored rule rows unreadable, using built-in rulebook:", e.message);
      rules = book.RULES.map((x) => ({ ...x }));
      params = book.paramMap();
      overrides = [];
    }
    const home = (JF.Store.homeOf && JF.Store.homeOf("rules")) || "device";
    const homeName = home === "sheet" ? "Google Sheet rulebook" : home === "mongo" ? "MongoDB" : "this device";
    loadSource = sheetRules || sheetParams
      ? `${homeName} (${sheetRules} rule rows, ${sheetParams} parameter rows) overriding the built-in rulebook`
      : "built-in rulebook";
    loadedAt = new Date().toISOString();
    return { rules: rules.length, params: Object.keys(params).length, overrides: overrides.length, source: loadSource, home, autoInstalled };
  };

  const ensureLoaded = async () => { if (!loadedAt) await load(); };

  /** Install the built-in rulebook into the sheets (only adds what is missing). */
  const installDefaults = async () => {
    const book = BOOK();
    const [rRows, pRows] = await Promise.all([JF.Store.rules.list(), JF.Store.ruleParameters.list()]);
    const have = new Set(rRows.map((x) => String(x.RuleID)));
    const haveP = new Set(pRows.map((x) => String(x.ParameterID)));
    let added = 0;
    const createdRules = [];
    for (const rule of book.RULES) {
      if (have.has(rule.RuleID)) continue;
      const rec = { ...rule, id: rule.RuleID };
      await JF.Store.rules.create(rec);
      createdRules.push(rec);
      added++;
    }
    let addedP = 0;
    for (const par of book.PARAMS) {
      if (haveP.has(par.ParameterID)) continue;
      await JF.Store.ruleParameters.create({ ...par, id: par.ParameterID });
      addedP++;
    }
    await load();
    await audit("install-rulebook", "Rules", "", `+${added} rules, +${addedP} parameters (persisted in the rulebook home)`);
    return { rules: added, params: addedP };
  };

  /* ------------------------------------------------------------------ */
  /* Value resolution: rule -> parameter -> animal override               */
  /* ------------------------------------------------------------------ */

  const paramRow = (id) => params[id] || BOOK().paramMap()[id] || null;

  const resolve = (rule, animalId) => {
    const paramId = rule.ParamID;
    let value = rule.DefaultValue;
    let layer = "rule default";
    let unit = rule.Unit || "Days";
    if (paramId) {
      const row = paramRow(paramId);
      if (row && String(row.Value) !== "" && row.Value != null) {
        value = row.Value; layer = "farm parameter " + paramId; unit = row.Unit || unit;
      }
    }
    const ov = overrides.find((o) => String(o.RuleID) === String(rule.RuleID)
      && (!o.AnimalID || norm(o.AnimalID) === norm(animalId))
      && (!o.StartDate || o.StartDate <= today()) && (!o.EndDate || o.EndDate >= today()));
    if (ov && String(ov.Value) !== "" && ov.Value != null) {
      value = ov.Value; layer = `animal override ${ov.OverrideID} (${ov.Reason || "vet protocol"})`; unit = ov.Unit || unit;
    }
    // List values (e.g. calving alert offsets) stay strings; numbers become numbers.
    const num = Number(value);
    return { value: Number.isFinite(num) && String(value).trim() !== "" && !/,/.test(String(value)) ? num : value, layer, unit, paramId: paramId || "" };
  };

  /* ------------------------------------------------------------------ */
  /* Per-animal context                                                  */
  /* ------------------------------------------------------------------ */

  const daysBetween = (a, b) => JF.Utils.daysBetween(a, b);
  const ageDays = (a) => (a.DateOfBirth ? daysBetween(a.DateOfBirth, today()) : NaN);

  const isFemale = (a) => norm(a.Gender || "Female") === "female";
  const hasCalved = (ctx) => ctx.calving.length > 0;
  const applies = (rule, ctx) => {
    const kind = norm(rule.AppliesTo);
    const a = ctx.animal;
    const age = ageDays(a);
    if (kind === "farm" || kind === "animal") return true;
    if (kind === "calf") return Number.isFinite(age) ? age <= 400 : norm(a.Category) === "calf";
    if (kind === "heifer") return norm(a.Category) === "heifer" || (isFemale(a) && Number.isFinite(age) && age > 365 && age <= 900 && !hasCalved(ctx));
    if (kind === "cow") return norm(a.Category) === "cow" || norm(a.CurrentStatus) === "lactating" || norm(a.CurrentStatus) === "dry" || hasCalved(ctx);
    // "Pregnant cow" also covers a cow that has been inseminated and has not calved
    // since - her calving date is an estimate (CALCULATION), not a recorded fact.
    if (kind === "pregnantcow") {
      if (norm(a.CurrentStatus) === "pregnant" || ctx.lastPositivePreg) return true;
      const lastAi = ctx.ai[ctx.ai.length - 1];
      if (!lastAi || ctx.withdrawn) return false;
      return !ctx.calving.some((c) => (c.Date || c.CalvingDate) > lastAi.Date);
    }
    return true;
  };

  const latest = (list, key) => list.filter((x) => x[key]).sort((x, y) => String(y[key]).localeCompare(String(x[key])))[0] || null;

  const buildContext = async (animal, cache) => {
    // One unreadable entity must not abort the whole sweep (e.g. an old server
    // version that does not know a newer entity yet): missing data degrades to
    // "no entries of that kind" instead of killing reminder generation.
    const load = async (store) => {
      if (cache[store]) return cache[store];
      try { cache[store] = await JF.Store[store].list(); }
      catch (e) {
        console.warn(`[RuleEngine] ${store} unavailable — evaluating without it.`, e.message);
        cache[store] = [];
        cache._degraded = true; // data is incomplete: stale-reminder cleanup must stand down
      }
      return cache[store];
    };
    const mine = (list, id) => list.filter((x) => x.AnimalID === animal.AnimalID || x.AnimalID === animal.id);
    const [heat, ai, preg, calving, health, deworming, vaccination, dryOff, purchases, sales, death] = await Promise.all([
      load("heat"), load("insemination"), load("pregnancy"), load("calving"), load("health"),
      load("deworming"), load("vaccination"), load("dryOff"), load("purchases"), load("sales"), load("death"),
    ]);
    const ctx = {
      animal,
      heat: mine(heat, "HeatDate").filter((x) => x.HeatDate).sort((a, b) => String(a.HeatDate).localeCompare(String(b.HeatDate))),
      ai: mine(ai, "Date").filter((x) => x.Date).sort((a, b) => String(a.Date).localeCompare(String(b.Date))),
      preg: mine(preg, "Date").filter((x) => x.Date).sort((a, b) => String(a.Date).localeCompare(String(b.Date))),
      calving: mine(calving, "Date").filter((x) => x.Date || x.CalvingDate).sort((a, b) => String(a.Date || a.CalvingDate).localeCompare(String(b.Date || b.CalvingDate))),
      health: mine(health, "Date").filter((x) => x.Date).sort((a, b) => String(a.Date).localeCompare(String(b.Date))),
      deworming: mine(deworming, "Date").filter((x) => x.Date).sort((a, b) => String(a.Date).localeCompare(String(b.Date))),
      vaccination: mine(vaccination, "DateGiven").filter((x) => x.DateGiven).sort((a, b) => String(a.DateGiven).localeCompare(String(b.DateGiven))),
      dryOff: mine(dryOff, "Date").filter((x) => x.Date).sort((a, b) => String(a.Date).localeCompare(String(b.Date))),
      sales: mine(sales, "Date").filter((x) => x.Date),
      death: mine(death, "Date").filter((x) => x.Date),
      purchases: mine(purchases, "PurchaseDate").filter((x) => x.PurchaseDate || x.Date),
    };
    ctx.lastPositivePreg = [...ctx.preg].reverse().find((p) => norm(p.Result) === "positive") || null;
    ctx.lastNegativePreg = [...ctx.preg].reverse().find((p) => norm(p.Result) === "negative") || null;
    ctx.withdrawn = norm(animal.CurrentStatus) === "sold" || norm(animal.CurrentStatus) === "deceased" || ctx.sales.length > 0 || ctx.death.length > 0;
    return ctx;
  };

  /* ------------------------------------------------------------------ */
  /* Specialised calculations (the "hard" rules)                         */
  /* ------------------------------------------------------------------ */

  const drugClass = (rec) => norm(rec.DrugClass || rec.ActiveIngredient || rec.Medicine || rec.Product || "");

  /** Rules whose due date does not follow the plain "trigger + offset" shape. */
  const SPECIAL = {
    // Deworming rotation: same class twice in a row.
    "DW-007": (ctx) => {
      const d = ctx.deworming; if (d.length < 2) return null;
      const [a, b] = [drugClass(d[d.length - 2]), drugClass(d[d.length - 1])];
      if (!a || a !== b) return null;
      return { due: today(), base: d[d.length - 1].Date, note: `Same drug class twice in a row (${b})` };
    },
    // Return to heat across episodes: AI then a new heat 18-24 days later.
    // The NEWEST heat after the AI wins: a later heat record supersedes any
    // earlier one (the farm sometimes records a suspected heat that turns out
    // to be another sign — the latest observation is the one to act on).
    "HE-022": (ctx) => {
      const ai = ctx.ai[ctx.ai.length - 1]; if (!ai) return null;
      const heat = [...ctx.heat].reverse().find((h) => h.HeatDate > ai.Date);
      if (!heat) return null;
      const gap = Math.abs(daysBetween(ai.Date, heat.HeatDate));
      if (gap < 17 || gap > 25) return null;
      return { due: today(), base: heat.HeatDate, note: `Heat ${gap} days after AI on ${ai.Date} - possible return to heat (not a diagnosis)`, priority: "High" };
    },
    // Abnormal cycle length.
    "HE-023": (ctx) => {
      const h = ctx.heat.map((x) => x.HeatDate); if (h.length < 2) return null;
      const gap = Math.abs(daysBetween(h[h.length - 2], h[h.length - 1]));
      if (gap >= 17 && gap <= 25) return null;
      return { due: today(), base: h[h.length - 1], note: `Last cycle was ${gap} days (normal 18-24)`, priority: "Normal" };
    },
    // Animal-specific average cycle.
    "HE-029": (ctx) => {
      const h = ctx.heat.map((x) => x.HeatDate); if (h.length < 3) return null;
      const gaps = [];
      for (let i = 1; i < h.length; i++) gaps.push(Math.abs(daysBetween(h[i - 1], h[i])));
      const avg = Math.round(gaps.reduce((s, x) => s + x, 0) / gaps.length);
      return { due: today(), base: h[h.length - 1], note: `Average cycle ${avg} days over ${gaps.length} intervals (${gaps.join(", ")})` };
    },
    // Calving interval + parity.
    "CL-018": (ctx) => {
      if (ctx.calving.length < 2) return null;
      const c = ctx.calving;
      const gap = Math.abs(daysBetween(c[c.length - 2].Date || c[c.length - 2].CalvingDate, c[c.length - 1].Date || c[c.length - 1].CalvingDate));
      return { due: today(), base: c[c.length - 1].Date, note: `Parity ${c.length}, calving interval ${gap} days` };
    },
    // Difficult calving history.
    "CL-020": (ctx) => {
      const hard = ctx.calving.filter((c) => /difficult|hard|assisted|complication/i.test(String(c.CalvingType || "") + String(c.Complications || "") + String(c.AssistanceRequired || "")));
      if (!hard.length) return null;
      return { due: today(), base: hard[hard.length - 1].Date, note: `${hard.length} difficult calving record(s) - observe closely`, priority: "Normal" };
    },
    // Repeated disease: same problem recorded twice or more.
    "HL-013": (ctx) => {
      const counts = {};
      ctx.health.forEach((h) => { const k = norm(h.Problem || h.Diagnosis); if (k) counts[k] = (counts[k] || 0) + 1; });
      const worst = Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])[0];
      if (!worst) return null;
      return { due: today(), base: ctx.health[ctx.health.length - 1].Date, note: `"${worst[0]}" recorded ${worst[1]} times - review chronic causes` };
    },
    // Treatment still open past the follow-up date.
    "HL-012": (ctx) => {
      const open = ctx.health.filter((h) => /open|under treatment|ongoing/i.test(String(h.RecoveryStatus || "")) && h.FollowUpDate && h.FollowUpDate < today());
      if (!open.length) return null;
      const h = open[open.length - 1];
      return { due: today(), base: h.FollowUpDate, note: `Treatment "${h.Problem || "open case"}" overdue since ${h.FollowUpDate}`, priority: "High" };
    },
    // Serious / chronic condition.
    "HL-019": (ctx) => {
      const chronic = ctx.health.filter((h) => /chronic|severe|critical/i.test(String(h.Diagnosis || "") + String(h.Notes || "")));
      if (!chronic.length) return null;
      return { due: today(), base: chronic[chronic.length - 1].Date, note: "Chronic or serious condition - veterinary review", priority: "Critical" };
    },
    // Withdrawal period from the recorded treatment.
    "MD-005": (ctx) => {
      const h = [...ctx.health].reverse().find((x) => Number(x.WithdrawalDays) > 0);
      if (!h) return null;
      const due = addDays(h.Date, Number(h.WithdrawalDays));
      if (due < today()) return null;
      return { due, base: h.Date, note: `Withdrawal ends ${due} (${h.WithdrawalDays} days, ${h.Medicine || "product"})`, priority: "High", doneWhen: null };
    },
    // Dry period too short / too long.
    "DR-003": (ctx) => {
      const d = ctx.dryOff[ctx.dryOff.length - 1];
      const cal = ctx.calving.find((c) => (c.Date || c.CalvingDate) > (d ? d.Date : ""));
      if (!d || !cal) return null;
      const len = Math.abs(daysBetween(d.Date, cal.Date || cal.CalvingDate));
      const min = Number(resolve({ RuleID: "DR-003", ParamID: "PARAM-005", DefaultValue: 40, Unit: "Days" }, ctx.animal.AnimalID).value);
      if (len >= min) return null;
      return { due: today(), base: d.Date, note: `Dry period was only ${len} days (minimum ${min})` };
    },
    "DR-004": (ctx) => {
      const d = ctx.dryOff[ctx.dryOff.length - 1];
      const cal = ctx.calving.find((c) => (c.Date || c.CalvingDate) > (d ? d.Date : ""));
      if (!d || !cal) return null;
      const len = Math.abs(daysBetween(d.Date, cal.Date || cal.CalvingDate));
      const max = Number(resolve({ RuleID: "DR-004", ParamID: "PARAM-007", DefaultValue: 60, Unit: "Days" }, ctx.animal.AnimalID).value);
      if (len <= max) return null;
      return { due: today(), base: d.Date, note: `Dry period was ${len} days (maximum ${max}) - review`, priority: "Low" };
    },
    // Pregnancy overdue.
    "PG-012": (ctx) => {
      const exp = expectedCalving(ctx);
      if (!exp || exp >= today()) return null;
      return { due: today(), base: exp, note: `Expected calving was ${exp} - veterinary review`, priority: "Critical" };
    },
    // Service period review: calved, still not re-bred.
    "HF-011B": (ctx) => {
      const c = ctx.calving[ctx.calving.length - 1]; if (!c) return null;
      const calved = c.Date || c.CalvingDate;
      const limit = Number(resolve({ RuleID: "HF-011B", ParamID: "PARAM-038", DefaultValue: 90 }, ctx.animal.AnimalID).value);
      const due = addDays(calved, limit);
      if (due > today()) return null;
      if (ctx.ai.some((x) => x.Date > calved)) return null;
      return { due: today(), base: calved, note: `${Math.abs(daysBetween(calved, today()))} days since calving and no insemination recorded`, priority: "Normal" };
    },
    // Dry-off review: driven by the expected calving date, so it also fires from an
    // insemination (estimated) and not only from a recorded positive pregnancy.
    "DR-001": (ctx) => {
      const exp = expectedCalving(ctx);
      if (!exp) return null;
      const target = Number(resolve({ RuleID: "DR-001", ParamID: "PARAM-006", DefaultValue: 50, Unit: "Days" }, ctx.animal.AnimalID).value);
      const due = addDays(exp, -target);
      return { due, base: exp, note: `Dry-off review: expected calving ${exp} minus ${target} days dry period = ${due}` };
    },
    // Health follow-up uses the scheduled date on the entry itself.
    "HL-009": (ctx) => {
      const h = [...ctx.health].reverse().find((x) => x.FollowUpDate);
      if (!h) return null;
      return { due: h.FollowUpDate, base: h.FollowUpDate, note: `Follow-up for "${h.Problem || "treatment"}" (scheduled ${h.FollowUpDate})`, done: ctx.health.some((x) => x.Date > h.FollowUpDate) };
    },
    // Withdrawal period: never invented, only read from the recorded entry.
    // Any other rule that carries a follow-up date is handled generically below.
  };

  /**
   * RM-019: which entry completes which reminder. Age-based care rules (calf
   * dewormer, vaccines, disbudding) are completed by the matching record, so
   * passing the entry clears the reminder instead of leaving it overdue forever.
   */
  const VACCINE_KEYS = [
    [/FMD|foot/i, /FMD|foot/i],
    [/brucell/i, /brucell/i],
    [/\bBQ\b|black ?quarter/i, /\bBQ\b|black ?quarter/i],
    [/\bHS\b|haemorrh|hemorrh/i, /\bHS\b|haemorrh|hemorrh/i],
    [/theiler/i, /theiler/i],
    [/anthrax/i, /anthrax/i],
  ];

  const completedFor = (rule, ctx) => {
    const cat = String(rule.Category || "");
    const trigger = String(rule.TriggerEvent || "").toUpperCase();
    // Age-based care rules (calf plan) are satisfied by "has a record yet".
    // Event-triggered repeating rules (routine deworming review, FMD revaccination)
    // do NOT work that way - they compute their own done-flag against the next due
    // date, so a single past entry must never complete the *next* review.
    const ageBased = trigger === "BIRTH" || trigger === "ANIMAL_CREATED";
    if (ageBased && cat === "Deworming") {
      const need = rule.RuleID === "DW-017B" ? 2 : 1;
      return ctx.deworming.filter((d) => d.Date).length >= need;
    }
    if (ageBased && cat === "Vaccination") {
      const hit = VACCINE_KEYS.find(([nameRe]) => nameRe.test(`${rule.RuleName} ${rule.Condition || ""}`));
      const list = hit ? ctx.vaccination.filter((v) => hit[1].test(String(v.Vaccine || ""))) : ctx.vaccination;
      return list.length > 0;
    }
    if ((ageBased || trigger === "DISBUDDING") && cat === "Disbudding") {
      return ctx.health.some((h) => /disbud|dehorn/i.test(String(h.Problem || "") + String(h.Treatment || "")));
    }
    if (rule.RuleID === "HE-025") {
      const h = ctx.heat[ctx.heat.length - 1];
      return !!h && ctx.ai.some((a) => a.Date > h.HeatDate);
    }
    if (rule.RuleID === "HE-005") {
      const h = ctx.heat[ctx.heat.length - 1];
      return !!h && h.HeatDate > addDays(today(), -3);
    }
    if (rule.RuleID === "AI-019") {
      const a = ctx.ai[ctx.ai.length - 1];
      return !!a && ctx.preg.some((p) => p.Date > a.Date);
    }
    if (rule.RuleID === "AN-006" || rule.RuleID === "CF-012") return /^https?:/.test(String(ctx.animal.PhotoURL || ""));
    if (rule.RuleID === "PU-005") return ctx.health.length > 0;
    return false;
  };

  /** Expected calving = positive pregnancy / AI + gestation (our best estimate). */
  const expectedCalving = (ctx) => {
    const src = ctx.lastPositivePreg || (ctx.ai.length ? ctx.ai[ctx.ai.length - 1] : null);
    if (!src) return null;
    const base = src.Date || src.InseminationDate;
    if (!base) return null;
    const gest = Number(resolve({ RuleID: "PG-008", ParamID: "PARAM-004", DefaultValue: 283, Unit: "Days" }, ctx.animal.AnimalID).value);
    return addDays(base, gest);
  };

  /* ------------------------------------------------------------------ */
  /* Generic due-date computation                                        */
  /* ------------------------------------------------------------------ */

  const TRIGGER_STORE = {
    BIRTH: null, ANIMAL_CREATED: null, DAILY: null, FARM: null,
    HEAT: "heat", AI: "ai", PREGNANCY_POSITIVE: "preg", PREGNANCY_NEGATIVE: "preg",
    PREGNANCY_RECHECK: "preg", CALVING: "calving", HEALTH: "health", TREATMENT: "health",
    DEWORMING: "deworming", VACCINATION: "vaccination", DRY_OFF: "dryOff",
    PURCHASE: "purchases", SALE: "sales", DEATH: "death", EXPENSE: null, DISBUDDING: "health",
  };

  const vaccinationMatches = (rec, cond) => {
    const m = /vaccine~(\w+)/i.exec(cond || "");
    if (!m) return true;
    return new RegExp(m[1], "i").test(String(rec.Vaccine || ""));
  };

  /** Compute the concrete due date for one rule on one animal (null = not applicable yet). */
  const compute = (rule, ctx, value) => {
    const custom = SPECIAL[rule.RuleID];
    if (custom) {
      const res = custom(ctx);
      if (!res) return null;
      return { due: res.due, base: res.base, note: res.note, priority: res.priority, triggerDate: res.base };
    }
    if (rule.RuleID === "PG-008" || rule.RuleID === "CL-002") {
      const exp = expectedCalving(ctx);
      if (!exp) return null;
      if (rule.RuleID === "PG-008") return { due: exp, base: exp, note: `Expected calving ${exp} (AI/pregnancy + ${value} days gestation)` };
      const offsets = String(resolve(rule, ctx.animal.AnimalID).value).split(",").map((x) => Number(String(x).trim())).filter((n) => Number.isFinite(n));
      const upcoming = offsets.map((d) => addDays(exp, -d)).filter((d) => d >= today()).sort();
      if (!upcoming.length) return null;
      return { due: upcoming[0], base: exp, note: `${offsets[offsets.length - 1]}-${offsets[0]} day pre-calving alerts (next ${upcoming[0]})` };
    }

    const trigger = String(rule.TriggerEvent || "").toUpperCase();
    const unit = String(rule.Unit || "Days").toLowerCase();
    let base = null;

    if (trigger === "BIRTH" || trigger === "ANIMAL_CREATED") {
      base = ctx.animal.DateOfBirth || (ctx.purchases[0] ? (ctx.purchases[0].PurchaseDate || ctx.purchases[0].Date) : null);
      if (!base) return null;
      if (unit === "age" || trigger === "BIRTH") {
        const due = addDays(base, Number(value) || 0);
        // Repeating age rule (e.g. growth review): use the last matching record.
        if (Number(rule.Interval) > 0 && rule.RuleID === "CF-018") {
          const last = ctx.deworming.concat(ctx.health).map((x) => x.Date).sort().pop();
          const step = Number(rule.Interval);
          let d = addDays(base, Number(value) || 0);
          while (d < today()) d = addDays(d, step);
          return { due: d, base, note: `Growth review (every ${step} days)${last ? `, last contact ${last}` : ""}` };
        }
        return { due, base, note: `${rule.RuleName} at ${value} ${unit} (age)` };
      }
    }

    if (trigger === "DISBUDDING") {
      const rec = ctx.health.filter((h) => /disbud|dehorn/i.test(String(h.Problem || "") + String(h.Treatment || "")));
      if (!rec.length) return null;
      base = rec[rec.length - 1].Date;
      return { due: addDays(base, Number(value) || 0), base, note: `${rule.RuleName} after the procedure on ${base}` };
    }

    const storeKey = TRIGGER_STORE[trigger];
    if (storeKey) {
      let list = ctx[storeKey] || [];
      if (trigger === "PREGNANCY_POSITIVE") list = list.filter((p) => norm(p.Result) === "positive");
      if (trigger === "PREGNANCY_NEGATIVE") list = list.filter((p) => norm(p.Result) === "negative");
      if (trigger === "PREGNANCY_RECHECK") list = list.filter((p) => norm(p.Result) === "recheck");
      if (trigger === "VACCINATION" && rule.Condition) list = list.filter((v) => vaccinationMatches(v, rule.Condition));
      const rec = list.length ? list[list.length - 1] : null;
      if (!rec) return null;
      base = rec.Date || rec.DateGiven || rec.HeatDate || rec.InseminationDate || rec.PurchaseDate || rec.CalvingDate;
      if (!base) return null;

      // Rules whose offset is a parameter (param may be an age or an interval).
      const offset = Number(value) || 0;
      let dueDate = addDays(base, offset);

      // Repeating rules (interval > 0): roll forward to the next future occurrence.
      const interval = Number(rule.Interval) || 0;
      if (interval > 0 && offset === 0) {
        dueDate = addDays(base, interval);
        while (dueDate < today()) dueDate = addDays(dueDate, interval);
      } else if (interval > 0 && offset > 0) {
        while (dueDate < today()) dueDate = addDays(dueDate, interval);
      }
      // Already satisfied by a later record of the same kind? then complete it.
      const done = list.some((x) => {
        const d = x.Date || x.DateGiven || x.HeatDate || x.InseminationDate;
        return d && d > base && d >= dueDate;
      });
      return { due: dueDate, base, note: `${rule.RuleName} - ${rule.TriggerEvent.toLowerCase()} ${base} + ${offset} ${unit}`.replace(/\s+/g, " "), done };
    }
    return null;
  };

  /* ------------------------------------------------------------------ */
  /* Data-quality checks (ActionType CHECK)                              */
  /* ------------------------------------------------------------------ */

  const runChecks = (rule, ctx) => {
    const a = ctx.animal; const out = [];
    const need = String(rule.DataRequired || "").split(",").map((x) => x.trim()).filter(Boolean);
    const futureDate = (d) => d && d > today();
    switch (rule.RuleID) {
      case "AN-019": case "DQ-003":
        need.forEach((f) => { if (!a[f]) out.push(`Missing ${f}`); });
        break;
      case "DQ-015": if (futureDate(a.DateOfBirth)) out.push("Date of birth is in the future"); break;
      case "CF-013": {
        const c = ctx.calving[ctx.calving.length - 1];
        if (c) { if (!c.CalfGender) out.push("Calf gender missing"); if (!c.CalfWeight) out.push("Calf weight missing"); }
        break;
      }
      case "CF-019": if (ctx.animal.Category === "Calf" && !ctx.health.some((h) => Number(h.Weight) > 0)) out.push("No weight recorded yet"); break;
      case "DQ-005": if (ctx.lastPositivePreg && !ctx.lastPositivePreg.InseminationID) out.push("Positive pregnancy without a linked insemination"); break;
      case "DQ-006": if (ctx.calving.length && !ctx.preg.length) out.push("Calving recorded with no pregnancy on file"); break;
      case "DQ-007": if (ctx.animal.Category === "Calf" && !a.MotherID) out.push("Calf has no mother linked"); break;
      case "DQ-008": if (ctx.ai.some((x) => !x.HeatRecordID)) out.push("Insemination without a heat record"); break;
      case "DW-012": case "MD-009":
        ctx.deworming.concat(ctx.health).forEach((rec) => {
          if (rec.Date && rec.Date >= addDays(today(), -120) && !Number(rec.WithdrawalDays)) out.push(`No withdrawal period for treatment on ${rec.Date}`);
        });
        break;
      case "DQ-019": if (norm(a.CurrentStatus) === "deceased" && (ctx.health.some((h) => h.Date > today()))) out.push("New record for a deceased animal"); break;
      case "DQ-020": if (norm(a.CurrentStatus) === "sold" && ctx.heat.some((h) => h.HeatDate > today())) out.push("Reproductive event on a sold animal"); break;
      case "VAC-020": {
        const age = ageDays(a);
        if (Number.isFinite(age) && age > 200 && !ctx.vaccination.length) out.push("No vaccination recorded");
        break;
      }
      case "PU-011": out.push("Vaccination history unknown for this purchased animal"); break;
      case "PU-013": out.push("Reproductive history unknown for this purchased animal"); break;
      default:
        need.forEach((f) => { if (!a[f]) out.push(`Missing ${f}`); });
    }
    return out;
  };

  /* ------------------------------------------------------------------ */
  /* Audit log                                                           */
  /* ------------------------------------------------------------------ */

  const audit = async (action, entity, recordId, details) => {
    try {
      await JF.Store.audit.create({
        AuditID: `AUD-${JF.Utils.uid("a")}`,
        Timestamp: new Date().toISOString(),
        Actor: "rule-engine",
        Action: action,
        Entity: entity || "",
        RecordID: recordId || "",
        Details: details || "",
      });
    } catch (e) { /* audit must never break the engine */ }
  };

  /* ------------------------------------------------------------------ */
  /* Evaluation                                                          */
  /* ------------------------------------------------------------------ */

  const statusFor = (due, completed) => {
    if (completed) return "Completed";
    const d = daysBetween(today(), due);
    if (d < 0) return "Overdue";
    if (d === 0) return "Due Today";
    return "Upcoming";
  };

  const reminderId = (rule, animalId) => `RMN-${rule.RuleID}-${animalId}`;

  const evaluateAnimal = (animalId, cache = {}) => {
    // While a full pass runs, individual evaluations would interleave and skew it.
    if (bulkRunning) return Promise.resolve({ created: 0, updated: 0, completed: 0, skipped: "bulk-run" });
    if (inflight.has(animalId)) return inflight.get(animalId);
    const p = evaluateAnimalInner(animalId, cache).finally(() => inflight.delete(animalId));
    inflight.set(animalId, p);
    return p;
  };

  const evaluateAnimalInner = async (animalId, cache) => {
    await ensureLoaded();
    const animals = cache.animals || (cache.animals = await JF.Store.animals.list());
    const animal = animals.find((x) => x.AnimalID === animalId || x.id === animalId);
    if (!animal) return { created: 0, completed: 0 };
    const ctx = await buildContext(animal, cache);
    const all = cache.allReminders || (cache.allReminders = await JF.Store.reminders.list());
    const mine = all.filter((r) => r.AnimalID === animal.AnimalID || r.AnimalID === animal.id);

    let created = 0, completed = 0, updated = 0;

    // Sold / deceased: close everything (RM-010, RM-011) and generate nothing.
    if (ctx.withdrawn) {
      for (const rem of mine) {
        if (rem.Status === "Completed") continue;
        await JF.Store.reminders.update(rem.id, { Status: "Completed", CompletedAt: today(), Notes: `${rem.Notes || ""} [closed: animal sold/deceased]`.trim() });
        completed++;
      }
      return { created, completed, updated };
    }

    for (const rule of rules) {
      const ruleId = String(rule.RuleID);
      const existing = mine.find((r) => String(r.RuleID) === ruleId);
      // RM-012/013: a disabled rule stops generating but its history is preserved.
      if (!rule.Active) continue;
      if (!applies(rule, ctx)) continue;
      if (String(rule.TriggerEvent).toUpperCase() === "DAILY" || String(rule.AppliesTo).toLowerCase() === "farm") continue;

      const valueInfo = resolve(rule, animal.AnimalID);
      const res = compute(rule, ctx, valueInfo.value);
      if (!res) {
        // Determinism: the engine no longer produces this rule for this animal
        // (its trigger entry was deleted, or a newer record supersedes it — e.g.
        // a NEW heat recorded before the next expected heat makes reminders
        // computed from the OLD heat obsolete). Close any open reminder it left
        // behind instead of letting a stale date dangle forever. Skipped when
        // entity data was unreadable this pass, so a network hiccup can never
        // close valid reminders.
        if (!cache._degraded && existing && existing.Status !== "Completed") {
          try {
            await JF.Store.reminders.update(existing.id, {
              Status: "Completed", CompletedAt: today(),
              Notes: `${existing.Notes || ""} [superseded: newer records changed this rule's outcome]`.trim(),
            });
            completed++;
          } catch (e) { /* keep going */ }
        }
        continue;
      }

      // CHECK rules are surfaced in the data-quality panel; STATUS / CREATE_EVENT
      // are carried out by the lifecycle + cascade layer (status changes, calf
      // creation, accounting) and are listed here for documentation only.
      const actionType = String(rule.ActionType).toUpperCase();
      if (actionType === "CHECK" || actionType === "STATUS" || actionType === "CREATE_EVENT") continue;

      const due = res.due;
      // EndAfter closes a rule's window (e.g. colostrum is only actionable for a
      // couple of days); without it a 3-year-old calf would show "overdue" for a
      // newborn task forever.
      const windowEnd = Number(rule.EndAfter);
      if (Number.isFinite(windowEnd) && windowEnd > 0 && addDays(due, windowEnd) < today()) continue;
      const lead = Number(rule.ReminderBefore) || 0;
      const remindOn = addDays(due, -lead);
      const payload = {
        ReminderID: reminderId(rule, animal.AnimalID),
        AnimalID: animal.AnimalID,
        RuleID: ruleId,
        ReminderType: rule.Title || rule.RuleName,
        ReferenceID: reminderId(rule, animal.AnimalID),
        DueDate: due,
        ReminderDate: remindOn,
        Time: null,
        Priority: res.priority || rule.Priority || "Normal",
        Status: statusFor(due, false),
        Kind: String(rule.ActionType).toUpperCase() === "CALCULATION" ? "CALCULATION" : "REMINDER",
        Group: rule.Category || "",
        Source: `${rule.Category} rule ${ruleId}`,
        ValueSource: valueInfo.layer,
        Notes: res.note || rule.Notes || rule.Action || "",
      };
      if (Number(rule.Interval) > 0 && rule.TriggerEvent !== "BIRTH") payload.RepeatEveryDays = Number(rule.Interval);
      if (res.done || completedFor(rule, ctx)) { payload.Status = "Completed"; payload.CompletedAt = payload.CompletedAt || today(); }

      const dup = mine.find((r) => String(r.RuleID) === ruleId && r.DueDate === due && String(r.id) !== String(existing?.id));
      const target = existing || dup || null;
      try {
        if (target) {
          const changed = ["DueDate", "ReminderDate", "Priority", "Status", "Notes", "ValueSource", "Kind"].some((k) => String(target[k] ?? "") !== String(payload[k] ?? ""));
          if (changed) { await JF.Store.reminders.update(target.id, payload); updated++; if (payload.Status === "Completed") completed++; }
        } else {
          await JF.Store.reminders.create(payload);
          created++;
        }
        // One open row per rule per animal is the contract (ReminderID is
        // deterministic). Any OTHER open row with this RuleID is a leftover
        // computed from an older record — e.g. a heat that a newer heat has
        // replaced — so it is superseded here instead of reappearing forever.
        for (const stale of mine) {
          if (String(stale.RuleID) !== ruleId || String(stale.id) === String(target?.id)) continue;
          if (stale.Status === "Completed") continue;
          await JF.Store.reminders.update(stale.id, {
            Status: "Completed", CompletedAt: today(),
            Notes: `${stale.Notes || ""} [superseded: newer records changed this reminder]`.trim(),
          });
          completed++;
        }
      } catch (e) { console.warn(`[RuleEngine] ${ruleId} ${animal.AnimalID}:`, e.message); }
    }

    if (created || updated) await audit("evaluate", "Animals", animal.AnimalID, `+${created} new, ~${updated} recalculated, ${completed} completed (rules: ${loadSource})`);
    return { created, completed, updated };
  };

  /** Recompute every animal from real records (no guard - internal). */
  const runAll = async () => {
    const cache = {};
    const animals = await JF.Store.animals.list();
    cache.animals = animals;
    cache.allReminders = await JF.Store.reminders.list();
    let created = 0, updated = 0, completed = 0;
    for (const a of animals) {
      const r = await evaluateAnimalInner(a.AnimalID || a.id, cache);
      created += r.created; updated += (r.updated || 0); completed += (r.completed || 0);
    }
    return { animals: animals.length, created, updated, completed };
  };

  /** Recompute every animal from real records. Idempotent by design. */
  const evaluateAll = async () => {
    if (bulkRunning) return { animals: 0, created: 0, updated: 0, completed: 0, skipped: "already-running" };
    await ensureLoaded();
    bulkRunning = true;
    try { return await runAll(); } finally { bulkRunning = false; }
  };

  /** Let evaluations that are already running finish before we touch their output. */
  const drain = async () => { await Promise.allSettled([...inflight.values()]); };

  /* ------------------------------------------------------------------ */
  /* Reminder lifecycle helpers                                          */
  /* ------------------------------------------------------------------ */

  const clearReminders = async ({ includeManual = true } = {}) => {
    await ensureLoaded();
    const all = await JF.Store.reminders.list();
    const isRule = (r) => !!(r.RuleID || String(r.ReferenceID || "").startsWith("RMN-") || String(r.ReminderID || "").startsWith("RMN-"));
    const doomed = includeManual ? all : all.filter(isRule);
    for (const r of doomed) { try { await JF.Store.reminders.delete(r.id); } catch (e) {} }
    await audit("clear-reminders", "Reminders", "", `deleted ${doomed.length} reminder(s)${includeManual ? "" : " (rule-generated only)"}`);
    return doomed.length;
  };

  /**
   * The "delete all previous reminders and rebuild from entries" action.
   * Atomic: per-animal hooks stand down, in-flight evaluations are drained, then
   * everything is deleted and regenerated in one pass - so the result is exactly
   * what the entries + rules say, every time.
   */
  const rebuild = async () => {
    if (bulkRunning) return { removed: 0, animals: 0, created: 0, updated: 0, completed: 0, skipped: "already-running" };
    bulkRunning = true;
    try {
      await drain();
      const removed = await clearReminders({ includeManual: true });
      const res = await runAll();
      await audit("rebuild-reminders", "Reminders", "", `cleared ${removed}, regenerated ${res.created} from ${res.animals} animals`);
      return { removed, ...res };
    } finally { bulkRunning = false; }
  };

  /* ------------------------------------------------------------------ */
  /* Explainability + reporting                                          */
  /* ------------------------------------------------------------------ */

  const explain = (reminder) => {
    const rule = rules.find((r) => String(r.RuleID) === String(reminder.RuleID));
    if (!rule) return { why: ["This reminder was created manually (no rule attached)."], kind: "MANUAL" };
    const v = resolve(rule, reminder.AnimalID);
    return {
      rule: { RuleID: rule.RuleID, RuleName: rule.RuleName, Category: rule.Category, TriggerEvent: rule.TriggerEvent, Action: rule.Action },
      value: `${v.value} ${v.unit}`,
      valueSource: reminder.ValueSource || v.layer,
      priority: rule.Priority,
      kind: reminder.Kind || "REMINDER",
      why: [
        `Rule ${rule.RuleID} (${rule.Category}) is ${rule.Active ? "active" : "DISABLED"}`,
        `Trigger: ${rule.TriggerEvent} on ${rule.AppliesTo}`,
        rule.ParamID ? `Value ${v.value} ${v.unit} from ${reminder.ValueSource || v.layer}` : `Value ${v.value} ${v.unit} from the rule default`,
        rule.ReminderBefore ? `Reminds ${rule.ReminderBefore} day(s) early` : "No lead time",
        rule.Notes || rule.Action,
        "Estimated values are labelled CALCULATION; recorded entries are FACT.",
      ].filter(Boolean),
    };
  };

  const dataQuality = async () => {
    await ensureLoaded();
    const cache = {};
    const animals = await JF.Store.animals.list();
    cache.animals = animals;
    const out = [];
    for (const rule of rules) {
      if (!rule.Active || String(rule.ActionType).toUpperCase() !== "CHECK") continue;
      if (String(rule.AppliesTo).toLowerCase() === "farm") {
        const expenses = await JF.Store.expenses.list();
        if (rule.RuleID === "DQ-024") expenses.filter((e) => !Number(e.Amount)).forEach((e) => out.push({ rule: rule.RuleID, animal: "—", severity: rule.Priority, issue: `Expense ${e.ExpenseID || e.id} has no amount` }));
        continue;
      }
      for (const a of animals) {
        const ctx = await buildContext(a, cache);
        if (!applies(rule, ctx)) continue;
        runChecks(rule, ctx).forEach((issue) => out.push({ rule: rule.RuleID, animal: a.AnimalID || a.id, severity: rule.Priority, issue }));
      }
    }
    return out;
  };

  /* ------------------------------------------------------------------ */
  /* Rule editing (write-through to the rulebook home)                 */
  /* ------------------------------------------------------------------ */

  /**
   * Every edit goes through the store, so it lands in the rulebook home - the
   * Google Sheet tabs when configured, otherwise MongoDB or the device store.
   * The engine reads through the same store, so it never talks to an adapter
   * directly (that would re-enter itself via the change events).
   */
  const setRuleField = async (ruleId, field, value) => {
    const rule = rules.find((r) => String(r.RuleID) === String(ruleId));
    if (!rule) return null;
    const rec = { ...rule, [field]: value, id: rule.RuleID };
    try {
      if (rule.id) await JF.Store.rules.update(rule.id, { [field]: value });
      else await JF.Store.rules.create(rec);
    } catch (e) { console.warn("[RuleEngine] rule write-through:", e.message); }
    rule[field] = value;
    await audit("rule-updated", "Rules", ruleId, `${field} = ${value}`);
    return rule;
  };

  const setParamValue = async (parameterId, value) => {
    const row = await JF.Store.ruleParameters.get(parameterId);
    if (row && row.id) await JF.Store.ruleParameters.update(row.id, { Value: value });
    else {
      const base = BOOK().paramMap()[parameterId] || { ParameterID: parameterId, Parameter: parameterId, Unit: "Days", Active: true, Notes: "" };
      await JF.Store.ruleParameters.create({ ...base, Value: value, id: parameterId });
    }
    await load();
    await audit("parameter-updated", "Rule_Parameters", parameterId, `= ${value}`);
    return true;
  };

  const addOverride = async ({ RuleID, AnimalID, Value, Unit = "Days", Reason = "", ApprovedBy = "" }) => {
    const rec = {
      OverrideID: `OV-${JF.Utils.uid("o")}`, RuleID, AnimalID, Value, Unit,
      StartDate: today(), EndDate: "", Reason, ApprovedBy, Active: true,
    };
    await JF.Store.ruleOverrides.create({ ...rec, id: rec.OverrideID });
    overrides.push(rec);
    await audit("override-added", "Rule_Overrides", rec.OverrideID, `${RuleID} for ${AnimalID} = ${Value} ${Unit}`);
    return rec;
  };

  /** Delete a per-animal override (lives in the rulebook home). */
  const removeOverride = async (overrideId) => {
    await JF.Store.ruleOverrides.delete(overrideId);
    await load();
    await audit("override-removed", "Rule_Overrides", overrideId, "deleted from the rulebook home");
    return true;
  };

  /**
   * Re-read the rule configuration from the store/database, dropping the cached
   * copy. Called when the tab is refocused so a second device's edits (or
   * your own edits from the phone) are picked up without a manual reload.
   * Throttled: tab-switching is frequent, and each unfocused reload costs
   * three database round trips.
   */
  let lastFocusLoad = 0;
  const FOCUS_THROTTLE_MS = 60000; // at most once per minute
  const focus = async () => {
    if (!loadedAt) return;
    if (Date.now() - lastFocusLoad < FOCUS_THROTTLE_MS) return;
    lastFocusLoad = Date.now();
    loadedAt = null;
    await load();
  };

  /**
   * Push this device's full rule configuration into the rulebook home (update
   * mode). Covers the reverse path of load(): rules edited while this device was
   * offline, or a rulebook shipped with a newer app version, reach the home here.
   * Existing rows are updated field-by-field; rows the payload does not carry are
   * kept - so a farm-wide Sheet edit and a device edit can both survive.
   */
  const listRules = () => rules.map((x) => ({ ...x }));
  const listParams = () => Object.values(params).map((x) => ({ ...x }));

  const syncFromMirror = async () => {
    await ensureLoaded();
    const rulesRows = listRules().map((x) => ({ ...x, Active: truthy(x.Active), id: x.RuleID }));
    const paramRows = listParams().map((x) => ({ ...x, id: x.ParameterID }));
    let out = { rules: 0, params: 0 };
    const ad = JF.Store.getAdapter();
    if (ad && typeof ad.syncRules === "function") {
      const res = await ad.syncRules({ rules: rulesRows, ruleParameters: paramRows, overrides: [] });
      out = { rules: (res && res.rules && (res.rules.added || res.rules.updated)) || 0, params: (res && res.parameters && (res.parameters.added || res.parameters.updated)) || 0 };
    }
    await load();
    await audit("sync-rules-to-home", "Rules", "", `pushed config: ~${out.rules} rule row(s), ~${out.params} parameter row(s) written`);
    return out;
  };

  /** Quick facts for the UI: where rules live and how rows are visible there. */
  const mirrorStatus = async () => {
    try {
      const [r, p] = await Promise.all([JF.Store.rules.list(), JF.Store.ruleParameters.list()]);
      const home = (JF.Store.homeOf && JF.Store.homeOf("rules")) || "device";
      return { home, rules: r.length, params: p.length };
    } catch (e) { return { home: "device", rules: 0, params: 0 }; }
  };

  const stats = () => ({
    total: rules.length,
    active: rules.filter((x) => x.Active).length,
    byCategory: rules.reduce((acc, r) => { const k = r.Category || "Other"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    params: Object.keys(params).length,
    overrides: overrides.length,
    source: loadSource,
    loadedAt,
  });

  const isEnabled = () => !!loadedAt && rules.length > 0;

  return {
    /**
     * Boot: load the rulebook, then recompute every reminder. The full sweep
     * writes one reminder per rule per animal and can cost dozens of round
     * trips, so it is SKIPPED when a sweep already ran recently (6 h) and
     * reminders exist — a fresh page load then costs nothing but one list.
     * Pass { forceEvaluate: true } to sweep regardless (Rules screen reload).
     */
    init: async ({ forceEvaluate = false } = {}) => {
      await load();
      let skip = false;
      if (!forceEvaluate) {
        try {
          const stamp = Number(localStorage.getItem("jf_last_eval") || 0);
          if (stamp && Date.now() - stamp < 6 * 3600 * 1000) {
            const existing = await JF.Store.reminders.list();
            if (existing.length) skip = true;
          }
        } catch (e) { /* storage unavailable — always evaluate */ }
      }
      if (skip) {
        console.info("[JF] Rule sweep skipped — reminders are current (evaluated < 6 h ago).");
      } else {
        await evaluateAll();
        try { localStorage.setItem("jf_last_eval", String(Date.now())); } catch (e) {}
      }
      return stats();
    },
    load, ensureLoaded, focus, installDefaults, syncFromMirror, mirrorStatus, evaluateAll, evaluateAnimal, clearReminders, rebuild,
    explain, dataQuality, setRuleField, setParamValue, addOverride, removeOverride, stats, isEnabled,
    listRules, listParams,
    resolveValue: (ruleId, animalId) => {
      const rule = rules.find((r) => String(r.RuleID) === String(ruleId));
      return rule ? resolve(rule, animalId) : null;
    },
  };
})();
