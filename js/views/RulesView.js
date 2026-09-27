JF.Views = JF.Views || {};
JF.Views.Rules = (function () {
  const $ = () => document.getElementById("view-container");

  const SUB = {
    overview:   { label: "Rule Engine",        icon: "analytics" },
    rules:      { label: "Rules",              icon: "treatment" },
    parameters: { label: "Parameters",         icon: "settings" },
    overrides:  { label: "Animal Overrides",   icon: "heart" },
    quality:    { label: "Data Quality",       icon: "health" },
  };

  const subNav = (active) => {
    const row = JF.Utils.el("div", { class: "tabs", style: { marginBottom: "var(--space-5)" } });
    Object.entries(SUB).forEach(([id, meta]) => {
      row.appendChild(JF.Utils.el("a", {
        class: `tab ${id === active ? "is-active" : ""}`,
        href: `#rules/${id}`,
        html: `<span style="display:inline-flex;align-items:center;gap:6px;">${JF.Utils.svgIcon(meta.icon, 14, 14)} ${meta.label}</span>`,
      }));
    });
    return row;
  };

  // Same card markup as the rest of the app so it styles and stacks correctly.
  const stat = (label, value, tone = "") => JF.Utils.el("div", { class: "card card--stat" }, [
    JF.Utils.el("div", { class: `stat-icon ${tone}` , html: JF.Utils.svgIcon("analytics", 20, 20) }),
    JF.Utils.el("div", {}, [
      JF.Utils.el("div", { class: "stat-number" }, String(value)),
      JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, label),
    ]),
  ]);

  const msg = (div, text, tone) => { div.textContent = text; div.style.color = tone === "error" ? "var(--color-oxblood-700)" : "var(--color-success-700)"; };

  /* ------------------------------- overview ------------------------------- */

  const renderOverview = async () => {
    const s = JF.RuleEngine.stats();
    const wrap = JF.Utils.el("div", {});
    const status = JF.Utils.el("div", { class: "field__hint", style: "margin:10px 0" });

    wrap.appendChild(JF.Utils.el("div", { class: "grid grid--cols-4", style: "gap:12px" }, [
      stat("RULES", s.total),
      stat("ACTIVE", s.active, "stat-icon--success"),
      stat("PARAMETERS", s.params),
      stat("ANIMAL OVERRIDES", s.overrides),
    ]));

    wrap.appendChild(JF.Utils.el("div", { class: "card", style: "margin-top:16px" }, [
      JF.Utils.el("h3", { style: "margin:0 0 6px" }, "How this drives the farm"),
      JF.Utils.el("p", { class: "field__hint", style: "margin:0" },
        "Entries are saved (MongoDB through the farm API, or this device) → active rules are matched against the animal and its records → Rule_Parameters and any animal Rule_Overrides decide the real value → the engine produces reminders, calculations and alerts → they appear on the dashboard, the reminders list and the animal's timeline. Change a value in the database and the website follows, with no code change."),
      JF.Utils.el("div", { class: "field__hint", style: "margin-top:8px" },
        `Value layering: rule default < farm parameter < animal override.  Currently reading from: ${s.source}.`),
    ]));

    const run = (btn, fn) => async () => {
      const original = btn.textContent;
      btn.disabled = true; btn.textContent = "Working...";
      try { await fn(); } catch (e) { msg(status, e.message, "error"); }
      btn.disabled = false; btn.textContent = original;
    };

    // Persistence card: shows where the config is saved and lets the user push
    // this device's configuration into the database explicitly.
    const mirrorLine = JF.Utils.el("p", { class: "field__hint", style: "margin:0", id: "rules-mirror-status" }, "Checking where your rules are saved...");
    const pushBtn = JF.Utils.el("button", { class: "btn btn--accent btn--sm", type: "button" }, "⬆️ Push rules to MongoDB");
    pushBtn.onclick = run(pushBtn, async () => {
      const r = await JF.RuleEngine.syncFromMirror();
      msg(status, `Pushed your rule configuration to the database (~${r.rules} rule row(s), ~${r.params} parameter row(s) updated). Every device loads these on next load.`);
      JF.Toast.show("Rule configuration pushed to MongoDB.", "success");
      render(["overview"]);
    });
    wrap.appendChild(JF.Utils.el("div", { class: "card", style: "margin-top:16px" }, [
      JF.Utils.el("h3", { style: "margin:0 0 6px" }, "💾 Where your rules are saved"),
      JF.Utils.el("p", { class: "field__hint", style: "margin:0" },
        "Every toggle, lead time, parameter and override you change is written into MongoDB the moment you save it (Rules / Rule_Parameters / Rule_Overrides collections). After a refresh — or on your phone and PC together — the app loads the configuration back from the database, so MongoDB is the single home of your rules. Edits made directly in Atlas are picked up when you return to this tab, or with Reload from Database above."),
      mirrorLine,
      JF.Utils.el("div", { style: "margin-top:10px" }, [pushBtn]),
    ]));

    // No-backend fallback: export the whole rulebook as tab-separated text so the
    // owner can review/hold it anywhere. The database stays the live source.
    const tsvLine = JF.Utils.el("p", { class: "field__hint", style: "margin:6px 0 0", id: "rules-tsv-status" });
    const tsvBtn = JF.Utils.el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "📋 Copy rulebook (TSV)");
    tsvBtn.onclick = run(tsvBtn, async () => {
      const book = JF.RuleBook.seedPayload();
      const esc = (v) => {
        const s = v === null || v === undefined ? "" : String(v);
        const Q = String.fromCharCode(34);
        const bad = [String.fromCharCode(9), String.fromCharCode(10), String.fromCharCode(13), Q];
        const needs = bad.some((c) => s.indexOf(c) !== -1);
        return needs ? Q + s.split(Q).join(Q + Q) + Q : s;
      };
      const row = (headers, obj) => headers.map((h) => esc(obj[h])).join("\t");
      const rulesH = ["RuleID", "Active", "Category", "RuleName", "AppliesTo", "TriggerEvent", "Condition", "StartAfter", "EndAfter", "Interval", "ReminderBefore", "ActionType", "Action", "Priority", "DataRequired", "DefaultValue", "Unit", "ParamID", "SourceType", "Source", "Configurable", "VetOverride", "Notes"];
      const paramsH = ["ParameterID", "Parameter", "Value", "Unit", "Active", "Notes"];
      const rulesTsv = [rulesH.join("\t"), ...book.rules.map((r) => row(rulesH, r))].join("\n");
      const paramsTsv = [paramsH.join("\t"), ...(book.ruleParameters || book.params || []).map((p) => row(paramsH, p))].join("\n");
      const clip = ["=== Rules ===", rulesTsv, "", "=== Rule_Parameters ===", paramsTsv, "",
        "=== How to use ===",
        "This copy is for review or backup: paste into any spreadsheet to audit the rulebook.",
        "The live source of truth is MongoDB (Settings -> Farm API URL); the app reads rules from there when connected.",
      ].join("\n");
      try { await navigator.clipboard.writeText(clip); } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = clip; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e2) { /* clipboard blocked */ }
        document.body.removeChild(ta);
      }
      msg(tsvLine, "Copied the whole rulebook (85 rules + parameters) as spreadsheet text - paste anywhere to review or keep a backup.");
      JF.Toast.show("Rulebook copied to clipboard.", "success");
    });
    wrap.appendChild(JF.Utils.el("div", { class: "card", style: "margin-top:16px" }, [
      JF.Utils.el("h3", { style: "margin:0 0 6px" }, "📄 Export the rulebook"),
      JF.Utils.el("p", { class: "field__hint", style: "margin:0" },
        "Copy the complete rulebook (rules, parameters) as tab-separated text - open any spreadsheet and paste to review, print or back it up. The live source of truth is your MongoDB database, which the app reads whenever the farm API URL is configured in Settings."),
      JF.Utils.el("div", { style: "margin-top:10px" }, [tsvBtn]),
      tsvLine,
    ]));

    const installBtn = JF.Utils.el("button", { class: "btn btn--accent btn--sm", type: "button" }, "Install default rulebook");
    installBtn.onclick = run(installBtn, async () => {
      const res = await JF.RuleEngine.installDefaults();
      msg(status, `Installed ${res.rules} new rule(s) and ${res.params} parameter(s). Existing edits left untouched.`);
      render(["rules"]);
    });

    const reloadBtn = JF.Utils.el("button", { class: "btn btn--ghost btn--sm", type: "button" }, "Reload from Database");
    reloadBtn.onclick = run(reloadBtn, async () => {
      const r = await JF.RuleEngine.load();
      msg(status, `Loaded ${r.rules} rules, ${r.params} parameters, ${r.overrides} overrides from ${r.source}.`);
      render(["overview"]);
    });

    const evalBtn = JF.Utils.el("button", { class: "btn btn--primary btn--sm", type: "button" }, "Re-evaluate all animals");
    evalBtn.onclick = run(evalBtn, async () => {
      const r = await JF.RuleEngine.evaluateAll();
      msg(status, `${r.animals} animals evaluated — ${r.created} new, ${r.updated} recalculated, ${r.completed} completed.`);
      render(["overview"]);
    });

    const rebuildBtn = JF.Utils.el("button", { class: "btn btn--danger btn--sm", type: "button" }, "Rebuild reminders from entries");
    rebuildBtn.onclick = run(rebuildBtn, async () => {
      if (!confirm("Delete every existing reminder and regenerate them from the entries on file?\n\nThis removes manual reminders too.")) return;
      const r = await JF.RuleEngine.rebuild();
      msg(status, `Deleted ${r.removed} old reminder(s) and regenerated ${r.created} from ${r.animals} animals' entries.`);
      render(["overview"]);
    });

    wrap.appendChild(JF.Utils.el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:16px" }, [installBtn, reloadBtn, evalBtn, rebuildBtn]));
    wrap.appendChild(status);

    const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
    wrap.appendChild(JF.Utils.el("div", { class: "card", style: "margin-top:16px" }, [
      JF.Utils.el("h3", { style: "margin:0 0 10px" }, "Rules by category"),
      JF.Utils.el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" },
        cats.map(([c, n]) => JF.Utils.el("span", { class: "badge badge--info" }, `${c} · ${n}`))),
    ]));

    // Where is this device's configuration saved? (Connected mode: the backend is
    // the home; the local copy is a cache. Mock mode: this device IS the storage.)
    try {
      const backend = JF.Store.getConfig("backend") || "mock";
      const adapter = JF.Store.getAdapter();
      const live = backend !== "mock" && adapter && !adapter.isPlaceholder;
      const m = await JF.RuleEngine.mirrorStatus();
      if (mirrorLine) mirrorLine.textContent = live
        ? `Backend is LIVE — rules save to the Rules / Rule_Parameters / Rule_Overrides collections as you edit. Local device copy: ${m.rules} rule row(s), ${m.params} parameter row(s).`
        : `Offline/local mode — your edits persist on this device (${m.rules} rule row(s), ${m.params} parameter row(s) cached). Connect the backend in Settings to share them across devices.`;
    } catch (e) { if (mirrorLine) mirrorLine.textContent = ""; }
    return wrap;
  };

  /* -------------------------------- rules -------------------------------- */

  const renderRules = async () => {
    const wrap = JF.Utils.el("div", {});
    const all = JF.RuleEngine.listRules();
    let filter = "";
    const host = JF.Utils.el("div", {});

    const draw = () => {
      JF.Utils.clear(host);
      const rows = all.filter((r) => !filter || r.Category === filter);
      const byCat = {};
      rows.forEach((r) => { (byCat[r.Category || "Other"] ||= []).push(r); });
      Object.entries(byCat).forEach(([cat, list]) => {
        host.appendChild(JF.Utils.el("div", { class: "card", style: "margin-top:14px" }, [
          JF.Utils.el("h3", { style: "margin:0 0 8px" }, `${cat} (${list.length})`),
          JF.Utils.el("div", { class: "table-wrap" }, [
            JF.Utils.el("table", { class: "table" }, [
              JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, ["On", "Rule", "Trigger", "Value used", "Lead", "Priority", "Notes"].map((h) => JF.Utils.el("th", {}, h)))),
              JF.Utils.el("tbody", {}, list.map((r) => {
                const v = JF.RuleEngine.resolveValue(r.RuleID, "") || { value: r.DefaultValue, layer: "rule default", unit: r.Unit };
                const toggle = JF.Utils.el("input", { type: "checkbox", checked: r.Active });
                toggle.onchange = async () => {
                  await JF.RuleEngine.setRuleField(r.RuleID, "Active", toggle.checked);
                  JF.Toast.show(`${r.RuleID} ${toggle.checked ? "enabled" : "disabled"}.`, "success");
                };
                const lead = JF.Utils.el("input", { class: "input", type: "number", value: r.ReminderBefore, style: "width:72px" });
                lead.onchange = async () => { await JF.RuleEngine.setRuleField(r.RuleID, "ReminderBefore", Number(lead.value) || 0); JF.Toast.show(`${r.RuleID} lead time saved.`, "success"); };
                return JF.Utils.el("tr", { style: r.Active ? "" : "opacity:.55" }, [
                  JF.Utils.el("td", {}, toggle),
                  JF.Utils.el("td", {}, [JF.Utils.el("div", { style: "font-weight:600" }, r.RuleName), JF.Utils.el("div", { class: "field__hint" }, r.RuleID)]),
                  JF.Utils.el("td", {}, `${r.TriggerEvent} → ${r.AppliesTo}`),
                  JF.Utils.el("td", {}, [JF.Utils.el("div", {}, `${v.value} ${v.unit || r.Unit || ""}`), JF.Utils.el("div", { class: "field__hint" }, r.ParamID ? r.ParamID : "rule default")]),
                  JF.Utils.el("td", {}, lead),
                  JF.Utils.el("td", {}, JF.Utils.el("span", { class: `badge ${r.Priority === "Critical" ? "badge--danger" : r.Priority === "High" ? "badge--warning" : "badge--info"}` }, r.Priority || "Normal")),
                  JF.Utils.el("td", { style: "max-width:280px" }, r.Notes || r.Action || ""),
                ]);
              })),
            ]),
          ]),
        ]));
      });
      if (!host.children.length) host.appendChild(JF.Utils.el("p", { class: "field__hint" }, "No rules installed yet — press Install default rulebook on the overview tab."));
    };

    const cats = [...new Set(all.map((r) => r.Category))].sort();
    const select = JF.Utils.el("select", { class: "select", style: "max-width:240px" },
      [JF.Utils.el("option", { value: "" }, "All categories")].concat(cats.map((c) => JF.Utils.el("option", { value: c }, c))));
    select.onchange = () => { filter = select.value; draw(); };
    wrap.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [select]));
    wrap.appendChild(JF.Utils.el("p", { class: "field__hint" }, "Turn a rule off to stop it generating new reminders (history is kept). Lead time is the number of days before the due date that the reminder appears. Every toggle and lead time is saved into the Rules sheet, so it survives refreshes and shows on your phone and PC alike."));
    wrap.appendChild(host);
    draw();
    return wrap;
  };

  /* ------------------------------ parameters ------------------------------ */

  const renderParameters = async () => {
    const wrap = JF.Utils.el("div", {});
    const list = JF.RuleEngine.listParams();
    const status = JF.Utils.el("div", { class: "field__hint", style: "margin:8px 0" });
    const table = JF.Utils.el("table", { class: "table" }, [
      JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, ["Parameter", "Value", "Unit", "Used by", "Notes"].map((h) => JF.Utils.el("th", {}, h)))),
      JF.Utils.el("tbody", {}, list.map((p) => {
        const input = JF.Utils.el("input", { class: "input", value: p.Value, style: "width:120px" });
        input.onchange = async () => {
          await JF.RuleEngine.setParamValue(p.ParameterID, input.value);
          msg(status, `${p.ParameterID} (${p.Parameter}) set to ${input.value} ${p.Unit}. New reminders of this type use it immediately.`);
        };
        const users = JF.RuleEngine.listRules().filter((r) => r.ParamID === p.ParameterID).map((r) => r.RuleID);
        return JF.Utils.el("tr", {}, [
          JF.Utils.el("td", {}, [JF.Utils.el("div", { style: "font-weight:600" }, p.Parameter), JF.Utils.el("div", { class: "field__hint" }, p.ParameterID)]),
          JF.Utils.el("td", {}, input),
          JF.Utils.el("td", {}, p.Unit || ""),
          JF.Utils.el("td", {}, users.length ? users.join(", ") : "—"),
          JF.Utils.el("td", { style: "max-width:320px" }, p.Notes || ""),
        ]);
      })),
    ]);
    wrap.appendChild(JF.Utils.el("p", { class: "field__hint" }, "These are the biological and farm-protocol values the rules read. Change 90 → 120 here (or in the Rule_Parameters sheet) and every rule using it follows, with no code change."));
    wrap.appendChild(status);
    wrap.appendChild(JF.Utils.el("div", { class: "table-wrap" }, [table]));
    return wrap;
  };

  /* ------------------------------- overrides ------------------------------ */

  const renderOverrides = async () => {
    const wrap = JF.Utils.el("div", {});
    let rows = [];
    try { rows = await JF.Store.ruleOverrides.list(); } catch (e) { rows = []; }
    const status = JF.Utils.el("div", { class: "field__hint", style: "margin:8px 0" });

    const ruleSel = JF.Utils.el("select", { class: "select" }, JF.RuleEngine.listRules().map((r) => JF.Utils.el("option", { value: r.RuleID }, `${r.RuleID} — ${r.RuleName}`)));
    const animalIn = JF.Utils.el("input", { class: "input", placeholder: "e.g. COW-005" });
    const valueIn = JF.Utils.el("input", { class: "input", type: "number", placeholder: "60" });
    const reasonIn = JF.Utils.el("input", { class: "input", placeholder: "Vet protocol / special case" });
    const byIn = JF.Utils.el("input", { class: "input", placeholder: "Approved by (Dr ...)" });

    const addBtn = JF.Utils.el("button", { class: "btn btn--accent btn--sm", type: "button" }, "Add override");
    addBtn.onclick = async () => {
      if (!animalIn.value.trim() || valueIn.value === "") { msg(status, "Animal ID and value are required.", "error"); return; }
      await JF.RuleEngine.addOverride({
        RuleID: ruleSel.value, AnimalID: animalIn.value.trim(), Value: valueIn.value,
        Reason: reasonIn.value.trim(), ApprovedBy: byIn.value.trim(),
      });
      msg(status, `Override saved: ${ruleSel.value} for ${animalIn.value} = ${valueIn.value} days.`);
      render(["overrides"]);
    };

    wrap.appendChild(JF.Utils.el("p", { class: "field__hint" },
      "A vet's instruction for one animal does not belong in the master rule. Add it here and the engine uses it for that animal only (most specific layer wins)."));
    wrap.appendChild(JF.Utils.el("div", { class: "grid grid--cols-2", style: "gap:10px" }, [ruleSel, animalIn, valueIn, reasonIn, byIn]));
    wrap.appendChild(JF.Utils.el("div", { style: "margin-top:10px" }, [addBtn]));
    wrap.appendChild(status);

    const table = JF.Utils.el("table", { class: "table" }, [
      JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, ["Override", "Rule", "Animal", "Value", "Reason", "Approved by", ""].map((h) => JF.Utils.el("th", {}, h)))),
      JF.Utils.el("tbody", {}, rows.map((o) => JF.Utils.el("tr", {}, [
        JF.Utils.el("td", {}, o.OverrideID || o.id),
        JF.Utils.el("td", {}, o.RuleID),
        JF.Utils.el("td", {}, o.AnimalID || "all"),
        JF.Utils.el("td", {}, `${o.Value} ${o.Unit || ""}`),
        JF.Utils.el("td", {}, o.Reason || ""),
        JF.Utils.el("td", {}, o.ApprovedBy || ""),
        JF.Utils.el("td", {}, JF.Utils.el("button", {
          class: "btn btn--ghost btn--sm", type: "button",
          onclick: async () => { await JF.RuleEngine.removeOverride(o.id); JF.Toast.show("Override removed everywhere (app + sheet).", "success"); render(["overrides"]); },
        }, "Delete")),
      ]))),
    ]);
    wrap.appendChild(JF.Utils.el("div", { class: "table-wrap", style: "margin-top:14px" }, [table]));
    if (!rows.length) wrap.appendChild(JF.Utils.el("p", { class: "field__hint" }, "No overrides yet."));
    return wrap;
  };

  /* -------------------------------- quality ------------------------------- */

  const renderQuality = async () => {
    const wrap = JF.Utils.el("div", {});
    const issues = await JF.RuleEngine.dataQuality();
    if (!issues.length) {
      wrap.appendChild(JF.Utils.el("div", { class: "card" }, [
        JF.Utils.el("h3", { style: "margin:0 0 6px" }, "✅ No data-quality problems found"),
        JF.Utils.el("p", { class: "field__hint", style: "margin:0" }, "Every active CHECK rule passed against the records on file."),
      ]));
      return wrap;
    }
    const table = JF.Utils.el("table", { class: "table" }, [
      JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, ["Severity", "Rule", "Animal", "Problem"].map((h) => JF.Utils.el("th", {}, h)))),
      JF.Utils.el("tbody", {}, issues.map((i) => JF.Utils.el("tr", {}, [
        JF.Utils.el("td", {}, JF.Utils.el("span", { class: `badge ${i.severity === "Critical" ? "badge--danger" : i.severity === "High" ? "badge--warning" : "badge--info"}` }, i.severity || "Normal")),
        JF.Utils.el("td", {}, i.rule),
        JF.Utils.el("td", {}, i.animal === "—" ? "—" : JF.Utils.el("a", { href: `#animal/${i.animal}/overview` }, i.animal)),
        JF.Utils.el("td", {}, i.issue),
      ]))),
    ]);
    wrap.appendChild(JF.Utils.el("p", { class: "field__hint" }, `${issues.length} data-quality finding(s) from the active CHECK rules. These never block a save - they point at records that need completing.`));
    wrap.appendChild(JF.Utils.el("div", { class: "table-wrap" }, [table]));
    return wrap;
  };

  const render = async (path = []) => {
    const root = $();
    const sub = path?.[1] || "overview";
    JF.Utils.clear(root);
    await JF.RuleEngine.ensureLoaded();

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "🧠 Rule engine"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, SUB[sub]?.label || "Rule Engine"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "The farm's own rules, stored in your MongoDB database: entries are matched against them to produce reminders, calculations and alerts."),
      ]),
    ]));
    page.appendChild(subNav(sub));

    let body;
    if (sub === "rules") body = await renderRules();
    else if (sub === "parameters") body = await renderParameters();
    else if (sub === "overrides") body = await renderOverrides();
    else if (sub === "quality") body = await renderQuality();
    else body = await renderOverview();

    page.appendChild(body);
    root.appendChild(page);
  };

  return { render };
})();
