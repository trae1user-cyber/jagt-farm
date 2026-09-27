JF.Views = JF.Views || {};
JF.Views.Reproduction = (function () {
  const $ = () => document.getElementById("view-container");
  const SUB = {
    heatRecords:    { label: "Heat Records",     icon: "fire" },
    insemination:   { label: "Insemination",     icon: "heart" },
    pregnancy:      { label: "Pregnancy Checks", icon: "pregnancy" },
    expected:       { label: "Calving Board",    icon: "baby2" },
    calving:        { label: "Calving Log",      icon: "baby" },
    heatCalendar:   { label: "Heat Calendar",    icon: "calendar" },
  };

  const subNav = (active = "heatRecords") => {
    const row = JF.Utils.el("div", { class: "tabs", style: { marginBottom: "var(--space-5)" } });
    Object.entries(SUB).forEach(([k, v]) => {
      const a = JF.Utils.el("a", {
        class: `tab ${active === k ? "is-active" : ""}`,
        href: `#reproduction/${k}`,
        html: `<span style="display:inline-flex;align-items:center;gap:6px;">${JF.Utils.svgIcon(v.icon, 14, 14)} ${v.label}</span>`,
      });
      row.appendChild(a);
    });
    return row;
  };

  const renderTable = (headers, rows) => {
    const container = JF.Utils.el("div", { class: "table-container card" });
    const table = JF.Utils.el("table", { class: "table" });
    const thead = JF.Utils.el("thead", {}, [
      JF.Utils.el("tr", {}, headers.map(h => JF.Utils.el("th", {}, h)))
    ]);
    const tbody = JF.Utils.el("tbody", {}, rows.length ? rows.map(r =>
      JF.Utils.el("tr", {
        style: r.animalId ? "cursor:pointer" : "",
        onclick: r.animalId ? () => JF.App.navigate(`#animal/${r.animalId}`) : null
      }, r.cols.map(c => JF.Utils.el("td", {}, c)))
    ) : [
      JF.Utils.el("tr", {}, [
        JF.Utils.el("td", { colSpan: headers.length, style: "text-align:center;padding:24px;color:var(--color-ink-400)" }, "No records found in this view.")
      ])
    ]);
    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
    return container;
  };

  const render = async (path = "") => {
    const root = $();
    const sub = path?.[1] || "heatRecords";
    JF.Utils.clear(root);

    let heats = [], insem = [], preg = [], calv = [];
    try {
      heats = await JF.Store.heat.list();
      insem = await JF.Store.insemination.list();
      preg = await JF.Store.pregnancy.list();
      calv = await JF.Store.calving.list();
    } catch (e) { console.warn(e); }

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "🔄 Reproduction"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, SUB[sub]?.label || "Heat Records"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Track heat cycles, AI records, pregnancy checks, calvings and reproductive events."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", {
          class: "btn btn--primary btn--icon-label btn--sm",
          html: `${JF.Utils.svgIcon("plus", 14, 14)} New Record`,
          onclick: () => JF.QuickEntry?.openForm(sub === "insemination" ? "ai" : sub === "pregnancy" ? "preg" : sub === "calving" ? "calving" : "heat"),
        }),
      ]),
    ]));

    page.appendChild(subNav(sub));

    if (sub === "insemination") {
      const rows = insem.map(i => ({
        animalId: i.AnimalID,
        cols: [
          `<strong>${i.InseminationID || "AI-REC"}</strong>`,
          i.AnimalID || "—",
          JF.Utils.formatDate(i.Date, "dd MMM yyyy"),
          i.Method || "AI",
          i.SemenID || "—",
          i.Technician || "—",
          i.Cost ? JF.Utils.money(i.Cost) : "—",
        ]
      }));
      page.appendChild(renderTable(["Insemination ID", "Animal ID", "Date", "Method", "Semen/Bull ID", "Technician", "Cost"], rows));
    } else if (sub === "pregnancy") {
      const rows = preg.map(p => ({
        animalId: p.AnimalID,
        cols: [
          `<strong>${p.PregnancyCheckID || "PD-REC"}</strong>`,
          p.AnimalID || "—",
          JF.Utils.formatDate(p.Date, "dd MMM yyyy"),
          p.Method || "Rectal",
          `<span class="badge ${p.Result === "Positive" ? "badge--accent" : p.Result === "Negative" ? "badge--danger" : "badge--warning"}">${p.Result || "Pending"}</span>`,
          p.Veterinarian || "—",
          p.Notes || "—"
        ]
      }));
      page.appendChild(renderTable(["PD ID", "Animal ID", "Date", "Method", "Result", "Veterinarian", "Notes"], rows));
    } else if (sub === "expected") {
      // CALVING BOARD — pregnant animals sorted by expected date, countdown,
      // PD status, dry-off flag. All from LifeCycle (AI + gestation, PD-aware).
      const board = await JF.LifeCycle.calvingBoard();
      const urBadge = (u) => ({ overdue: "badge--danger", "this-week": "badge--oxblood", soon: "badge--warning", later: "badge--info" }[u] || "badge--neutral");
      const urLabel = (r) => r.daysTo < 0 ? `${-r.daysTo}d OVERDUE` : r.daysTo === 0 ? "DUE TODAY" : `in ${r.daysTo}d`;
      if (!board.length) {
        page.appendChild(JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-6)" } },
          "No pending calvings yet. Record an insemination followed by a positive pregnancy check and the cow appears here automatically."));
      } else {
        const grid = JF.Utils.el("div", { class: "calving-board" });
        board.forEach((r) => {
          const { animal, lc } = r;
          grid.appendChild(JF.Utils.el("div", { class: "card calving-card" }, [
            JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" } }, [
              JF.Utils.el("div", {}, [
                JF.Utils.el("a", { href: `#animal/${animal.AnimalID}`, style: { fontWeight: 700, fontSize: "var(--fs-lg)" } }, animal.Name || animal.AnimalID),
                JF.Utils.el("div", { class: "field__hint" }, `${animal.AnimalID} · lactation #${lc.parity + 1}`),
              ]),
              JF.Utils.el("span", { class: `badge ${urBadge(r.urgency)}` }, urLabel(r)),
            ]),
            JF.Utils.el("div", { class: "divider", style: { margin: "var(--space-3) 0" } }),
            JF.Utils.el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "var(--fs-sm)" } }, [
              JF.Utils.el("div", {}, [JF.Utils.el("div", { class: "field__hint" }, "Expected"), JF.Utils.el("strong", {}, JF.Utils.formatDate(lc.expectedCalving.date))]),
              JF.Utils.el("div", {}, [JF.Utils.el("div", { class: "field__hint" }, "From AI"), JF.Utils.el("strong", {}, JF.Utils.formatDate(lc.expectedCalving.aiDate))]),
              JF.Utils.el("div", {}, [JF.Utils.el("div", { class: "field__hint" }, "PD status"), JF.Utils.el("strong", {}, lc.expectedCalving.confirmed ? "✓ Confirmed" : "Pending check")]),
              JF.Utils.el("div", {}, [JF.Utils.el("div", { class: "field__hint" }, "Status"), JF.Utils.el("strong", {}, animal.CurrentStatus || "—")]),
            ]),
            r.dryOffDue ? JF.Utils.el("div", { class: "badge badge--warning", style: { marginTop: "10px", display: "inline-block" } }, "🛑 Dry-off due (within 60d of calving)") : null,
            JF.Utils.el("div", { style: { display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" } }, [
              JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => JF.QuickEntry.openForm("calving") }, "+ Calving"),
              JF.QuickEntry && JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => JF.QuickEntry.openForm("preg") }, "PD Check"),
              animal.CurrentStatus === "Lactating" ? JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => JF.QuickEntry.openForm("dryoff") }, "Make Dry") : null,
            ].filter(Boolean)),
          ]));
        });
        page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-3", style: { marginBottom: "var(--space-5)" } }, [
          JF.Utils.el("div", { class: "card card--stat" }, [
            JF.Utils.el("div", { class: "stat-number" }, String(board.length)),
            JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, "PENDING CALVINGS"),
          ]),
          JF.Utils.el("div", { class: "card card--stat" }, [
            JF.Utils.el("div", { class: "stat-number" }, String(board.filter((r) => r.daysTo <= 7).length)),
            JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, "DUE WITHIN A WEEK"),
          ]),
          JF.Utils.el("div", { class: "card card--stat" }, [
            JF.Utils.el("div", { class: "stat-number" }, String(board.filter((r) => r.daysTo < 0).length)),
            JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, "OVERDUE — WATCH CLOSE"),
          ]),
        ]));
        page.appendChild(grid);
      }
    } else if (sub === "calving") {
      const rows = calv.map(c => ({
        animalId: c.AnimalID,
        cols: [
          `<strong>${c.CalvingID || "CALV-REC"}</strong>`,
          c.AnimalID || "—",
          JF.Utils.formatDate(c.Date, "dd MMM yyyy"),
          c.CalfID || "—",
          c.CalfGender || "—",
          c.CalfWeight ? `${c.CalfWeight} kg` : "—",
          c.CalvingType || "Normal",
          c.Veterinarian || "—"
        ]
      }));
      page.appendChild(renderTable(["Calving ID", "Mother ID", "Date", "Calf ID", "Calf Gender", "Calf Weight", "Type", "Vet"], rows));
    } else if (sub === "heatCalendar") {
      const calCard = JF.Utils.el("div", { class: "card", style: "padding:24px;text-align:center" }, [
        JF.Utils.el("h3", {}, "📅 Heat Cycle Calendar"),
        JF.Utils.el("p", { class: "page__sub", style: "margin-top:8px" }, "View expected heat windows calculated automatically based on animal heat history."),
        JF.Utils.el("button", {
          class: "btn btn--ghost btn--sm",
          style: "margin-top:16px",
          onclick: () => JF.App.navigate("#calendar")
        }, "Open Full Interactive Calendar →")
      ]);
      page.appendChild(calCard);
    } else {
      // heatRecords
      const rows = heats.map(h => ({
        animalId: h.AnimalID,
        cols: [
          `<strong>${h.HeatRecordID || "HEAT-REC"}</strong>`,
          h.AnimalID || "—",
          JF.Utils.formatDate(h.HeatDate, "dd MMM yyyy"),
          h.HeatTime || "Morning",
          h.DetectionMethod || "Visual",
          `<span class="badge badge--warning">${h.HeatIntensity || "Strong"}</span>`,
          h.Symptoms || "Standing Heat",
          h.Notes || "—"
        ]
      }));
      page.appendChild(renderTable(["Heat ID", "Animal ID", "Date", "Time", "Detection Method", "Intensity", "Symptoms", "Notes"], rows));
    }

    root.appendChild(page);
  };

  return { render };
})();

