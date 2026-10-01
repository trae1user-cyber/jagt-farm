JF.Views = JF.Views || {};
JF.Views.Settings = (function () {
  const $ = () => document.getElementById("view-container");
  const SUB = {
    general:    { label: "General & Backend", icon: "settings" },
    repro:      { label: "Reproduction",      icon: "heart" },
    health:     { label: "Health Protocols",  icon: "health" },
    accounting: { label: "Accounting",        icon: "finance" },
  };

  const subNav = (active = "general") => {
    const row = JF.Utils.el("div", { class: "tabs", style: { marginBottom: "var(--space-5)" } });
    Object.entries(SUB).forEach(([k, v]) => {
      const a = JF.Utils.el("a", {
        class: `tab ${active === k ? "is-active" : ""}`,
        href: `#settings/${k}`,
        html: `<span style="display:inline-flex;align-items:center;gap:6px;">${JF.Utils.svgIcon(v.icon, 14, 14)} ${v.label}</span>`,
      });
      row.appendChild(a);
    });
    return row;
  };

  const fieldGroup = (eyebrow, title, fields) => JF.Utils.el("div", { class: "card", style: { marginBottom: "var(--space-5)" } }, [
    JF.Utils.el("div", { class: "card__header" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "card__eyebrow" }, eyebrow),
        JF.Utils.el("h3", { class: "section__title", style: { margin: 0 } }, title),
      ]),
    ]),
    JF.Utils.el("div", { class: "divider" }),
    JF.Utils.el("div", { class: "form-stack", style: { padding: "var(--space-4)" } }, fields),
  ]);

  /* ---------- Semen / technician availability editor ---------- */
  // Stored in the data store (MongoDB when connected) via the settings
  // entity, so the Heat Detective reads the same log on every device.
  const availabilityEditor = () => {
    const readAll = async () => { try { return JSON.parse(await JF.Store.settings.get("availability_log")?.value || "[]"); } catch (e) { return []; } };
    const writeAll = async (rows) => { await JF.Store.settings.set("availability_log", JSON.stringify(rows)); };
    const wrap = JF.Utils.el("div", { class: "avail-editor" });
    const redraw = async () => {
      JF.Utils.clear(wrap);
      const rows = await readAll();
      rows.forEach((r, i) => {
        wrap.appendChild(JF.Utils.el("div", { class: "avail-row" }, [
          JF.Utils.el("span", { class: `badge ${r.available ? "badge--success" : "badge--warning"}` }, r.type === "semen" ? "SEMEN" : "TECH"),
          JF.Utils.el("span", {}, `${r.available ? "Available" : "Unavailable"} · ${r.from || "?"} → ${r.to || "?"}`),
          JF.Utils.el("span", { class: "table__cell--muted", style: { flex: 1 } }, r.note || ""),
          JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: async () => { rows.splice(i, 1); await writeAll(rows); redraw(); } }, "Remove"),
        ]));
      });
      if (!rows.length) wrap.appendChild(JF.Utils.el("div", { class: "field__hint" }, "No availability gaps logged yet."));
    };
    const add = async () => {
      const type = document.getElementById("avail-type")?.value || "semen";
      const from = document.getElementById("avail-from")?.value;
      const to = document.getElementById("avail-to")?.value;
      const note = document.getElementById("avail-note")?.value?.trim() || "";
      if (!from || !to) { JF.Toast.show("Pick from and to dates first.", "warning"); return; }
      const rows = await readAll();
      rows.push({ type, available: document.getElementById("avail-state")?.value !== "no", from, to, note });
      await writeAll(rows); await redraw(); JF.Toast.show("Availability window logged.", "success");
    };
    const row = JF.Utils.el("div", { class: "avail-add" }, [
      JF.Utils.el("select", { class: "select", id: "avail-type" }, [
        JF.Utils.el("option", { value: "semen" }, "Semen stock"),
        JF.Utils.el("option", { value: "technician" }, "AI technician"),
      ]),
      JF.Utils.el("select", { class: "select", id: "avail-state" }, [
        JF.Utils.el("option", { value: "no" }, "Unavailable"),
        JF.Utils.el("option", { value: "yes" }, "Available"),
      ]),
      JF.Utils.el("input", { class: "input", type: "date", id: "avail-from" }),
      JF.Utils.el("input", { class: "input", type: "date", id: "avail-to" }),
      JF.Utils.el("input", { class: "input", id: "avail-note", placeholder: "Note (e.g. liquid N2 cylinder empty)" }),
      JF.Utils.el("button", { class: "btn btn--primary btn--sm", onclick: add }, "Add"),
    ]);
    redraw();
    return JF.Utils.el("div", {}, [row, wrap]);
  };

  const renderGeneral = (settingsMap) => {
    const currentBackend = JF.Store.getConfig("backend") || "mock";
    const currentEndpoint = JF.Store.getConfig("api_endpoint") || "";

    const backendSelect = JF.Utils.el("select", { class: "input", id: "cfg-backend" }, [
      JF.Utils.el("option", { value: "mock", selected: currentBackend === "mock" }, "This Device (LocalStorage - Offline Mode)"),
      JF.Utils.el("option", { value: "mongo", selected: currentBackend === "mongo" }, "MongoDB Farm API (Node.js server)"),
    ]);

    const endpointInput = JF.Utils.el("input", {
      class: "input",
      id: "cfg-api-endpoint",
      type: "url",
      placeholder: "https://jagt-farm-api.onrender.com",
      value: currentEndpoint
    });

    // Farm API token (MONGO_TOKEN set in Render) - stored separately from the URL.
    const tokenInput = JF.Utils.el("input", {
      class: "input",
      id: "cfg-api-token",
      type: "text",
      placeholder: "The MONGO_TOKEN value from Render (leave empty if none)",
      value: (() => { try { return localStorage.getItem("jf_api_token") || ""; } catch (e) { return ""; } })(),
      autocomplete: "off"
    });

    const livePill = JF.PhotoUpload.backendLive()
      ? JF.Utils.el("span", { class: "badge badge--success", style: "margin-left:8px" }, "LIVE - photos upload to the server")
      : JF.Utils.el("span", { class: "badge badge--info", style: "margin-left:8px" }, "Offline mode - photos stay on device");

    const statusBadge = JF.Utils.el("div", { id: "api-status", style: "margin-top:8px;font-size:var(--fs-sm);color:var(--color-ink-500)" });

    const testBtn = JF.Utils.el("button", {
      class: "btn btn--ghost btn--sm",
      type: "button",
      onclick: async () => {
        statusBadge.textContent = "⏳ Testing connection...";
        statusBadge.style.color = "var(--color-ink-500)";
        const url = endpointInput.value.trim();
        if (!url) {
          statusBadge.textContent = "❌ Please enter your farm API URL first (e.g. https://jagt-farm-api.onrender.com).";
          statusBadge.style.color = "var(--color-oxblood-700)";
          return;
        }
        try {
          const adapter = new JF.Data.MongoApiAdapter();
          adapter.configure({ endpoint: url, token: tokenInput.value.trim() });
          const ping = await adapter.testConnection();
          statusBadge.textContent = `✅ Connection Successful! MongoDB: ${ping?.database || "connected"}`;
          statusBadge.style.color = "var(--color-success-700)";
          JF.Toast?.show("Connected to the MongoDB farm API!", "success");
        } catch (err) {
          statusBadge.textContent = `❌ Connection failed: ${err.message}`;
          statusBadge.style.whiteSpace = "pre-line";
          statusBadge.style.color = "var(--color-oxblood-700)";
          JF.Toast?.show("Could not connect to the farm API URL.", "danger");
        }
      }
    }, "⚡ Test Connection");

    // Uploads THIS device's real records (never demo data) into MongoDB.
    const uploadLocalBtn = JF.Utils.el("button", {
      class: "btn btn--accent btn--sm",
      type: "button",
      onclick: async () => {
        const url = endpointInput.value.trim();
        if (!url) {
          JF.Toast?.show("Paste your farm API URL first.", "danger");
          return;
        }
        if (!confirm("Copy every record stored on this device into MongoDB?\n\nExisting records with the same id are kept as-is; nothing is deleted.")) return;
        statusBadge.textContent = "⏳ Reading this device's records...";
        statusBadge.style.color = "var(--color-ink-500)";
        try {
          const local = new JF.Data.MockAdapter();
          const dump = {};
          let total = 0;
          for (const entity of JF.Data.DataAdapter.entities) {
            const rows = await local.list(entity);
            if (rows.length) { dump[entity] = rows; total += rows.length; }
          }
          if (!total) { statusBadge.textContent = "This device has no records to upload yet."; return; }
          statusBadge.textContent = `⏳ Uploading ${total} records across ${Object.keys(dump).length} collections...`;
          const adapter = new JF.Data.MongoApiAdapter();
          adapter.configure({ endpoint: url, token: tokenInput.value.trim() });
          const res = await adapter.seed(dump);
          statusBadge.textContent = `✅ Uploaded ${res?.imported ?? total} records to MongoDB.`;
          statusBadge.style.color = "var(--color-success-700)";
          JF.Toast?.show("Farm data uploaded to MongoDB.", "success");
        } catch (err) {
          statusBadge.textContent = `❌ Upload failed: ${err.message}`;
          statusBadge.style.color = "var(--color-oxblood-700)";
        }
      }
    }, "📤 Upload This Device's Data to MongoDB");

    const verifyBtn = JF.Utils.el("button", {
      class: "btn btn--primary btn--sm",
      type: "button",
      onclick: async () => {
        const url = endpointInput.value.trim();
        if (!url) { JF.Toast?.show("Paste your farm API URL first.", "danger"); return; }
        statusBadge.textContent = "⏳ Checking MongoDB collections and a real write round trip...";
        statusBadge.style.color = "var(--color-ink-500)";
        try {
          const adapter = new JF.Data.MongoApiAdapter();
          adapter.configure({ endpoint: url, token: tokenInput.value.trim() });
          const r = await adapter.verify();
          const lines = (r.checks || []).map((c) => `${c.ok ? "✅" : "❌"} <b>${c.check}</b> — ${c.detail}`);
          statusBadge.innerHTML = `${r.ok ? "✅ Everything is wired up" : "⚠️ Some checks failed"} (${r.elapsedMs} ms)<br>${lines.join("<br>")}`;
          statusBadge.style.color = r.ok ? "var(--color-success-700)" : "var(--color-oxblood-700)";
          JF.Toast?.show(r.ok ? "MongoDB API verified." : "Verification found problems - see details.", r.ok ? "success" : "warning");
        } catch (err) {
          statusBadge.textContent = `❌ Verification failed: ${err.message}`;
          statusBadge.style.color = "var(--color-oxblood-700)";
        }
      }
    }, "🩺 Verify MongoDB API");

    const demoBtn = JF.Utils.el("button", {
      class: "btn btn--ghost btn--sm",
      type: "button",
      onclick: async () => {
        if (!confirm("Replace current data with the full demo farm (23 animals with sample history)?")) return;
        JF.Store.setConfig("demo_data", "1");
        JF.Store.forceReseed();
        setTimeout(() => location.reload(), 100);
      }
    }, "Load Demo Farm Data");

    return [
      fieldGroup("📊 ACTIVE BACKEND & MONGODB INTEGRATION", "Database & Storage Configuration", [
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Active Data Store"),
          backendSelect,
          JF.Utils.el("div", { class: "field__hint" }, "Choose whether the app runs offline on this device, or syncs live to your MongoDB database through the farm's Node.js API (hosted on Render)."),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Farm API Token"),
          tokenInput,
          JF.Utils.el("div", { class: "field__hint" }, "The MONGO_TOKEN value from Render > your service > Environment. Copy it exactly (use Render's copy icon). It is the password that lets this device use the API."),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Farm API URL (Node.js + MongoDB)"),
          endpointInput,
          livePill,
          JF.Utils.el("div", { class: "field__hint" }, "Deploy the server/ folder to Render and paste its URL here (e.g. https://jagt-farm-api.onrender.com). When live, entries save to MongoDB and animal photos upload straight to the server."),
          statusBadge
        ]),
        JF.Utils.el("div", { style: "display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;" }, [
          testBtn,
          verifyBtn,
        ]),
        JF.Utils.el("div", { style: "display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;" }, [
          uploadLocalBtn,
          demoBtn
        ]),
        JF.Utils.el("div", { class: "field__hint", style: "margin-top:10px" },
          "🔒 Data safety: there is no one-click erase in the app by design - your records belong in MongoDB (Atlas keeps continuous backups). Load Demo Farm replaces this device's data with the sample farm (it asks first)."),
        JF.Utils.el("div", { class: "field__hint", style: "margin-top:10px;color:var(--color-success-700)" },
          "💡 EVERYTHING LIVES IN MONGODB: farm data (animals, milk, expenses, photos) and the rulebook (Rules, Rule_Parameters, Rule_Overrides) are all stored in your MongoDB database. Edit rules on the Rules screen - changes save straight to the database and apply on every device."),
      ]),
      fieldGroup("🏠 FARM INFORMATION", "Farm & System Defaults", [
        JF.Utils.el("div", { class: "grid grid--cols-2" }, [
          JF.Utils.el("div", { class: "field" }, [
            JF.Utils.el("label", { class: "field__label" }, "Farm Name"),
            JF.Utils.el("input", { class: "input", id: "cfg-farm-name", value: settingsMap["farm_name"] || "Jagt Farm" }),
          ]),
          JF.Utils.el("div", { class: "field" }, [
            JF.Utils.el("label", { class: "field__label" }, "Currency Symbol"),
            JF.Utils.el("input", { class: "input", id: "cfg-currency", value: settingsMap["currency"] || "₹" }),
          ]),
        ])
      ])
    ];
  };

  const renderRepro = (settingsMap) => [
    fieldGroup("🕵 LOGISTICS AVAILABILITY", "Semen & Technician Availability Log", [
      JF.Utils.el("div", { class: "field__hint", style: { marginBottom: "var(--space-3)" } },
        "Log when semen or the AI technician was unavailable. The Heat Detective overlays these gaps on the biology timeline so you can see which heats were missed for farm reasons, not biology."),
      availabilityEditor(),
    ]),
    fieldGroup("🔄 HEAT CYCLE PARAMETERS", "Smart Heat & Gestation Intervals", [
      JF.Utils.el("div", { class: "grid grid--cols-3" }, [
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Expected Cycle Length (Days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-expected-cycle", value: settingsMap["ExpectedCycleLength"] || "21" }),
          JF.Utils.el("div", { class: "field__hint" }, "Standard cattle heat cycle (default 21 days)"),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Minimum Cycle Length (Days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-min-cycle", value: settingsMap["MinimumCycleLength"] || "18" }),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Maximum Cycle Length (Days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-max-cycle", value: settingsMap["MaximumCycleLength"] || "24" }),
        ]),
      ]),
      JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Heat Reminder Lead Time (Days Before)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-heat-lead", value: settingsMap["ReminderDaysBefore"] || "3" }),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Gestation Period (Days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-gestation", value: settingsMap["GestationDays"] || "283" }),
        ]),
      ])
    ])
  ];

  const renderHealth = (settingsMap) => [
    fieldGroup("🩺 PREVENTATIVE PROTOCOLS", "Deworming & Vaccination Intervals", [
      JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Standard Deworming Interval (Days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-deworm-int", value: settingsMap["DewormingIntervalDays"] || "90" }),
          JF.Utils.el("div", { class: "field__hint" }, "Default interval between routine dewormings (default 90 days)"),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Deworming Reminder Lead (Days Before)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-deworm-lead", value: settingsMap["DewormingReminderBefore"] || "7" }),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Vaccination Reminder Lead (Days Before)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-vax-lead", value: settingsMap["VaccinationReminderBefore"] || "7" }),
        ]),
      ]),
    ]),
    fieldGroup("BABY CALF CARE PLAN", "Automatic Reminders for Young Calves", [
      JF.Utils.el("div", { class: "field__hint", style: { marginBottom: "var(--space-3)" } },
        "When a calf is born (or you record its birth), these reminders are created automatically and tick themselves off as you record each dewormer or vaccine."),
      JF.Utils.el("div", { class: "grid grid--cols-3" }, [
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "First dewormer (age in days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-calf-deworm1", value: settingsMap["CalfFirstDewormAgeDays"] || "14" }),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Second dewormer (age in days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-calf-deworm2", value: settingsMap["CalfSecondDewormAgeDays"] || "45" }),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Remind me before (days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-calf-lead", value: settingsMap["CalfCareRemindLeadDays"] || "7" }),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "FMD vaccine (age in days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-calf-fmd", value: settingsMap["CalfFMDAgeDays"] || "90" }),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Brucellosis - females (age in days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-calf-bruc", value: settingsMap["CalfBrucellaAgeDays"] || "150" }),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "BQ & HS vaccines (age in days)"),
          JF.Utils.el("input", { class: "input", type: "number", id: "cfg-calf-bq", value: settingsMap["CalfBQAgeDays"] || "180" }),
        ]),
      ]),
    ])
  ];

  const renderAccounting = (settingsMap) => [
    fieldGroup("💰 FINANCIAL CONFIGURATION", "Accounting Preferences", [
      JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Financial Year Start Month"),
          JF.Utils.el("select", { class: "input", id: "cfg-fy-start" }, [
            JF.Utils.el("option", { value: "April", selected: (settingsMap["fy_start"] || "April") === "April" }, "April (FY Apr-Mar)"),
            JF.Utils.el("option", { value: "January", selected: settingsMap["fy_start"] === "January" }, "January (Calendar Year)"),
          ]),
        ]),
        JF.Utils.el("div", { class: "field" }, [
          JF.Utils.el("label", { class: "field__label" }, "Default Payment Account"),
          JF.Utils.el("select", { class: "input", id: "cfg-default-pay" }, [
            JF.Utils.el("option", { value: "Cash" }, "Cash Account"),
            JF.Utils.el("option", { value: "Bank" }, "Bank Account"),
          ]),
        ]),
      ])
    ])
  ];

  const saveSettings = async () => {
    try {
      const bSel = document.getElementById("cfg-backend");
      const urlIn = document.getElementById("cfg-api-endpoint");
      if (bSel) {
        const backendVal = bSel.value;
        JF.Store.setConfig("backend", backendVal);
        JF.Store.setBackend(backendVal);
      }
      if (urlIn) {
        const urlVal = urlIn.value.trim();
        JF.Store.setConfig("api_endpoint", urlVal);
        const tokIn = document.getElementById("cfg-api-token");
        const tokVal = tokIn ? tokIn.value.trim() : "";
        try { localStorage.setItem("jf_api_token", tokVal); } catch (e) {}
        const ad = JF.Store.getAdapter();
        if (ad && ad.configure) ad.configure({ endpoint: urlVal, token: tokVal });
      }

      const pairs = [
        ["farm_name", document.getElementById("cfg-farm-name")?.value],
        ["currency", document.getElementById("cfg-currency")?.value],
        ["ExpectedCycleLength", document.getElementById("cfg-expected-cycle")?.value],
        ["MinimumCycleLength", document.getElementById("cfg-min-cycle")?.value],
        ["MaximumCycleLength", document.getElementById("cfg-max-cycle")?.value],
        ["ReminderDaysBefore", document.getElementById("cfg-heat-lead")?.value],
        ["GestationDays", document.getElementById("cfg-gestation")?.value],
        ["DewormingIntervalDays", document.getElementById("cfg-deworm-int")?.value],
        ["DewormingReminderBefore", document.getElementById("cfg-deworm-lead")?.value],
        ["VaccinationReminderBefore", document.getElementById("cfg-vax-lead")?.value],
        ["CalfFirstDewormAgeDays", document.getElementById("cfg-calf-deworm1")?.value],
        ["CalfSecondDewormAgeDays", document.getElementById("cfg-calf-deworm2")?.value],
        ["CalfCareRemindLeadDays", document.getElementById("cfg-calf-lead")?.value],
        ["CalfFMDAgeDays", document.getElementById("cfg-calf-fmd")?.value],
        ["CalfBrucellaAgeDays", document.getElementById("cfg-calf-bruc")?.value],
        ["CalfBQAgeDays", document.getElementById("cfg-calf-bq")?.value],
      ];

      for (const [k, v] of pairs) {
        if (v !== undefined && v !== null) {
          await JF.Store.settings.set(k, v);
        }
      }

      JF.Toast?.show("Settings saved successfully!", "success");
    } catch (e) {
      console.error(e);
      JF.Toast?.show("Error saving settings", "danger");
    }
  };

  const render = async (path = "") => {
    const root = $();
    const sub = path?.[1] || "general";
    JF.Utils.clear(root);

    let settingsMap = {};
    try {
      settingsMap = await JF.Store.settings.allMap();
    } catch (e) { console.warn(e); }

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "⚙️ System Configuration"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, SUB[sub]?.label || "General"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Configure heat cycle parameters, health protocols, accounting settings, and backend database connections."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", {
          class: "btn btn--primary btn--sm",
          onclick: saveSettings
        }, "Save Settings"),
      ]),
    ]));

    page.appendChild(subNav(sub));

    let content = [];
    if (sub === "repro") content = renderRepro(settingsMap);
    else if (sub === "health") content = renderHealth(settingsMap);
    else if (sub === "accounting") content = renderAccounting(settingsMap);
    else content = renderGeneral(settingsMap);

    content.forEach(el => page.appendChild(el));
    root.appendChild(page);
  };

  return { render };
})();
