JF.Views = JF.Views || {};
JF.Views.Calendar = (function () {
  const $ = () => document.getElementById("view-container");

  const iso = (d) => JF.Utils.formatDate(d, "yyyy-MM-dd");
  let viewDate = JF.Utils.today();
  let mode = "month"; // month | week | day

  /* ---------- Event extraction ---------- */
  const buildEventMap = async () => {
    const map = {}; // yyyy-MM-dd -> [{type, color, animal, label, icon, href}]
    const add = (dateStr, ev) => {
      if (!dateStr) return;
      const key = iso(JF.Utils.parseDate(dateStr));
      if (isNaN(new Date(key))) return;
      (map[key] = map[key] || []).push(ev);
    };
    const [heats, ais, pregs, calvs, vax, dews, rems, animals, settingsMap, milk, expenses, purchases, sales] = await Promise.all([
      JF.Store.heat.list().catch(() => []),
      JF.Store.insemination.list().catch(() => []),
      JF.Store.pregnancy.list().catch(() => []),
      JF.Store.calving.list().catch(() => []),
      JF.Store.vaccination.list().catch(() => []),
      JF.Store.deworming.list().catch(() => []),
      JF.Store.reminders.list().catch(() => []),
      JF.Store.animals.list().catch(() => []),
      JF.Store.settings.allMap().catch(() => ({})),
      JF.Store.milkSales.list().catch(() => []),
      JF.Store.expenses.list().catch(() => []),
      JF.Store.purchases.list().catch(() => []),
      JF.Store.sales.list().catch(() => []),
    ]);
    const nameOf = (id) => { const a = animals.find((x) => x.AnimalID === id); return a ? (a.Name || id) : (id || ""); };

    heats.forEach((h) => add(h.HeatDate, { type: "Heat", color: "badge--danger", animal: h.AnimalID, label: nameOf(h.AnimalID), icon: "fire", href: `#animal/${h.AnimalID}/heat` }));
    ais.forEach((x) => add(x.Date, { type: "AI", color: "badge--oxblood", animal: x.AnimalID, label: nameOf(x.AnimalID), icon: "heart", href: `#animal/${x.AnimalID}/insemination` }));
    pregs.forEach((p) => add(p.Date, { type: "PD Check", color: "badge--accent", animal: p.AnimalID, label: nameOf(p.AnimalID), icon: "pregnancy", href: `#animal/${p.AnimalID}/pregnancy` }));
    vax.forEach((v) => add(v.DateGiven, { type: "Vaccination", color: "badge--info", animal: v.AnimalID, label: nameOf(v.AnimalID), icon: "syringe", href: `#animal/${v.AnimalID}/vaccination` }));
    dews.forEach((d) => add(d.Date, { type: "Deworming", color: "badge--warning", animal: d.AnimalID, label: nameOf(d.AnimalID), icon: "drop", href: `#animal/${d.AnimalID}/deworming` }));
    calvs.forEach((c) => add(c.Date, { type: "Calving", color: "badge--success", animal: c.AnimalID, label: nameOf(c.AnimalID), icon: "baby2", href: `#animal/${c.AnimalID}/calving` }));
    // Money days: milk income, expenses, purchases and sales are events too —
    // the calendar doubles as the farm's day book.
    milk.forEach((m) => add(m.Date, { type: `🥛 Milk ${m.QuantityLitres ? m.QuantityLitres + "L" : ""}`, color: "badge--success", animal: null, label: "Farm", icon: "drop", href: "#finance/overview" }));
    expenses.forEach((e) => add(e.Date, { type: `💰 ${e.Category || "Expense"}`, color: "badge--warning", animal: e.AnimalID, label: e.Vendor || "Farm", icon: "money", href: "#finance/expenses" }));
    purchases.forEach((p) => add(p.Date, { type: "🧾 Cattle Purchase", color: "badge--info", animal: p.AnimalID, label: p.Seller || "Farm", icon: "purchase", href: "#finance/purchases" }));
    sales.forEach((s) => add(s.Date, { type: "🏷 Cattle Sale", color: "badge--oxblood", animal: s.AnimalID, label: s.Buyer || "Farm", icon: "sale", href: "#finance/sales" }));
    rems.filter((r) => !["Completed", "Dismissed"].includes(r.Status)).forEach((r) =>
      add(r.DueDate, { type: r.ReminderType || "Reminder", color: r.Priority === "High" ? "badge--danger" : "badge--neutral", animal: r.AnimalID, label: nameOf(r.AnimalID) || "Herd", icon: "bell", href: r.AnimalID ? `#animal/${r.AnimalID}/overview` : "#reminders" }));

    // Expected heat windows: last heat + avg cycle, banded across min..max days
    const expC = Number(settingsMap.ExpectedCycleLength ?? 21);
    const before = Number(settingsMap.ReminderDaysBefore ?? 3);
    const byAnimal = {};
    heats.forEach((h) => { if (h.AnimalID) (byAnimal[h.AnimalID] = byAnimal[h.AnimalID] || []).push(h); });
    Object.entries(byAnimal).forEach(([animalId, list]) => {
      const dates = list.map((h) => new Date(h.HeatDate)).filter((d) => !isNaN(d)).sort((a, b) => b - a);
      if (!dates.length) return;
      const last = dates[0];
      const intervals = [];
      for (let i = 1; i < dates.length; i++) intervals.push(Math.round((dates[i - 1] - dates[i]) / 86400000));
      const avg = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : expC;
      const peak = JF.Utils.addDays(last, Math.round(avg));
      const status = animals.find((a) => a.AnimalID === animalId)?.CurrentStatus;
      if (["Pregnant", "Sold", "Deceased"].includes(status)) return;
      for (let off = -before; off <= before; off++) {
        add(iso(JF.Utils.addDays(peak, off)), {
          type: "Expected Heat", color: "badge--warning", animal: animalId, label: nameOf(animalId),
          icon: "fire", href: `#animal/${animalId}/heat`, dashed: off === 0 ? false : true,
        });
      }
    });
    return map;
  };

  /* ---------- Rendering helpers ---------- */
  const navBtns = () => JF.Utils.el("div", { style: { display: "flex", gap: "var(--space-2)", alignItems: "center" } }, [
    JF.Utils.el("button", { class: "icon-btn", "aria-label": "Previous", onclick: () => { shift(-1); render(); }, html: JF.Utils.svgIcon("arrowRight", 16, 16) ? "‹" : "‹" }),
    JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => { viewDate = JF.Utils.today(); render(); } }, "Today"),
    JF.Utils.el("button", { class: "icon-btn", "aria-label": "Next", onclick: () => { shift(1); render(); } }, "›"),
  ]);

  const shift = (dir) => {
    const d = new Date(viewDate);
    if (mode === "month") d.setDate(1), d.setMonth(d.getMonth() + dir);
    else if (mode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    viewDate = d;
  };

  const titleFor = () => {
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    if (mode === "month") return `${months[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    if (mode === "week") {
      const start = weekStart(viewDate), end = JF.Utils.addDays(start, 6);
      return `${months[start.getMonth()]} ${start.getDate()} – ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return JF.Utils.formatDate(viewDate, "EEEE, dd MMM yyyy").replace("EEEE, ", "") + ` (${weekdayName(viewDate)})`;
  };

  const weekdayName = (d) => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  const weekStart = (d) => { const s = new Date(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s; }; // Monday-first

  const chip = (ev) => {
    const ICONS = { fire: "🔥", heart: "❤️", pregnancy: "🧪", syringe: "💉", drop: "💊", baby2: "👶", money: "💰", purchase: "🧾", sale: "🏷️", bell: "🔔" };
    // Money/day-book events carry their full label in `type` (e.g. "🥛 Milk 24.5L");
    // herd events show the animal name.
    const text = /^\W/.test(ev.type || "") ? ev.type : `${ICONS[ev.icon] || "🔔"} ${ev.label}`;
    return JF.Utils.el("a", {
      class: `badge ${ev.color}`, href: ev.href,
      style: { display: "inline-flex", alignItems: "center", gap: "4px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px", padding: "2px 7px", opacity: ev.dashed ? 0.75 : 1 },
      title: `${ev.type} · ${ev.label}`,
    }, text);
  };

  /* ---------- Month grid ---------- */
  const monthGrid = (eventMap) => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const start = weekStart(first);
    const todayKey = iso(JF.Utils.today());
    const cells = [];
    const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const header = JF.Utils.el("div", { class: "cal-dow-row" }, dows.map((d) => JF.Utils.el("div", { class: "cal-dow" }, d)));
    for (let i = 0; i < 42; i++) {
      const d = JF.Utils.addDays(start, i);
      const key = iso(d);
      const evts = eventMap[key] || [];
      const inMonth = d.getMonth() === viewDate.getMonth();
      const isToday = key === todayKey;
      const cell = JF.Utils.el("div", {
        class: `cal-cell ${inMonth ? "" : "cal-cell--dim"} ${isToday ? "cal-cell--today" : ""}`,
        onclick: () => { viewDate = d; mode = "day"; render(); },
        style: { cursor: "pointer" },
      }, [
        JF.Utils.el("div", { class: "cal-daynum" }, String(d.getDate())),
        JF.Utils.el("div", { class: "cal-chips" }, [
          ...evts.slice(0, 3).map(chip),
          evts.length > 3 ? JF.Utils.el("span", { class: "field__hint", style: { fontSize: "10px" } }, `+${evts.length - 3} more`) : null,
        ].filter(Boolean)),
      ]);
      cells.push(cell);
    }
    return JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)" } }, [
      header,
      JF.Utils.el("div", { class: "cal-grid" }, cells),
    ]);
  };

  /* ---------- Week strip ---------- */
  const weekGrid = (eventMap) => {
    const start = weekStart(viewDate);
    const todayKey = iso(JF.Utils.today());
    const cols = [];
    for (let i = 0; i < 7; i++) {
      const d = JF.Utils.addDays(start, i);
      const key = iso(d);
      const evts = eventMap[key] || [];
      cols.push(JF.Utils.el("div", { class: `cal-cell ${key === todayKey ? "cal-cell--today" : ""}` }, [
        JF.Utils.el("div", { class: "cal-daynum" }, `${weekdayName(d).slice(0, 3)} ${d.getDate()}`),
        JF.Utils.el("div", { class: "cal-chips" }, evts.map(chip)),
      ]));
    }
    return JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)" } },
      JF.Utils.el("div", { class: "cal-grid cal-grid--week" }, cols));
  };

  /* ---------- Day list ---------- */
  const dayList = (eventMap) => {
    const key = iso(viewDate);
    const evts = eventMap[key] || [];
    return JF.Utils.el("div", { class: "card", style: { padding: "var(--space-5)" } }, [
      JF.Utils.el("div", { class: "card__eyebrow" }, "EVENTS THIS DAY"),
      evts.length ? JF.Utils.el("div", { class: "timeline", style: { marginTop: "var(--space-3)" } },
        evts.map((ev) => JF.Utils.el("div", { class: "timeline__item" }, [
          JF.Utils.el("div", { class: "timeline__dot timeline__dot--heat", html: JF.Utils.svgIcon(ev.icon, 10, 10) }),
          JF.Utils.el("div", { class: "timeline__date" }, ev.type),
          JF.Utils.el("div", { class: "timeline__title" }, ev.label || "Herd"),
          JF.Utils.el("div", { class: "timeline__desc" }, JF.Utils.el("a", { href: ev.href, style: { fontWeight: 600 } }, "Open record →")),
        ])))
        : JF.Utils.el("div", { class: "search-empty", style: { marginTop: "var(--space-3)" } }, "No events on this day."),
    ]);
  };

  /* ---------- Render ---------- */
  const render = async () => {
    const root = $();
    JF.Utils.clear(root);
    const eventMap = await buildEventMap();

    const legend = JF.Utils.el("div", { class: "chip-row", style: { marginBottom: "var(--space-4)" } }, [
      ["badge--danger", "🔥 Heat"], ["badge--oxblood", "❤️ AI"], ["badge--accent", "🧪 PD Check"],
      ["badge--info", "💉 Vaccination"], ["badge--warning", "💊 Deworming / Expense"], ["badge--success", "👶 Calving / 🥛 Milk"],
    ].map(([c, l]) => JF.Utils.el("span", { class: `badge ${c}` }, l)));

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "📅 Farm Calendar"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, titleFor()),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Heats, AI, checks, calvings, reminders — and the money days: milk collections, expenses, purchases and sales, straight from your entries. Tap a day for detail; add anything with one tap."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        navBtns(),
        JF.Utils.el("div", { class: "tabs", style: { marginBottom: 0 } }, ["month", "week", "day"].map((m) =>
          JF.Utils.el("a", { class: `tab ${mode === m ? "is-active" : ""}`, href: `#calendar`, onclick: (e) => { e.preventDefault(); mode = m; render(); } }, m[0].toUpperCase() + m.slice(1)))),
        JF.Utils.el("button", { class: "btn btn--accent btn--sm", onclick: () => JF.QuickEntry.openPicker() }, "+ Quick Entry"),
      ]),
    ]));
    page.appendChild(legend);
    page.appendChild(mode === "month" ? monthGrid(eventMap) : mode === "week" ? weekGrid(eventMap) : dayList(eventMap));

    // Side summary: busiest days this month
    if (mode === "month") {
      const monthKeys = Object.keys(eventMap).filter((k) => { const d = new Date(k); return d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear(); });
      const total = monthKeys.reduce((s, k) => s + eventMap[k].length, 0);
      page.appendChild(JF.Utils.el("div", { class: "field__hint", style: { marginTop: "var(--space-4)", textAlign: "center" } },
        `${total} events across ${monthKeys.length} days this month · click any day for detail`));
    }

    root.appendChild(page);
  };

  return { render };
})();
