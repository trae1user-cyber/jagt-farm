JF.Views = JF.Views || {};
JF.Views.AnimalProfile = (function () {
  const $ = () => document.getElementById("view-container");
  const TABS = ["Overview", "Episodes", "Timeline", "Heat", "Insemination", "Pregnancy", "Calving", "Health", "Deworming", "Vaccination", "Documents", "Photos", "Expenses", "Accounting"];
  const TAB_KEYS = ["overview", "episodes", "timeline", "heat", "insemination", "pregnancy", "calving", "health", "deworming", "vaccination", "documents", "photos", "expenses", "accounting"];

  const statusBadge = (status) => {
    const map = {
      "Calf": "badge--info", "Heifer": "badge--info", "Pregnant": "badge--success", "Lactating": "badge--success",
      "Open": "badge--warning", "In Heat": "badge--danger", "Sick": "badge--danger", "Under Treatment": "badge--danger",
      "Dry": "badge--neutral", "Active": "badge--success", "Sold": "badge--neutral", "Deceased": "badge--neutral",
    };
    return `<span class="badge ${map[status] || "badge--neutral"} badge--lg">${status || "Active"}</span>`;
  };

  const money = (n) => JF.Utils.money(n || 0);
  // Table cell that accepts trusted HTML markup (badges, links, bold dates).
  const TD = (html) => { const td = document.createElement("td"); td.innerHTML = html; return td; };

  /* ---------- Header ---------- */
  const header = (a, nextEvents) => JF.Utils.el("div", { class: "card card--feature", style: { marginBottom: "var(--space-6)" } }, [
    JF.Utils.el("div", { style: { display: "grid", gridTemplateColumns: "160px 1fr auto", gap: "var(--space-6)", alignItems: "center" } }, [
      JF.Utils.el("div", {
        class: "avatar avatar--xl",
        html: `<img src="${a?.PhotoURL || JF.Utils.portraitSVG(a?.Name || a?.AnimalID || "farm")}" alt=""/>`,
        style: { boxShadow: "var(--shadow-md)" },
      }),
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, `ANIMAL PROFILE · ${a?.AnimalID || ""}`),
        JF.Utils.el("h1", { style: { fontSize: "var(--fs-4xl)", fontWeight: 700, letterSpacing: "-0.03em", marginTop: "8px" } }, a?.Name || "Unnamed"),
        JF.Utils.el("div", { style: { display: "flex", gap: "var(--space-3)", alignItems: "center", marginTop: "var(--space-3)", flexWrap: "wrap" } }, [
          JF.Utils.el("span", { class: "chip" }, a?.Breed || ""),
          JF.Utils.el("span", { class: "chip" }, a?.Gender || ""),
          JF.Utils.el("span", { class: "chip" }, a?.DateOfBirth ? `${JF.Utils.ageLabel(a.DateOfBirth)} old` : ""),
          JF.Utils.el("span", { class: "chip" }, a?.CurrentGroup || a?.CurrentLocation || ""),
          JF.Utils.el("span", { html: statusBadge(a?.CurrentStatus) }),
        ]),
      ]),
      JF.Utils.el("div", { style: { display: "flex", gap: "var(--space-2)", flexDirection: "column", alignItems: "stretch", minWidth: 180 } }, [
        JF.Utils.el("button", { class: "btn btn--primary", onclick: () => JF.QuickEntry?.openPicker() }, "Add Event"),
        JF.Utils.el("button", { class: "btn btn--ghost", onclick: () => openEdit(a) }, "Edit Animal"),
        JF.Utils.el("button", {
          class: "btn btn--ghost",
          style: { color: "var(--color-danger-500)", borderColor: "var(--color-danger-100)" },
          onclick: async () => {
            if (!confirm(`Delete ${a?.Name || a?.AnimalID}? This removes the master record only.`)) return;
            try {
              await JF.Store.animals.delete(a.AnimalID || a.id);
              JF.Toast?.show("Animal deleted.", "success");
              JF.App.navigate("#animals");
            } catch (e) { JF.Toast?.show("Failed to delete animal.", "danger"); }
          },
        }, "Delete Animal"),
      ]),
    ]),
    JF.Utils.el("div", { class: "divider", style: { margin: "var(--space-5) 0" } }),
    JF.Utils.el("div", {}, [
      JF.Utils.el("div", { class: "card__eyebrow", style: { marginBottom: "var(--space-3)" } }, "NEXT EVENTS"),
      JF.Utils.el("div", { class: "chip-row" }, (nextEvents.length
        ? nextEvents.map((r) => JF.Utils.el("a", {
            class: "chip", href: `#animal/${a.AnimalID}/overview`,
            onclick: (e) => { e.preventDefault(); JF.App.navigate("#reminders"); },
          }, `${typeIcon(r.ReminderType)} ${r.ReminderType} · ${JF.Utils.formatDate(r.DueDate)}`))
        : [JF.Utils.el("span", { class: "chip" }, "No upcoming events — all clear")])
      ),
    ]),
  ]);

  const typeIcon = (type) => ({
    "Heat Expected": "🔥", "Pregnancy Check": "🧪", "Treatment Follow-up": "🩺",
    "Deworming": "💊", "Vaccination": "💉", "Expected Calving": "👶",
  }[type] || "🔔");

  /* ---------- Tabs ---------- */
  const tabsNav = (activeIdx) => {
    const row = JF.Utils.el("div", { class: "tabs" });
    TABS.forEach((t, i) => row.appendChild(JF.Utils.el("a", {
      class: `tab ${i === activeIdx ? "is-active" : ""}`,
      href: `#tab-${TABS[i]}`,
      onclick: (e) => {
        e.preventDefault();
        location.hash = `#animal/${aID}/${TAB_KEYS[i]}`;
      },
    }, t)));
    return row;
  };

  let aID = null;
  let cache = {};

  const panel = (i, contentNode) => JF.Utils.el("div", {
    id: `tab-${i}`, class: `tab-panel ${i === activeIdx ? "is-active" : ""}`,
    style: { display: i === activeIdx ? "block" : "none" },
  }, [contentNode || JF.Utils.el("div", { class: "card", style: { padding: "var(--space-8)", textAlign: "center" } },
    JF.Utils.el("div", { class: "search-empty" }, "No records yet."))]);

  let activeIdx = 0;

  /* ---------- Helpers ---------- */
  const rows = (entity, dateKey) => (cache[entity] || [])
    .filter((r) => r.AnimalID === aID)
    .sort((x, y) => new Date(y[dateKey] || 0) - new Date(x[dateKey] || 0));

  const emptyCard = (msg) => JF.Utils.el("div", { class: "card", style: { padding: "var(--space-7)", textAlign: "center" } },
    JF.Utils.el("div", { class: "search-empty" }, [
      JF.Utils.el("div", { style: { opacity: 0.4, marginBottom: "10px" }, html: JF.Utils.svgIcon("timeline", 26, 26) }),
      msg,
    ]));

  const statCard = (label, value, sub) => JF.Utils.el("div", { class: "card card--stat" }, [
    JF.Utils.el("div", { class: "stat-number" }, String(value ?? "—")),
    JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, label),
    sub ? JF.Utils.el("div", { class: "field__hint", style: { marginTop: "2px" } }, sub) : null,
  ].filter(Boolean));

  const dataTable = (headers, rowsArr, emptyMsg) => {
    if (!rowsArr.length) return emptyCard(emptyMsg);
    return JF.Utils.el("div", { class: "table-container card" }, JF.Utils.el("table", { class: "table" }, [
      JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, headers.map((h) => JF.Utils.el("th", {}, h)))),
      JF.Utils.el("tbody", {}, rowsArr),
    ]));
  };

  /* ---------- Tab: Overview ---------- */
  const overviewTab = () => {
    const heats = rows("heat", "HeatDate"), preg = rows("pregnancy", "Date"), calv = rows("calving", "Date");
    const healths = rows("health", "Date"), dew = rows("deworming", "Date"), vax = rows("vaccination", "DateGiven");
    const jnl = (cache.journal || []).filter((e) => e.AnimalID === aID);
    const spend = jnl.filter((e) => (e.DebitAccount || "").includes("Expense")).reduce((s, e) => s + Number(e.Amount || 0), 0);
    const a = cache.animal;
    const posPreg = preg.filter((p) => p.Result === "Positive").length;
    const lastCalv = calv[0];

    // Life-cycle card (derived from records by the LifeCycle engine)
    let lc = null;
    try { lc = JF.LifeCycle.lifecycleOf(a, cache.lifeCycleData, Number(cache.settings?.GestationDays) || 283); } catch (e) { lc = null; }

    const info = (k, v) => JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--color-ink-100)" } }, [
      JF.Utils.el("span", { class: "field__hint" }, k), JF.Utils.el("span", { style: { fontWeight: 600, textAlign: "right" } }, v || "—"),
    ]);

    return JF.Utils.el("div", { class: "grid grid--cols-3", style: { gap: "var(--space-4)" } }, [
      JF.Utils.el("div", { class: "card" }, [
        JF.Utils.el("div", { class: "card__eyebrow" }, "BASIC INFO"),
        info("Tag Number", a?.TagNumber), info("Species", a?.Species), info("Color", a?.Color),
        info("Date of Birth", JF.Utils.formatDate(a?.DateOfBirth)), info("Age", a?.DateOfBirth ? JF.Utils.ageLabel(a.DateOfBirth) : ""),
        info("Location", a?.CurrentLocation), info("Group", a?.CurrentGroup),
      ]),
      JF.Utils.el("div", { class: "card" }, [
        JF.Utils.el("div", { class: "card__eyebrow" }, "PEDIGREE & PURCHASE"),
        info("Mother", a?.MotherID || "—"),
        info("Father", a?.FatherID || "—"),
        info("Purchase Date", JF.Utils.formatDate(a?.PurchaseDate)),
        info("Purchase Price", a?.PurchasePrice ? money(a.PurchasePrice) : "—"),
        info("Ident. Marks", a?.IdentificationMarks),
      ]),
      JF.Utils.el("div", { class: "card" }, [
        JF.Utils.el("div", { class: "card__eyebrow" }, "REPRODUCTION"),
        statCard("HEATS RECORDED", heats.length),
        JF.Utils.el("div", { style: { height: "12px" } }),
        statCard("PREGNANCIES (POS)", posPreg),
        JF.Utils.el("div", { style: { height: "12px" } }),
        statCard("CALVINGS", calv.length),
      ]),
      lc ? JF.Utils.el("div", { class: "card", style: { gridColumn: "span 2" } }, [
        JF.Utils.el("div", { class: "card__eyebrow" }, `LIFE CYCLE · LACTATION #${lc.lactationNo || 0}`),
        JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginTop: "var(--space-3)" } }, [
          statCard("LACTATION #", lc.lactationNo || (calv.length ? calv.length : 0)),
          statCard("DAYS IN MILK", lc.dim != null ? lc.dim : (a?.CurrentStatus === "Lactating" && lc.lastCalving ? JF.Utils.daysBetween(lc.lastCalving, JF.Utils.todayISO()) : "—")),
          statCard("CALVING INTERVAL", lc.calvingInterval ? `${lc.calvingInterval}d` : (calv.length >= 2 ? "…" : "—"), calv.length >= 2 ? "from her calvings" : (calv.length < 2 ? "needs 2+ calvings" : "")),
          statCard("LIFETIME MEDICAL", money(lc.medical.total), `₹${lc.medical.last12m}/12mo`),
        ]),
        lc.expectedCalving ? JF.Utils.el("div", { style: { marginTop: "var(--space-3)" } },
          JF.Utils.el("div", { class: `badge ${lc.expectedCalving.confirmed ? "badge--success" : "badge--warning"}` },
            `👶 Expected calving ${JF.Utils.formatDate(lc.expectedCalving.date)} (${lc.expectedCalving.confirmed ? "PD confirmed" : "PD pending"})`)) : null,
        lc.daysDry != null ? JF.Utils.el("div", { class: "field__hint", style: { marginTop: "6px" } }, `Dry for ${lc.daysDry} days${lc.lastDryOff ? ` (since ${JF.Utils.formatDate(lc.lastDryOff)})` : ""}`) : null,
      ]) : null,
      JF.Utils.el("div", { class: "card" }, [
        JF.Utils.el("div", { class: "card__eyebrow" }, "HEALTH SUMMARY"),
        info("Treatments", String(healths.length)),
        info("Dewormings", String(dew.length)),
        info("Vaccinations", String(vax.length)),
        info("Last Treatment", healths[0] ? JF.Utils.formatDate(healths[0].Date) : "—"),
        info("Next Deworming", dew[0]?.NextDueDate ? JF.Utils.formatDate(dew[0].NextDueDate) : "—"),
      ]),
      JF.Utils.el("div", { class: "card" }, [
        JF.Utils.el("div", { class: "card__eyebrow" }, "FINANCIAL SUMMARY"),
        info("Linked Journal Entries", String(jnl.length)),
        info("Total Expense Posted", money(spend)),
        info("Purchase Price", a?.PurchasePrice ? money(a.PurchasePrice) : "—"),
      ]),
      JF.Utils.el("div", { class: "card" }, [
        JF.Utils.el("div", { class: "card__eyebrow" }, "STATUS"),
        JF.Utils.el("div", { style: { margin: "12px 0" }, html: statusBadge(a?.CurrentStatus) }),
        info("Last Updated", a?.UpdatedAt ? JF.Utils.formatDate(a.UpdatedAt, "dd MMM yyyy HH:mm") : "—"),
        info("Notes", a?.Notes || "—"),
      ]),
    ]);
  };

  /* ---------- Tab: Timeline ---------- */
  const timelineTab = () => {
    const evts = JF.Timeline.animalForSync(aID, cache);
    if (!evts.length) return emptyCard("No timeline events yet. Record heats, treatments or vaccinations to build the history.");
    const wrap = JF.Utils.el("div", { class: "timeline" });
    evts.forEach((ev) => {
      wrap.appendChild(JF.Utils.el("div", { class: "timeline__item", style: { cursor: "pointer" } }, [
        JF.Utils.el("div", { class: `timeline__dot ${ev.DotClass || ""}`, html: JF.Utils.svgIcon(ev.Icon, 10, 10) }),
        JF.Utils.el("div", { class: "timeline__date" }, JF.Utils.formatDate(ev.Date)),
        JF.Utils.el("div", { class: "timeline__title" }, ev.Title),
        JF.Utils.el("div", { class: "timeline__desc" }, ev.Subtitle || ""),
      ]));
    });
    return wrap;
  };

  /* ---------- Tab: Heat ---------- */
  const heatTab = () => {
    const list = rows("heat", "HeatDate");
    const settings = cache.settings;
    const expC = Number(settings?.ExpectedCycleLength ?? 21);
    const minC = Number(settings?.MinimumCycleLength ?? 18);
    const maxC = Number(settings?.MaximumCycleLength ?? 24);
    const before = Number(settings?.ReminderDaysBefore ?? 3);

    const intervals = [];
    for (let i = 1; i < list.length; i++) {
      const d = JF.Utils.daysBetween(list[i].HeatDate, list[i - 1].HeatDate);
      if (d > 0) intervals.push(d);
    }
    const avg = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null;
    const last = list[0];
    const expNext = avg && last ? JF.Utils.formatDate(JF.Utils.addDays(last.HeatDate, Math.round(avg))) : "—";
    const minNext = avg && last ? JF.Utils.formatDate(JF.Utils.addDays(last.HeatDate, Math.round(avg) - before)) : "—";
    const maxNext = avg && last ? JF.Utils.formatDate(JF.Utils.addDays(last.HeatDate, Math.round(avg) + before)) : "—";

    const analysis = JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
      statCard("AVG CYCLE", avg ? `${Math.round(avg * 10) / 10}d` : "—", `${intervals.length} intervals`),
      statCard("SHORTEST", intervals.length ? `${Math.min(...intervals)}d` : "—"),
      statCard("LONGEST", intervals.length ? `${Math.max(...intervals)}d` : "—"),
      statCard("HEAT COUNT", list.length),
    ]);

    const windowCard = last && avg ? JF.Utils.el("div", { class: "card", style: { marginBottom: "var(--space-5)", padding: "var(--space-5)" } }, [
      JF.Utils.el("div", { class: "card__eyebrow" }, "EXPECTED NEXT HEAT WINDOW"),
      JF.Utils.el("div", { style: { display: "flex", gap: "var(--space-5)", alignItems: "baseline", flexWrap: "wrap", marginTop: "8px" } }, [
        JF.Utils.el("div", {}, [JF.Utils.el("div", { class: "field__hint" }, "Window start"), JF.Utils.el("div", { style: { fontSize: "var(--fs-xl)", fontWeight: 700 } }, minNext)]),
        JF.Utils.el("div", {}, [JF.Utils.el("div", { class: "field__hint" }, "Peak (avg)"), JF.Utils.el("div", { style: { fontSize: "var(--fs-xl)", fontWeight: 700, color: "var(--color-danger-600)" } }, expNext)]),
        JF.Utils.el("div", {}, [JF.Utils.el("div", { class: "field__hint" }, "Window end"), JF.Utils.el("div", { style: { fontSize: "var(--fs-xl)", fontWeight: 700 } }, maxNext)]),
      ]),
    ]) : null;

    const table = dataTable(["Date", "Time", "Intensity", "Detection", "Symptoms", "Notes"], list.map((h) => JF.Utils.el("tr", {}, [
      TD(`<strong>${JF.Utils.formatDate(h.HeatDate)}</strong>`),
      JF.Utils.el("td", {}, h.HeatTime || "—"),
      JF.Utils.el("td", {}, h.HeatIntensity || "—"),
      JF.Utils.el("td", {}, h.DetectionMethod || "—"),
      JF.Utils.el("td", {}, (h.Symptoms || []).join(", ") || "—"),
      JF.Utils.el("td", {}, h.Notes || ""),
    ])), "No heat records for this animal.");

    return JF.Utils.el("div", {}, [analysis, windowCard, table].filter(Boolean));
  };

  /* ---------- Tab: Insemination ---------- */
  const inseminationTab = () => {
    const list = rows("insemination", "Date");
    const pregByAI = {};
    (cache.pregnancy || []).forEach((p) => { if (p.InseminationID) pregByAI[p.InseminationID] = p.Result; });
    return dataTable(["Date", "Method", "Bull / Semen", "Technician", "Cost", "Pregnancy Result"], list.map((ai) => JF.Utils.el("tr", {}, [
      TD(`<strong>${JF.Utils.formatDate(ai.Date)}</strong>`),
      JF.Utils.el("td", {}, ai.Method || "AI"),
      JF.Utils.el("td", {}, ai.SemenBullID || "—"),
      JF.Utils.el("td", {}, ai.Technician || "—"),
      JF.Utils.el("td", {}, ai.Cost ? money(ai.Cost) : "—"),
      JF.Utils.el("td", {}, pregByAI[ai.InseminationID || ai.id]
        ? `<span class="badge ${pregByAI[ai.InseminationID || ai.id] === "Positive" ? "badge--success" : "badge--warning"}">${pregByAI[ai.InseminationID || ai.id]}</span>`
        : `<span class="badge badge--neutral">Pending</span>`),
    ])), "No insemination records yet.");
  };

  /* ---------- Tab: Pregnancy ---------- */
  const pregnancyTab = () => {
    const list = rows("pregnancy", "Date");
    const a = cache.animal;
    const gest = Number(cache.settings?.GestationDays ?? 283);
    const isPregnant = a?.CurrentStatus === "Pregnant";
    const posPreg = list.find((p) => p.Result === "Positive");
    const cards = [];
    if (isPregnant && posPreg) {
      const linkedAI = (cache.insemination || []).find((x) => x.id === posPreg.InseminationID || x.InseminationID === posPreg.InseminationID);
      const calvingDate = JF.Utils.addDays(linkedAI?.Date || posPreg.Date, gest);
      const daysLeft = JF.Utils.daysBetween(JF.Utils.today(), calvingDate);
      cards.push(JF.Utils.el("div", { class: "card card--feature", style: { marginBottom: "var(--space-5)", padding: "var(--space-5)" } }, [
        JF.Utils.el("div", { class: "card__eyebrow" }, "CURRENT PREGNANCY"),
        JF.Utils.el("div", { style: { display: "flex", gap: "var(--space-6)", alignItems: "center", flexWrap: "wrap", marginTop: "8px" } }, [
          JF.Utils.el("div", {}, [
            JF.Utils.el("div", { class: "stat-number" }, String(Math.max(0, daysLeft))),
            JF.Utils.el("div", { class: "card__eyebrow" }, "DAYS TO CALVING"),
          ]),
          JF.Utils.el("div", {}, [JF.Utils.el("div", { class: "field__hint" }, "Expected date"), JF.Utils.el("div", { style: { fontSize: "var(--fs-lg)", fontWeight: 700 } }, JF.Utils.formatDate(calvingDate))]),
          JF.Utils.el("div", {}, [JF.Utils.el("div", { class: "field__hint" }, "Confirmed by"), JF.Utils.el("div", { style: { fontWeight: 600 } }, posPreg.Veterinarian || "—")]),
        ]),
      ]));
    }
    const table = dataTable(["Date", "Method", "Result", "Veterinarian", "Linked AI", "Notes"], list.map((p) => JF.Utils.el("tr", {}, [
      TD(`<strong>${JF.Utils.formatDate(p.Date)}</strong>`),
      JF.Utils.el("td", {}, p.Method || "—"),
      TD(`<span class="badge ${p.Result === "Positive" ? "badge--success" : p.Result === "Negative" ? "badge--warning" : "badge--neutral"}">${p.Result || "Unknown"}</span>`),
      JF.Utils.el("td", {}, p.Veterinarian || "—"),
      JF.Utils.el("td", {}, p.InseminationID || "—"),
      JF.Utils.el("td", {}, p.Notes || ""),
    ])), "No pregnancy checks recorded.");
    return JF.Utils.el("div", {}, [...cards, table]);
  };

  /* ---------- Tab: Calving ---------- */
  const calvingTab = () => {
    const list = rows("calving", "Date");
    return dataTable(["Date", "Type", "Calf", "Gender", "Weight", "Health", "Vet", "Notes"], list.map((c) => JF.Utils.el("tr", {}, [
      TD(`<strong>${JF.Utils.formatDate(c.Date)}</strong>`),
      JF.Utils.el("td", {}, c.CalvingType || "—"),
      TD(c.CalfID
        ? `<a href="#animal/${c.CalfID}" style="font-weight:600;color:var(--color-accent-700)">${c.CalfID}</a>`
        : "—"),
      JF.Utils.el("td", {}, c.CalfGender || "—"),
      JF.Utils.el("td", {}, c.CalfWeight ? `${c.CalfWeight} kg` : "—"),
      JF.Utils.el("td", {}, c.CalfHealth || "—"),
      JF.Utils.el("td", {}, c.Veterinarian || "—"),
      JF.Utils.el("td", {}, c.Notes || ""),
    ])), "No calvings recorded.");
  };

  /* ---------- Tab: Health ---------- */
  const healthTab = () => {
    const list = rows("health", "Date");
    const meds = [];
    list.forEach((h) => { if (h.Medicine) meds.push({ date: h.Date, med: h.Medicine, dose: h.Dose }); });
    const medHist = meds.length ? JF.Utils.el("div", { class: "card", style: { marginBottom: "var(--space-5)" } }, [
      JF.Utils.el("div", { class: "card__eyebrow", style: { padding: "var(--space-4) var(--space-4) 0" } }, "MEDICINE HISTORY"),
      JF.Utils.el("div", { class: "timeline", style: { padding: "var(--space-2) var(--space-4) var(--space-4)" } },
        meds.map((m) => JF.Utils.el("div", { class: "timeline__item" }, [
          JF.Utils.el("div", { class: "timeline__dot timeline__dot--health", html: JF.Utils.svgIcon("treatment", 10, 10) }),
          JF.Utils.el("div", { class: "timeline__date" }, JF.Utils.formatDate(m.date)),
          JF.Utils.el("div", { class: "timeline__title" }, m.med),
          JF.Utils.el("div", { class: "timeline__desc" }, m.dose || ""),
        ]))),
    ]) : null;

    const table = dataTable(["Date", "Problem", "Diagnosis", "Treatment", "Medicine", "Dose", "Cost", "Status"], list.map((h) => JF.Utils.el("tr", {}, [
      TD(`<strong>${JF.Utils.formatDate(h.Date)}</strong>`),
      JF.Utils.el("td", {}, h.Problem || "—"),
      JF.Utils.el("td", {}, h.Diagnosis || "—"),
      JF.Utils.el("td", {}, h.Treatment || "—"),
      JF.Utils.el("td", {}, h.Medicine || "—"),
      JF.Utils.el("td", {}, h.Dose || "—"),
      JF.Utils.el("td", {}, h.TreatmentCost ? money(h.TreatmentCost) : "—"),
      TD(`<span class="badge ${h.RecoveryStatus === "Recovered" ? "badge--success" : h.RecoveryStatus === "Under Treatment" ? "badge--danger" : "badge--warning"}">${h.RecoveryStatus || "Open"}</span>`),
    ])), "No veterinary records.");

    return JF.Utils.el("div", {}, [medHist, table].filter(Boolean));
  };

  /* ---------- Tab: Deworming / Vaccination ---------- */
  const dewormingTab = () => {
    const list = rows("deworming", "Date");
    return dataTable(["Date", "Medicine", "Dose", "Weight", "Vet", "Cost", "Next Due"], list.map((d) => JF.Utils.el("tr", {}, [
      TD(`<strong>${JF.Utils.formatDate(d.Date)}</strong>`),
      JF.Utils.el("td", {}, d.Medicine || "—"),
      JF.Utils.el("td", {}, d.Dose || "—"),
      JF.Utils.el("td", {}, d.Weight ? `${d.Weight} kg` : "—"),
      JF.Utils.el("td", {}, d.Veterinarian || "—"),
      JF.Utils.el("td", {}, d.Cost ? money(d.Cost) : "—"),
      TD(d.NextDueDate ? `<span class="badge badge--info">${JF.Utils.formatDate(d.NextDueDate)}</span>` : "—"),
    ])), "No deworming records.");
  };

  const vaccinationTab = () => {
    const list = rows("vaccination", "DateGiven");
    return dataTable(["Date", "Vaccine", "Batch", "Vet", "Cost", "Next Due"], list.map((v) => JF.Utils.el("tr", {}, [
      TD(`<strong>${JF.Utils.formatDate(v.DateGiven)}</strong>`),
      JF.Utils.el("td", {}, v.Vaccine || "—"),
      JF.Utils.el("td", {}, v.BatchNumber || "—"),
      JF.Utils.el("td", {}, v.Veterinarian || "—"),
      JF.Utils.el("td", {}, v.Cost ? money(v.Cost) : "—"),
      TD(v.NextDueDate ? `<span class="badge badge--info">${JF.Utils.formatDate(v.NextDueDate)}</span>` : "—"),
    ])), "No vaccination records.");
  };

  /* ---------- Tab: Documents ---------- */
  const documentsTab = () => {
    const list = (cache.files || []).filter((f) => f.AnimalID === aID);
    if (!list.length) return emptyCard("No documents linked to this animal.");
    return JF.Utils.el("div", { class: "grid grid--cols-3" }, list.map((f) => JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)" } }, [
      JF.Utils.el("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, [
        JF.Utils.el("div", { class: "stat-icon", html: JF.Utils.svgIcon("document", 18, 18) }),
        JF.Utils.el("div", {}, [
          JF.Utils.el("div", { style: { fontWeight: 600, fontSize: "var(--fs-sm)" } }, f.FileName || f.id),
          JF.Utils.el("div", { class: "field__hint" }, `${f.Category || "Other"} · ${JF.Utils.formatDate(f.UploadDate)}`),
        ]),
      ]),
    ])));
  };

  /* ---------- Tab: Photos ---------- */
  const photosTab = () => {
    const evts = JF.Timeline.animalForSync(aID, cache).filter((e) => e.Record && (e.Record.PhotoURL || e.Record.Photo));
    const groups = {};
    evts.forEach((e) => {
      const t = e.Entity === "heat" ? "Heat" : e.Entity === "calving" ? "Calving" : e.Entity === "health" ? "Health" : "Other";
      (groups[t] = groups[t] || []).push({ url: e.Record.PhotoURL || e.Record.Photo, date: e.Date, title: e.Title });
    });
    const mk = (label, url, date, title) => JF.Utils.el("div", {
      class: "photo-card", onclick: () => JF.Modal.open({
        title: title || label, size: "md",
        body: JF.Utils.el("img", { src: url, style: { width: "100%", borderRadius: "var(--radius-md)" } }),
      }),
    }, [
      JF.Utils.el("img", { src: url, style: { width: "100%", height: 150, objectFit: "cover", borderRadius: "var(--radius-md)" } }),
      JF.Utils.el("div", { class: "field__hint", style: { marginTop: "6px" } }, `${label} · ${JF.Utils.formatDate(date)}`),
    ]);
    if (!evts.length) return emptyCard("No event photos yet.");
    return JF.Utils.el("div", {}, Object.entries(groups).map(([g, items]) => JF.Utils.el("div", { style: { marginBottom: "var(--space-5)" } }, [
      JF.Utils.el("div", { class: "card__eyebrow", style: { marginBottom: "10px" } }, g.toUpperCase()),
      JF.Utils.el("div", { class: "photo-grid" }, items.map((x) => mk(g, x.url, x.date, x.title))),
    ])));
  };

  /* ---------- Tab: Expenses ---------- */
  const expensesTab = () => {
    const list = (cache.expenses || []).filter((e) => e.AnimalID === aID);
    // Medical expenses include the auto-journaled treatment/dewormer/vaccine costs.
    const medJnl = (cache.journal || []).filter((e) => e.AnimalID === aID && (e.DebitAccount || "").includes("Expense") && /Veterinar|Medicin|Vaccin|Deworm/i.test(e.DebitAccount));
    const medFromRecords =
      rows("health", "Date").reduce((s, h) => s + Number(h.TreatmentCost || 0), 0) +
      rows("deworming", "Date").reduce((s, x) => s + Number(x.Cost || 0), 0) +
      rows("vaccination", "DateGiven").reduce((s, x) => s + Number(x.Cost || 0), 0);
    const medical = list.filter((e) => ["Veterinary", "Medicine", "Vaccination", "Deworming"].includes(e.Category || "")).reduce((s, e) => s + Number(e.Amount || 0), 0) + medFromRecords;
    const byCat = {};
    list.forEach((e) => { byCat[e.Category || "Other"] = (byCat[e.Category || "Other"] || 0) + Number(e.Amount || 0); });
    const total = Object.values(byCat).reduce((s, v) => s + v, 0);
    const totals = JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
      statCard("TOTAL LINKED", money(total)),
      statCard("MEDICAL TOTAL", money(medical)),
      ...Object.entries(byCat).slice(0, 2).map(([c, v]) => statCard((c || "OTHER").toUpperCase(), money(v))),
    ]);
    const table = dataTable(["Date", "Category", "Description", "Vendor", "Amount"], list.map((e) => JF.Utils.el("tr", {}, [
      TD(`<strong>${JF.Utils.formatDate(e.Date)}</strong>`),
      TD(`<span class="badge badge--warning">${e.Category || "General"}</span>`),
      JF.Utils.el("td", {}, e.Description || "—"),
      JF.Utils.el("td", {}, e.Vendor || "—"),
      JF.Utils.el("td", {}, money(e.Amount)),
    ])), "No direct expenses linked.");
    return JF.Utils.el("div", {}, [totals, table]);
  };

  /* ---------- Tab: Accounting ---------- */
  const accountingTab = () => {
    const jnl = (cache.journal || []).filter((e) => e.AnimalID === aID)
      .sort((x, y) => new Date(y.Date) - new Date(x.Date));
    const spend = jnl.filter((e) => (e.DebitAccount || "").includes("Expense")).reduce((s, e) => s + Number(e.Amount || 0), 0);
    const header = JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
      statCard("ENTRIES", jnl.length),
      statCard("TOTAL EXPENSE", money(spend)),
      statCard("LATEST ENTRY", jnl[0] ? JF.Utils.formatDate(jnl[0].Date) : "—"),
      statCard("BALANCED", jnl.every((e) => Number(e.Amount || 0) > 0) ? "✓" : "—"),
    ]);
    const table = dataTable(["Date", "Description", "Debit (Dr)", "Credit (Cr)", "Amount", "Reference"], jnl.map((e) => JF.Utils.el("tr", {}, [
      TD(`<strong>${JF.Utils.formatDate(e.Date)}</strong>`),
      JF.Utils.el("td", {}, e.Description || e.TransactionType || "Entry"),
      TD(`<span style="color:var(--color-oxblood-700)">${e.DebitAccount || "—"}</span>`),
      TD(`<span style="color:var(--color-accent-700)">${e.CreditAccount || "—"}</span>`),
      JF.Utils.el("td", {}, money(e.Amount)),
      JF.Utils.el("td", {}, e.ReferenceID || ""),
    ])), "No journal entries linked to this animal.");
    return JF.Utils.el("div", {}, [header, table]);
  };

  /* ---------- Edit modal ---------- */
  const openEdit = (a) => {
    const fields = [
      ["TagNumber", "Tag Number", "text"], ["Name", "Name", "text"], ["Breed", "Breed", "text"],
      ["DateOfBirth", "Date of Birth", "date"], ["PurchaseDate", "Purchase Date", "date"],
      ["PurchasePrice", "Purchase Price", "number"], ["Color", "Color", "text"],
      ["IdentificationMarks", "Identification Marks", "text"], ["CurrentGroup", "Group", "text"],
      ["CurrentLocation", "Location", "text"], ["Notes", "Notes", "text"],
    ];
    const wrap = JF.Utils.el("div", { class: "form-stack" });
    fields.forEach(([key, label, type]) => {
      wrap.appendChild(JF.Utils.el("div", { class: "field" }, [
        JF.Utils.el("label", { class: "field__label" }, label),
        JF.Utils.el("input", { class: "input", type, id: `ea-${key}`, value: a?.[key] ?? "" }),
      ]));
    });
    const saveBtn = JF.Utils.el("button", {
      class: "btn btn--primary", onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = "Saving...";
        try {
          const patch = {};
          fields.forEach(([key]) => {
            const v = document.getElementById(`ea-${key}`)?.value;
            patch[key] = key === "PurchasePrice" ? (v ? Number(v) : null) : v;
          });
          await JF.Store.animals.update(a.AnimalID, patch);
          JF.Toast.show("Animal updated.", "success");
          JF.Modal.close();
          JF.App.route();
        } catch (err) { JF.Toast.show("Save failed.", "danger"); btn.disabled = false; btn.textContent = "Save"; }
      },
    }, "Save");
    JF.Modal.open({
      title: `Edit ${a?.Name || a?.AnimalID}`, size: "md", body: wrap,
      footer: [
        JF.Utils.el("button", { class: "btn btn--ghost", onclick: () => JF.Modal.close() }, "Cancel"),
        saveBtn,
      ],
    });
  };

  /* ---------- Episodes tab: detective story, memory, scorecard, one-tap ---------- */
  const episodesTab = async (aID) => {
    const [heats, insem, healths] = await Promise.all([
      JF.Store.heat.list(), JF.Store.insemination.list(), JF.Store.health.list(),
    ]);
    const episodes = JF.ReproIntel.episodesFor(aID, { heats, inseminations: insem, healths, animals: cache.animals ? [cache.animal] : [] }).slice().reverse();
    const score = await JF.ReproIntel.scorecardFor(aID);
    const memory = heatMemory(heats.filter((h) => h.AnimalID === aID), insem.filter((x) => x.AnimalID === aID));

    const wrap = JF.Utils.el("div", {});

    // One-tap event chips
    wrap.appendChild(JF.Utils.el("div", { class: "onetap card", style: { marginBottom: "var(--space-5)" } }, [
      JF.Utils.el("div", { class: "card__eyebrow", style: { padding: "var(--space-3) var(--space-4) 0" } }, "ONE-TAP EVENTS"),
      JF.Utils.el("div", { class: "onetap__row" }, [
        JF.Utils.el("button", { class: "onetap__chip onetap__chip--heat", onclick: () => JF.QuickEntry.openObserve(aID, "Standing Heat") }, "🐄 STANDING"),
        JF.Utils.el("button", { class: "onetap__chip onetap__chip--heat", onclick: () => JF.QuickEntry.openObserve(aID, "Clear Mucus") }, "💧 MUCUS"),
        JF.Utils.el("button", { class: "onetap__chip onetap__chip--heat", onclick: () => JF.QuickEntry.openObserve(aID, "Mounting") }, "🔥 MOUNTING"),
        JF.Utils.el("button", { class: "onetap__chip onetap__chip--ai", onclick: () => JF.QuickEntry.openForm("ai") }, "💉 AI"),
        JF.Utils.el("button", { class: "onetap__chip onetap__chip--ai", onclick: () => JF.QuickEntry.openForm("treat") }, "🩺 HEALTH"),
        JF.Utils.el("button", { class: "onetap__chip", onclick: () => JF.QuickEntry.openForm("photo") }, "📷 PHOTO"),
      ]),
    ]));

    // Animal memory
    if (memory) {
      wrap.appendChild(JF.Utils.el("div", { class: "card memory-card", style: { marginBottom: "var(--space-5)" } }, [
        JF.Utils.el("div", { class: "card__eyebrow" }, "ANIMAL MEMORY"),
        JF.Utils.el("div", { class: "grid grid--cols-3", style: { marginTop: "var(--space-3)" } }, [
          JF.Utils.el("div", {}, [
            JF.Utils.el("div", { class: "stat-number", style: { fontSize: "var(--fs-xl)" } }, memory.avgCycle ? `${memory.avgCycle}d` : "—"),
            JF.Utils.el("div", { class: "card__eyebrow" }, "AVG CYCLE (LAST 3)"),
          ]),
          JF.Utils.el("div", {}, [
            JF.Utils.el("div", { class: "stat-number", style: { fontSize: "var(--fs-xl)" } }, memory.lastAI || "—"),
            JF.Utils.el("div", { class: "card__eyebrow" }, "LAST AI"),
          ]),
          JF.Utils.el("div", {}, [
            JF.Utils.el("div", { class: "stat-number", style: { fontSize: "var(--fs-xl)" } }, memory.lastPD || "—"),
            JF.Utils.el("div", { class: "card__eyebrow" }, "LAST PD RESULT"),
          ]),
        ]),
      ]));
    }

    // Reproductive scorecard (record quality, not fertility prediction)
    const bar = (label, v) => JF.Utils.el("div", { class: "score-row" }, [
      JF.Utils.el("span", { class: "score-row__label" }, label),
      JF.Utils.el("div", { class: "score-row__track" }, JF.Utils.el("div", { class: "score-row__fill", style: { width: `${v}%` } })),
      JF.Utils.el("span", { class: "score-row__val" }, `${v}%`),
    ]);
    wrap.appendChild(JF.Utils.el("div", { class: "card", style: { marginBottom: "var(--space-5)" } }, [
      JF.Utils.el("div", { class: "card__eyebrow" }, "REPRODUCTIVE SCORECARD — RECORD QUALITY"),
      JF.Utils.el("div", { style: { marginTop: "var(--space-3)" } }, [
        bar("Heat detection", score.heatDetection),
        bar("AI timing coverage", score.aiTiming),
        bar("Observation quality", score.observationQuality),
        bar("Record completeness", score.completeness),
      ]),
      JF.Utils.el("div", { class: "field__hint", style: { marginTop: "var(--space-2)" } },
        "Scores measure how completely and timely you record — directly measurable, not a fertility prediction."),
    ]));

    // Episodes
    if (!episodes.length) {
      wrap.appendChild(JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-6)" } },
        "No reproductive episodes yet. Tap a one-tap chip above the next time you see signs."));
      return wrap;
    }
    episodes.forEach((ep, i) => {
      const card = JF.Utils.el("div", { class: "card episode-card", style: { marginBottom: "var(--space-4)" } });
      card.appendChild(JF.Utils.el("div", { class: "card__header" }, [
        JF.Utils.el("div", {}, [
          JF.Utils.el("div", { class: "card__eyebrow" }, `EPISODE · ${JF.Utils.formatDate(ep.start, "d MMM yyyy")}`),
          JF.Utils.el("h3", { class: "section__title", style: { margin: 0 } },
            `${ep.observations.length} observation(s) · ${ep.aiCoverage.length} AI(s) · evidence ${ep.evidencePct}%`),
        ]),
        ep.returnHeat && ep.returnHeat.possible ? JF.Utils.el("span", { class: "badge badge--danger" }, "RETURN HEAT?") : null,
      ].filter(Boolean)));
      const body = JF.Utils.el("div", { style: { padding: "0 var(--space-4) var(--space-4)" } });
      // Onset + ovulation + coverage summary
      if (ep.onsetEstimate) {
        body.appendChild(JF.Utils.el("div", { class: "field__hint", style: { marginBottom: "var(--space-2)" } },
          `Onset: ${ep.onsetEstimate.bestLabel}${ep.onsetEstimate.earliestLabel && ep.onsetEstimate.earliestLabel !== ep.onsetEstimate.bestLabel ? ` (earliest evidence: ${ep.onsetEstimate.earliestLabel})` : ""}`));
      }
      body.appendChild(JF.Utils.el("div", { class: "field__hint", style: { marginBottom: "var(--space-2)" } },
        `Estimated ovulation window: ${JF.Utils.formatDate(ep.ovulation.lo, "d MMM HH:mm")} → ${JF.Utils.formatDate(ep.ovulation.hi, "d MMM HH:mm")}${ep.standingSeen ? "" : " (widened — no standing heat recorded)"}`));
      ep.aiCoverage.forEach((c) => {
        body.appendChild(JF.Utils.el("div", { class: `coverage-item coverage-item--inline` }, [
          JF.Utils.el("span", { class: `coverage-item__verdict coverage-item__verdict--${{ prime: "good", good: "good", early: "mid", late: "late" }[c.band]}` },
            `${c.label} — ${c.band === "prime" ? "PRIME" : c.band === "good" ? "GOOD" : c.band.toUpperCase()} COVERAGE`),
        ]));
      });
      // Why
      const w = JF.ReproIntel.why(ep);
      body.appendChild(JF.Utils.el("details", { class: "why-details" }, [
        JF.Utils.el("summary", {}, "Why this estimate?"),
        JF.Utils.el("ul", { class: "why-list" }, w.basis.map((b) => JF.Utils.el("li", {}, b))),
        JF.Utils.el("div", { class: "why-conf" }, `Confidence: ${w.confidence}`),
      ]));
      // Next
      body.appendChild(JF.Utils.el("div", { class: "next-steps" }, ep.actions.map((a) =>
        JF.Utils.el("div", { class: "next-steps__row" }, `→ ${a.text}`))));
      card.appendChild(body);
      wrap.appendChild(card);
    });
    return wrap;
  };

  /* ---------- Heat memory: cycle pattern from last heats ---------- */
  const heatMemory = (heats, ais) => {
    const sorted = heats.map((h) => h.HeatDate).filter(Boolean).sort();
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      const d = JF.Utils.daysBetween(sorted[i - 1], sorted[i]);
      if (d >= 15 && d <= 30) intervals.push(d);
    }
    const last3 = intervals.slice(-3);
    const avg = last3.length ? Math.round(last3.reduce((a, b) => a + b, 0) / last3.length) : null;
    const lastAI = ais.length ? JF.Utils.formatDate(ais.map((a) => a.Date).sort().slice(-1)[0], "d MMM") : null;
    const lastAIRec = ais.sort((a, b) => new Date(b.Date) - new Date(a.Date))[0];
    let lastPD = null;
    if (lastAIRec) {
      const pd = (cache.pregnancy || []).filter((p) => p.AnimalID === lastAIRec.AnimalID && JF.Utils.daysBetween(lastAIRec.Date, p.Date) >= 20).sort((a, b) => new Date(b.Date) - new Date(a.Date))[0];
      lastPD = pd ? pd.Result : "pending";
    }
    return { avgCycle: avg, intervals: last3, lastAI, lastPD };
  };

  /* ---------- Render ---------- */
  const render = async (path = []) => {
    aID = path?.[1] || (parseID(location.hash) || "COW-001");
    activeIdx = Math.max(0, TAB_KEYS.indexOf(path?.[2] || "overview"));
    const root = $();
    JF.Utils.clear(root);

    let animal = null;
    try { animal = await JF.Store.animals.get(aID); } catch (e) {}
    // Adapter ids and AnimalID can diverge (GAS imports, external entries):
    // resolve by AnimalID as well before giving up.
    if (!animal) {
      try {
        const all = (await JF.Store.animals.list()) || [];
        animal = all.find((x) => x.AnimalID === aID || x.id === aID) || null;
      } catch (e) {}
    }
    if (!animal) {
      root.appendChild(JF.Utils.el("div", { class: "page" }, [
        emptyCard(`No animal found for "${aID}".`),
        JF.Utils.el("div", { style: { textAlign: "center", marginTop: "var(--space-4)" } },
          JF.Utils.el("a", { class: "btn btn--primary", href: "#animals" }, "Back to All Animals")),
      ]));
      return;
    }

    const entities = ["heat", "insemination", "pregnancy", "calving", "health", "deworming", "vaccination", "journal", "expenses", "files"];
    const results = await Promise.all(entities.map((e) => JF.Store[e].list().catch(() => [])));
    cache = { animal, settings: await JF.Store.settings.allMap() };
    entities.forEach((e, i) => { cache[e] = results[i]; });
    // Full data window (incl. dry-offs) for the life-cycle card.
    try { cache.lifeCycleData = await JF.LifeCycle.loadAll(); } catch (e) { cache.lifeCycleData = null; }

    const reminders = ((await JF.Store.reminders.list().catch(() => [])) || [])
      .filter((r) => r.AnimalID === aID && !["Completed", "Dismissed"].includes(r.Status))
      .sort((x, y) => new Date(x.DueDate) - new Date(y.DueDate)).slice(0, 4);

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", {
      class: "eyebrow", style: { marginBottom: "var(--space-3)", cursor: "pointer" },
      onclick: () => JF.App.navigate("#animals"),
      html: `← Back to All Animals`,
    }));
    page.appendChild(header(animal, reminders));
    page.appendChild(tabsNav(activeIdx));
    page.appendChild(JF.Utils.el("div", { class: "tab-panels" }, [
      panel(0, overviewTab()),
      panel(1, await episodesTab(aID)),
      panel(2, timelineTab()),
      panel(3, heatTab()),
      panel(4, inseminationTab()),
      panel(5, pregnancyTab()),
      panel(6, calvingTab()),
      panel(7, healthTab()),
      panel(8, dewormingTab()),
      panel(9, vaccinationTab()),
      panel(10, documentsTab()),
      panel(11, photosTab()),
      panel(12, expensesTab()),
      panel(13, accountingTab()),
    ]));
    root.appendChild(page);
  };

  const parseID = (hash) => { const m = String(hash || "").match(/^#animal\/([^/]+)/); return m ? m[1] : null; };

  return { render };
})();
