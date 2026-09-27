JF.Views = JF.Views || {};
JF.Views.Dashboard = (function () {
  const $ = () => document.getElementById("view-container");
  const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  const herdCard = (data) => JF.Utils.el("div", { class: "card card--stat" }, [
    JF.Utils.el("div", { class: "stat-icon" + (data.accentClass ? ` ${data.accentClass}` : ""), html: JF.Utils.svgIcon(data.icon, 20, 20) }),
    JF.Utils.el("div", {}, [
      JF.Utils.el("div", { class: "stat-number" }, data.value),
      JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, data.label),
    ]),
  ]);

  const renderHerd = async () => {
    let data = {};
    try { data = JF.Store?.stats?.herd ? await JF.Store.stats.herd() : {}; }
    catch (e) { console.warn("herd stats:", e); }
    const items = [
      { label: "Total Active", value: data.total ?? "—", icon: "animals", accentClass: "" },
      { label: "Female", value: data.female ?? "—", icon: "animals", accentClass: "stat-icon--oxblood" },
      { label: "Male", value: data.male ?? "—", icon: "animals", accentClass: "stat-icon--wheat" },
      { label: "Calves", value: data.calves ?? "—", icon: "baby", accentClass: "" },
      { label: "Pregnant", value: data.pregnant ?? "—", icon: "pregnancy", accentClass: "stat-icon--oxblood" },
      { label: "Open", value: data.open ?? "—", icon: "animals", accentClass: "stat-icon--warning" },
      { label: "In Heat", value: data.inHeat ?? "—", icon: "fire", accentClass: "stat-icon--danger" },
      { label: "Under Treatment", value: data.sick ?? "—", icon: "treatment", accentClass: "stat-icon--danger" },
    ];
    const grid = JF.Utils.el("div", { class: "grid grid--cols-4" });
    items.forEach((it) => grid.appendChild(herdCard(it)));
    return grid;
  };

  const remindRow = (r) => {
    const badge = r.Status === "Overdue" ? "badge--danger" :
                  r.Status === "Due Today" ? "badge--warning" : "badge--accent";
    return JF.Utils.el("div", {
      style: "display:grid;grid-template-columns:auto 1fr auto;gap:var(--space-3);align-items:center;padding:var(--space-3) 0;border-bottom:1px dashed var(--color-ink-100);cursor:pointer",
      onclick: () => r.AnimalID && JF.App.navigate(`#animal/${r.AnimalID}`),
    }, [
      JF.Utils.el("span", { class: `badge badge--dotless ${badge}`, style: "padding:4px 8px" },
        JF.Utils.formatDate(r.DueDate, "dd MMM")),
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { style: "font-weight:600;color:var(--color-ink-900)" },
          `${r.AnimalID || "—"} · ${r.ReminderType}`),
        JF.Utils.el("div", { class: "table__cell--muted", style: "font-size:var(--fs-sm)" }, r.Notes || ""),
      ]),
      JF.Utils.el("span", { style: "color:var(--color-ink-400);font-size:var(--fs-sm)" },
        r.Status === "Overdue" ? "⚠ Overdue" :
        r.Status === "Due Today" ? "Today" :
        `${JF.Utils.daysBetween(JF.Utils.today(), r.DueDate)}d`),
    ]);
  };

  const panel = async (cfg) => {
    const { title, eyebrow, accent, rows = [], route } = cfg;
    const viewAllBtn = JF.Utils.el("button", {
      class: "btn btn--ghost btn--sm",
      onclick: () => route && JF.App.navigate(route),
    }, "View all");
    const card = JF.Utils.el("div", { class: "card" });
    card.appendChild(JF.Utils.el("div", { class: "card__header" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "card__eyebrow" }, eyebrow),
        JF.Utils.el("h3", { class: "section__title", style: { margin: 0 } }, title),
      ]),
      viewAllBtn,
    ]));
    const body = JF.Utils.el("div", {});
    if (rows.length) rows.slice(0, 5).forEach((r) => body.appendChild(remindRow(r)));
    else body.appendChild(JF.Utils.el("div", { class: "search-empty" }, [
      JF.Utils.el("div", { style: { opacity: 0.5, marginBottom: "8px" }, html: JF.Utils.svgIcon(accent || "dashboard", 22, 22) }),
      "No records to display.",
    ]));
    card.appendChild(body);
    return card;
  };

  const financeRows = (journal, monthStart) => {
    const today = JF.Utils.todayISO();
    const inMonth = (d) => new Date(d) >= monthStart;
    const todayExps = journal.filter((j) => j.Date === today && j.Amount);
    const monthExps = journal.filter((j) => inMonth(j.Date) && j.Amount && /Expense|Livestock|purchase/i.test(j.DebitAccount));
    const todayTotal = todayExps.reduce((s,j)=>s+Number(j.Amount||0),0);
    const monthTotal = monthExps.reduce((s,j)=>s+Number(j.Amount||0),0);
    return { todayTotal, monthTotal, recent: [...journal].reverse().slice(0,5) };
  };

  const render = async () => {
    const root = $();
    JF.Utils.clear(root);
    const today = new Date();
    const weekday = weekdays[today.getDay()];
    const todayNice = `${weekday}, ${JF.Utils.formatDate(today, "dd MMM yyyy")}`;

    const page = JF.Utils.el("div", { class: "page" });
    root.appendChild(page);

    // Ranch hero - cowboy x Punjab brand banner
    const hero = JF.Utils.el("div", { class: "ranch-hero" });
    hero.appendChild(JF.Utils.el("div", { class: "ranch-hero__kicker" }, "JagT Farm · Punjab"));
    hero.appendChild(JF.Utils.el("h2", { class: "ranch-hero__title" }, `Good ${today.getHours() < 12 ? "morning" : today.getHours() < 17 ? "afternoon" : "evening"} 🤠`));
    hero.appendChild(JF.Utils.el("p", { class: "ranch-hero__sub" },
      `${todayNice} — here's what needs you today.`));
    hero.appendChild(JF.Utils.el("div", { class: "ranch-hero__actions" }, [
      JF.Utils.el("button", { class: "btn btn--accent", onclick: () => JF.QuickEntry.openPicker() }, "+ Quick Entry"),
      JF.Utils.el("button", { class: "btn btn--ghost", style: { background: "rgba(253,248,239,0.12)", color: "#fdf8ef", borderColor: "rgba(253,248,239,0.4)" }, onclick: () => JF.App.navigate("#detective") }, "🕵 Heat Detective"),
    ]));
    hero.appendChild(JF.Utils.el("div", { class: "ranch-hero__badge" }, "EST.\nPUNJAB"));
    page.appendChild(hero);

    page.appendChild(JF.Utils.el("div", { class: "page__head-row", style: { marginBottom: "var(--space-6)" } }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "Overview"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, "Farm Dashboard"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          `Today is ${todayNice} — the current state of your herd, reproduction, health and finance.`),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => window.print() }, "Export PDF"),
        JF.Utils.el("button", { class: "btn btn--accent btn--sm", onclick: () => JF.App?.navigate("#reports") }, "All Reports"),
      ]),
    ]));

    const herdSection = JF.Utils.el("div", { class: "section" }, [
      JF.Utils.el("div", { class: "section__head" }, [
        JF.Utils.el("div", {}, [
          JF.Utils.el("h2", { class: "section__title" }, "Herd Snapshot"),
          JF.Utils.el("p", { class: "page__sub" }, "Your active cattle at a glance."),
        ]),
      ]),
    ]);
    page.appendChild(herdSection);
    herdSection.appendChild(await renderHerd());

    // Reminders aggregation for section panels
    let reminders = [], journal = [], heats = [], dews = [], vaxs = [], healths = [], pregs = [], calvings = [];
    try {
      reminders = (await JF.Store.reminders?.list()) || [];
      journal = (await JF.Store.journal?.list()) || [];
      heats = (await JF.Store.heat?.list()) || [];
      dews = (await JF.Store.deworming?.list()) || [];
      vaxs = (await JF.Store.vaccination?.list()) || [];
      healths = (await JF.Store.health?.list()) || [];
      pregs = (await JF.Store.pregnancy?.list()) || [];
      calvings = (await JF.Store.calving?.list()) || [];
    } catch (e) { console.warn("Dashboard data load:", e); }

    const t = JF.Utils.todayISO();
    const bucket = (r) => {
      const due = new Date(r.DueDate); const now = new Date(t);
      const diff = Math.round((due - now) / (1000*60*60*24));
      if (diff < 0) return { ...r, Status: "Overdue" };
      if (diff === 0) return { ...r, Status: "Due Today" };
      return { ...r, Status: "Upcoming" };
    };
    const bucketed = reminders.map(bucket);
    const due = bucketed.filter((r)=>r.Status==="Due Today");
    const over = bucketed.filter((r)=>r.Status==="Overdue");
    const up = bucketed.filter((r)=>r.Status==="Upcoming").sort((a,b)=>new Date(a.DueDate)-new Date(b.DueDate));
    const pregChecks = bucketed.filter(r=>/Pregnancy/i.test(r.ReminderType));
    const heatDue = bucketed.filter(r=>/Heat/i.test(r.ReminderType));
    const calvExp = bucketed.filter(r=>/Calving/i.test(r.ReminderType));
    const dewD = bucketed.filter(r=>/Deworming/i.test(r.ReminderType));
    const vaxD = bucketed.filter(r=>/Vaccin/i.test(r.ReminderType));
    const tfup = bucketed.filter(r=>/Follow/i.test(r.ReminderType));
    const sickAnimals = healths.filter(h=>["Under Treatment","Open","Follow-up Required"].includes(h.RecoveryStatus))
      .map(h=>({AnimalID:h.AnimalID,DueDate:h.Date,ReminderType:"Case: "+(h.Problem||"Treatment"),Status:h.RecoveryStatus,Notes:h.Diagnosis||""}));
    const inHeatAnimals = heats.filter(h=>{
      if (!h.HeatDate) return false;
      return JF.Utils.daysBetween(h.HeatDate, t) >= 0 && JF.Utils.daysBetween(h.HeatDate, t) <= 1;
    }).map(h=>({AnimalID:h.AnimalID,DueDate:h.HeatDate,ReminderType:"In Heat",Status:"Due Today",Notes:h.HeatIntensity||""}));

    const monthStart = new Date(); monthStart.setDate(1);
    const fin = financeRows(journal, monthStart);

    /* ===== TODAY ON MY FARM — action board (after data load) ===== */
    const actionBoard = JF.Utils.el("div", { class: "section" });
    actionBoard.appendChild(JF.Utils.el("h2", { class: "section__title", style: { marginBottom: "var(--space-4)" } }, "Today on My Farm"));
    const counter = (emoji, label, n, tone) => JF.Utils.el("div", { class: `card card--stat counter-${tone}` }, [
      JF.Utils.el("div", { class: "stat-number", style: { fontSize: "var(--fs-3xl)" } }, `${emoji} ${n}`),
      JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "4px" } }, label),
    ]);
    const heatToday = bucketed.filter((r) => /Heat/i.test(r.ReminderType) && ["Due Today", "Overdue"].includes(r.Status)).length;
    const calvSoon = bucketed.filter((r) => /Calving/i.test(r.ReminderType) && r.Status !== "Completed").length;
    const dewDue = bucketed.filter((r) => /Deworming/i.test(r.ReminderType) && ["Due Today", "Overdue"].includes(r.Status)).length;
    actionBoard.appendChild(JF.Utils.el("div", { class: "grid grid--cols-3", style: { marginBottom: "var(--space-4)" } }, [
      counter("🔥", "HEAT DUE", heatToday, "danger"),
      counter("👶", "CALVINGS COMING", calvSoon, "warn"),
      counter("💊", "DEWORMING DUE", dewDue, "info"),
    ]));
    const actionRow = (r) => JF.Utils.el("div", {
      class: "action-row",
      onclick: () => r.AnimalID && JF.App.navigate(`#animal/${r.AnimalID}`),
    }, [
      JF.Utils.el("span", { class: `action-row__cow` }, r.AnimalID || "Herd"),
      JF.Utils.el("span", { class: "action-row__what" }, r.ReminderType + (r.Notes ? ` — ${r.Notes}` : "")),
      JF.Utils.el("span", { class: `action-row__when ${r.Status === "Overdue" ? "action-row__when--red" : ""}` },
        r.Status === "Overdue" ? "overdue" : r.Status === "Due Today" ? "today" : `in ${JF.Utils.daysBetween(JF.Utils.todayISO(), r.DueDate)}d`),
    ]);
    const doToday = bucketed.filter((r) => ["Overdue", "Due Today"].includes(r.Status));
    const comingSoon = up.filter((r) => !doToday.includes(r)).slice(0, 5);
    const completedToday = reminders.filter((r) => r.Status === "Completed" && r.CompletedAt && String(r.CompletedAt).slice(0, 10) === t);
    const boardCard = (eyebrow, items, cls) => {
      const c = JF.Utils.el("div", { class: `card board-card board-card--${cls}` });
      c.appendChild(JF.Utils.el("div", { class: "card__eyebrow", style: { padding: "var(--space-3) var(--space-4) 0" } }, eyebrow));
      const body = JF.Utils.el("div", { style: { padding: "var(--space-2) var(--space-4) var(--space-3)" } });
      if (items.length) items.forEach((r) => body.appendChild(actionRow(r)));
      else body.appendChild(JF.Utils.el("div", { class: "field__hint", style: { padding: "var(--space-2) 0" } }, "Nothing here — all clear."));
      c.appendChild(body);
      return c;
    };
    actionBoard.appendChild(JF.Utils.el("div", { class: "grid grid--cols-3" }, [
      boardCard("🔴 DO TODAY", doToday, "red"),
      boardCard("🟠 COMING SOON", comingSoon, "orange"),
      boardCard(`🟢 COMPLETED (${completedToday.length} today)`, completedToday, "green"),
    ]));
    page.appendChild(actionBoard);

    // Helper: build two-col / three-col grids
    const repRow = JF.Utils.el("div", { class: "section" }, [
      JF.Utils.el("h2", { class: "section__title", style: { marginBottom: "var(--space-4)" } }, "Reproduction"),
    ]);
    page.appendChild(repRow);
    const repGrid = JF.Utils.el("div", { class: "grid grid--cols-2" });
    repRow.appendChild(repGrid);
    repGrid.appendChild(await panel({title:"In Heat", eyebrow:"🔥 CURRENT", accent:"fire", rows:inHeatAnimals, route:"#animals/heat"}));
    repGrid.appendChild(await panel({title:"Pregnancy Checks Due", eyebrow:"❤️ DUE SOON", accent:"pregnancy", rows:pregChecks.concat(due.filter(r=>/Preg/i.test(r.ReminderType))).slice(0,5), route:"#reproduction/pregnancy"}));
    repGrid.appendChild(await panel({title:"Expected Calvings", eyebrow:"👶 UPCOMING", accent:"baby2", rows:calvExp, route:"#reproduction/calving"}));
    repGrid.appendChild(await panel({title:"Heat Due Soon", eyebrow:"🔄 NEXT CYCLE", accent:"fire", rows:heatDue.concat(up.filter(r=>/Heat/i.test(r.ReminderType))).slice(0,5), route:"#reproduction/calendar"}));

    const healthSection = JF.Utils.el("div", { class: "section" }, [
      JF.Utils.el("h2", { class: "section__title", style: { marginBottom: "var(--space-4)" } }, "Health"),
    ]);
    page.appendChild(healthSection);
    const healthGrid = JF.Utils.el("div", { class: "grid grid--cols-2" });
    healthSection.appendChild(healthGrid);
    healthGrid.appendChild(await panel({title:"Deworming Due", eyebrow:"💊 SOON", accent:"drop", rows:dewD, route:"#health/deworming"}));
    healthGrid.appendChild(await panel({title:"Vaccination Due", eyebrow:"💉 SCHEDULED", accent:"syringe", rows:vaxD, route:"#health/vaccination"}));
    healthGrid.appendChild(await panel({title:"Treatment Follow-ups", eyebrow:"🩺 CHECK-INS", accent:"treatment", rows:tfup, route:"#health/treatments"}));
    healthGrid.appendChild(await panel({title:"Sick / Under Treatment", eyebrow:"🔴 ACTIVE CASES", accent:"health", rows:sickAnimals, route:"#animals/sick"}));

    const finSection = JF.Utils.el("div", { class: "section" }, [
      JF.Utils.el("h2", { class: "section__title", style: { marginBottom: "var(--space-4)" } }, "Finance"),
    ]);
    page.appendChild(finSection);
    const finGrid = JF.Utils.el("div", { class: "grid grid--cols-3" });
    finSection.appendChild(finGrid);

    // Finance cards: first two = amount hero cards with totals
    const amtCard = (eyebrow, label, amount, sub) => JF.Utils.el("div", { class: "card card--stat", style: { minHeight: "160px" } }, [
      JF.Utils.el("div", { class: "stat-icon stat-icon--wheat", html: JF.Utils.svgIcon("money", 20, 20) }),
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "card__eyebrow" }, eyebrow),
        JF.Utils.el("div", { class: "stat-number", style: { fontSize: "var(--fs-3xl)", marginTop: "4px" } }, JF.Utils.money(amount)),
        JF.Utils.el("div", { class: "field__hint", style: { marginTop: "4px" } }, sub),
      ]),
    ]);
    finGrid.appendChild(amtCard("💸 TODAY", "Today's Expenses", fin.todayTotal, `${todayNice}`));
    finGrid.appendChild(amtCard("📊 THIS MONTH", "Monthly Expenses", fin.monthTotal, JF.Utils.formatDate(monthStart, "MMM yyyy")));

    // Journal entries mini-list
    const recentJournalCard = JF.Utils.el("div", { class: "card" });
    recentJournalCard.appendChild(JF.Utils.el("div", { class: "card__header" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "card__eyebrow" }, "📒 ENTRIES"),
        JF.Utils.el("h3", { class: "section__title", style: { margin: 0 } }, "Recent Journal"),
      ]),
      JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => JF.App.navigate("#finance/journal") }, "View all"),
    ]));
    const rjBody = JF.Utils.el("div", {});
    if (fin.recent.length) {
      fin.recent.forEach((j) => {
        rjBody.appendChild(JF.Utils.el("div", { style: "display:grid;grid-template-columns:auto 1fr auto;gap:var(--space-3);align-items:baseline;padding:var(--space-3) 0;border-bottom:1px dashed var(--color-ink-100)" }, [
          JF.Utils.el("span", { class: "eyebrow" }, JF.Utils.formatDate(j.Date, "dd MMM")),
          JF.Utils.el("div", {}, [
            JF.Utils.el("div", { style: "font-weight:600;color:var(--color-ink-900);font-size:var(--fs-sm)" }, j.Description || j.TransactionType || "Entry"),
            JF.Utils.el("div", { class: "table__cell--muted", style: "font-size:var(--fs-sm)" }, `${j.DebitAccount || ""} ↔ ${j.CreditAccount || ""}`),
          ]),
          JF.Utils.el("span", { style: "font-weight:600;color:var(--color-oxblood-700);font-variant-numeric:tabular-nums" }, JF.Utils.money(j.Amount || 0)),
        ]));
      });
    } else {
      rjBody.appendChild(JF.Utils.el("div", { class: "search-empty" }, "No journal entries yet."));
    }
    recentJournalCard.appendChild(rjBody);
    finGrid.appendChild(recentJournalCard);
  };

  return { render };
})();
