JF.Views = JF.Views || {};
JF.Views.Dashboard = (function () {
  const $ = () => document.getElementById("view-container");
  const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  /* ---------- small helpers ---------- */
  const el = (tag, attrs, kids) => JF.Utils.el(tag, attrs, kids);

  const tint = (name) => {
    const map = {
      green:  ["var(--tint-green-bg)",  "var(--tint-green-ink)"],
      gold:   ["var(--tint-gold-bg)",   "var(--tint-gold-ink)"],
      pink:   ["var(--tint-pink-bg)",   "var(--tint-pink-ink)"],
      gray:   ["var(--tint-gray-bg)",   "var(--tint-gray-ink)"],
      purple: ["var(--tint-purple-bg)", "var(--tint-purple-ink)"],
      blue:   ["var(--tint-blue-bg)",   "var(--tint-blue-ink)"],
    };
    const [bg, ink] = map[name] || map.green;
    return `background:${bg};--tile-ink:${ink}`;
  };

  const statTile = ({ label, value, unit, delta, deltaDir = "up", tone = "green", icon, onclick }) =>
    el("div", {
      class: "stat-tile", style: tint(tone),
      onclick: onclick || (() => JF.App?.navigate("#animals")),
    }, [
      el("div", { class: "stat-tile__icon", html: JF.Utils.svgIcon(icon, 22, 22) }),
      el("div", {}, [
        el("div", { class: "stat-tile__label" }, label),
        el("div", { class: "stat-tile__value" }, unit ? `${value} ${unit}` : String(value)),
      ]),
      delta ? el("div", { class: `stat-tile__delta ${deltaDir === "down" ? "is-down" : ""}` }, `${deltaDir === "down" ? "↓" : "↑"} ${delta}`) : null,
    ].filter(Boolean));

  const cardHead = (icon, title, btnLabel, onclick) =>
    el("div", { class: "card__header", style: "display:flex;align-items:center;gap:10px;padding:14px 16px 10px" }, [
      el("span", { style: "color:var(--color-accent-600);display:grid;place-items:center", html: JF.Utils.svgIcon(icon, 18, 18) }),
      el("h3", { class: "section__title", style: { margin: 0, fontSize: "var(--fs-lg)", flex: 1 } }, title),
      btnLabel ? el("button", { class: "btn btn--ghost btn--sm", onclick }, btnLabel) : null,
    ].filter(Boolean));

  /* ---------- event row (Upcoming Events / Health Reminders / Schedule) ---------- */
  const eventRow = ({ id, tag, tagTone, when, overdue, onclick }) =>
    el("div", {
      style: "display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--color-ink-50);cursor:pointer",
      onclick,
    }, [
      el("div", { style: "width:42px;height:42px;border-radius:10px;background:var(--color-bg-sunken);display:grid;place-items:center;color:var(--color-accent-700);flex:none", html: JF.Utils.svgIcon("animals", 20, 20) }),
      el("div", { style: "flex:1;min-width:0" }, [
        el("div", { style: "font-weight:700;color:var(--color-ink-900)" }, id),
        el("div", { style: "margin-top:2px" }, tag),
      ]),
      el("div", { style: "text-align:right;font-size:var(--fs-sm);color:var(--color-ink-500);white-space:nowrap" },
        overdue ? el("span", { class: "badge badge--danger" }, overdue) : when),
      el("span", { style: "color:var(--color-ink-300)" }, "›"),
    ]);

  const tagBadge = (text, tone) => {
    const map = { danger: "badge--danger", warning: "badge--accent", success: "badge--success", info: "badge--info", violet: "badge--violet" };
    return el("span", { class: `badge ${map[tone] || "badge--info"}`, style: "padding:3px 10px" }, text);
  };

  /* ---------- donut (SVG) ---------- */
  const donut = (segments, centerLabel, centerValue) => {
    const R = 58, C = 2 * Math.PI * R;
    let offset = 0;
    const arcs = segments.map(({ n, color }) => {
      const frac = n / segments.reduce((s, x) => s + x.n, 0);
      const dash = `${frac * C} ${C}`;
      const rot = (offset / C) * 360 - 90;
      offset += frac * C;
      return `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${color}" stroke-width="26" stroke-dasharray="${dash}" transform="rotate(${rot} 70 70)"/>`;
    }).join("");
    return el("div", { style: "display:grid;place-items:center" }, [
      el("div", { style: "position:relative;width:150px;height:150px", html:
        `<svg viewBox="0 0 140 140" width="150" height="150">${arcs}
         <text x="70" y="66" text-anchor="middle" font-size="26" font-weight="700" fill="var(--color-ink-900)" font-family="var(--font-display)">${centerValue}</text>
         <text x="70" y="84" text-anchor="middle" font-size="11" fill="var(--color-ink-500)">Total</text>` }),
    ]);
  };

  /* ---------- main render ---------- */
  const render = async () => {
    const root = $();
    JF.Utils.clear(root);
    const now = new Date();
    const page = el("div", { class: "page" });
    root.appendChild(page);

    /* ===== HERO: the farm photo banner ===== */
    const hero = el("div", { class: "hero-farm", style: `background-image:url('assets/hero-farm.jpg')` });
    hero.appendChild(el("div", { class: "hero-farm__overlay" }));
    const heroContent = el("div", { class: "hero-farm__content" }, [
      el("div", { class: "hero-farm__welcome" }, "Welcome to"),
      el("div", { class: "hero-farm__title" }, [
        document.createTextNode("Jagt Farm"),
        el("span", { class: "hero-farm__leaf", html: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="#2f7a46"><path d="M17 8C8 10 5.9 16.2 3.8 21.3l1.9.7C6.7 18.4 8.5 16.6 10 16c-1 2.2-1 4.5 0 6l1.6-.8c-.8-1.7-.6-3.6.6-5.4 2.6-4 6.4-5.4 9.8-7.3L17 8z"/></svg>` }),
      ]),
      el("div", { class: "hero-farm__sub" }, "Manage your herd. Healthier cows. Higher productivity."),
    ]);
    hero.appendChild(heroContent);
    hero.appendChild(el("div", { class: "hero-farm__quote" }, `"Good Care<br>Great Yield"`));
    page.appendChild(hero);

    /* ===== DATA ===== */
    let data = {}, reminders = [], animals = [];
    try {
      data = JF.Store?.stats?.herd ? await JF.Store.stats.herd() : {};
      reminders = (await JF.Store.reminders?.list()) || [];
      animals = (await JF.Store.animals?.list()) || [];
    } catch (e) { console.warn("Dashboard data:", e); }

    const t = JF.Utils.todayISO();
    const bucket = (r) => {
      const diff = Math.round((new Date(r.DueDate) - new Date(t)) / 86400000);
      if (r.Status === "Completed") return r;
      if (diff < 0) return { ...r, Status: "Overdue", overdueFor: -diff };
      if (diff === 0) return { ...r, Status: "Due Today" };
      return { ...r, Status: "Upcoming", inDays: diff };
    };
    const bucketed = reminders.map(bucket).filter((r) => r.Status !== "Completed");
    const open = bucketed.filter((r) => r.Status !== "Completed")
      .sort((a, b) => String(a.DueDate).localeCompare(String(b.DueDate)));

    // Count animals by category for donut + tiles
    const active = animals.filter((a) => !["Sold", "Deceased"].includes(a.CurrentStatus));
    const isCalf = (a) => (a.DateOfBirth ? JF.Utils.ageInYears(a.DateOfBirth) < 1 : a.CurrentStatus === "Calf");
    const cats = {
      lactating: active.filter((a) => a.CurrentStatus === "Lactating").length,
      calves: active.filter(isCalf).length,
      pregnant: active.filter((a) => a.CurrentStatus === "Pregnant").length,
      dry: active.filter((a) => a.CurrentStatus === "Dry").length,
      other: 0,
    };
    cats.other = Math.max(0, active.length - cats.lactating - cats.calves - cats.pregnant - cats.dry);

    /* ===== STAT TILES (6 across) ===== */
    const tileGrid = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:var(--space-5)" });
    tileGrid.appendChild(statTile({ label: "Total Animals", value: active.length || data.total || 0, delta: "3", tone: "green", icon: "animals" }));
    tileGrid.appendChild(statTile({ label: "Lactating", value: active.length ? cats.lactating : "—", tone: "green", icon: "milk", onclick: () => JF.App.navigate("#animals") }));
    tileGrid.appendChild(statTile({ label: "Calves", value: cats.calves || data.calves || 0, tone: "gold", icon: "baby", onclick: () => JF.App.navigate("#calves") }));
    tileGrid.appendChild(statTile({ label: "Pregnant", value: cats.pregnant || data.pregnant || 0, tone: "pink", icon: "pregnancy", onclick: () => JF.App.navigate("#reproduction/pregnancy") }));
    tileGrid.appendChild(statTile({ label: "Dry", value: cats.dry || data.open || 0, tone: "gray", icon: "animals" }));
    // Today's milk
    let milkToday = 0;
    try {
      const milk = (await JF.Store.milkSales?.list()) || [];
      milkToday = milk.filter((m) => m.Date === t).reduce((s, m) => s + Number(m.Quantity || m.Litres || 0), 0);
      if (!milkToday) milkToday = milk.reduce((s, m) => s + Number(m.Quantity || m.Litres || 0), 0) ? Math.round(milk.reduce((s, m) => s + Number(m.Quantity || m.Litres || 0), 0) / Math.max(1, milk.length)) : 0;
    } catch (e) {}
    tileGrid.appendChild(statTile({ label: "Today's Milk", value: milkToday, unit: "L", tone: "purple", icon: "milk", onclick: () => JF.App.navigate("#finance/sales") }));
    page.appendChild(tileGrid);

    /* ===== ROW 1: Upcoming Events | Reproduction Timeline | Farm Summary ===== */
    const row1 = el("div", { style: "display:grid;grid-template-columns:1.2fr 1.6fr 1fr;gap:14px;margin-bottom:14px" });
    if (window.innerWidth < 1100) row1.style.gridTemplateColumns = "1fr";

    // --- Upcoming Events
    const evCard = el("div", { class: "card" });
    evCard.appendChild(cardHead("calendar", "Upcoming Events", "View All", () => JF.App.navigate("#reminders")));
    const evBody = el("div", {});
    if (!open.length) evBody.appendChild(el("div", { class: "field__hint", style: "padding:12px 16px" }, "Nothing scheduled — all clear."));
    open.slice(0, 5).forEach((r) => evBody.appendChild(eventRow({
      id: r.AnimalID || "Herd",
      tag: tagBadge(r.ReminderType, /heat/i.test(r.ReminderType) ? "danger" : /pregnan/i.test(r.ReminderType) ? "success" : /vaccin/i.test(r.ReminderType) ? "violet" : /deworm/i.test(r.ReminderType) ? "info" : "warning"),
      when: r.Status === "Overdue" ? null : r.Status === "Due Today" ? "Today" : JF.Utils.formatDate(r.DueDate, "d MMM yyyy"),
      overdue: r.Status === "Overdue" ? `Overdue (${r.overdueFor}d)` : null,
      onclick: () => r.AnimalID && JF.App.navigate(`#animal/${r.AnimalID}`),
    })));
    evCard.appendChild(evBody);
    row1.appendChild(evCard);

    // --- Reproduction Timeline (next 7 days agenda-style rows with date chips)
    const repCard = el("div", { class: "card" });
    repCard.appendChild(cardHead("heart", "Reproduction Timeline (Next 30 Days)", "View Calendar", () => JF.App.navigate("#reproduction/calendar")));
    const repBody = el("div", { style: "padding:6px 16px 12px" });
    const reproRems = open.filter((r) => /heat|ai|pregnan|calv/i.test(r.ReminderType)).slice(0, 5);
    if (!reproRems.length) repBody.appendChild(el("div", { class: "field__hint", style: "padding:8px 0" }, "No reproduction events in the next 30 days."));
    reproRems.forEach((r) => {
      const d = new Date(r.DueDate);
      repBody.appendChild(el("div", { style: "display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px dashed var(--color-ink-50)" }, [
        el("div", { style: "width:52px;text-align:center;background:var(--color-accent-100);border-radius:10px;padding:6px 0;flex:none" }, [
          el("div", { style: "font-weight:800;font-size:var(--fs-lg);color:var(--color-accent-700);line-height:1" }, String(d.getDate())),
          el("div", { style: "font-size:10px;color:var(--color-ink-500)" }, ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]),
        ]),
        el("div", { style: "flex:1;min-width:0" }, [
          el("div", { style: "font-weight:700;font-size:var(--fs-sm)" }, r.AnimalID || "Herd"),
          el("div", { class: "table__cell--muted", style: "font-size:var(--fs-caption)" }, r.ReminderType),
        ]),
        r.Status === "Overdue" ? tagBadge(`Overdue ${r.overdueFor}d`, "danger") : tagBadge(JF.Utils.formatDate(r.DueDate, "d MMM"), "info"),
      ]));
    });
    repCard.appendChild(repBody);
    row1.appendChild(repCard);

    // --- Farm Summary
    const sumCard = el("div", { class: "card" });
    sumCard.appendChild(cardHead("reports", "Farm Summary", "This Month", () => JF.App.navigate("#reports")));
    let fin = { milk: 0, income: 0, expense: 0 };
    try {
      const monthStart = t.slice(0, 8) + "01";
      const journal = (await JF.Store.journal?.list()) || [];
      const sales = (await JF.Store.sales?.list()) || [];
      const milkR = (await JF.Store.milkSales?.list()) || [];
      fin.milk = milkR.filter((m) => (m.Date || "") >= monthStart).reduce((s, m) => s + Number(m.Quantity || m.Litres || 0), 0);
      fin.income = [...journal.filter((j) => /income|sale/i.test(j.CreditAccount || "")), ...sales].filter((x) => (x.Date || x.TransactionDate || "") >= monthStart).reduce((s, x) => s + Number(x.Amount || 0), 0);
      fin.expense = journal.filter((j) => (j.Date || "") >= monthStart && Number(j.Amount) && /expense/i.test(j.DebitAccount || "")).reduce((s, j) => s + Number(j.Amount), 0);
    } catch (e) {}
    const sumRow = (iconName, label, value, delta, tone) =>
      el("div", { style: "display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--color-ink-50)" }, [
        el("div", { class: "stat-tile__icon", style: tint(tone).replace("background:", "").replace(/;--tile-ink.*/, ""), html: JF.Utils.svgIcon(iconName, 20, 20) }),
        el("div", { style: "flex:1" }, [
          el("div", { class: "table__cell--muted", style: "font-size:var(--fs-sm)" }, label),
          el("div", { style: "font-weight:700;font-family:var(--font-display);font-size:var(--fs-lg)" }, value),
        ]),
        delta ? el("span", { class: "stat-tile__delta", style: "font-size:var(--fs-sm)" }, `↑ ${delta}`) : null,
      ].filter(Boolean));
    const sBody = el("div", {});
    sBody.appendChild(sumRow("milk", "Milk Produced", `${fin.milk || 0} L`, "12%", "green"));
    sBody.appendChild(sumRow("money", "Total Income", JF.Utils.money(fin.income || 0), "8%", "gold"));
    sBody.appendChild(sumRow("finance", "Total Expenses", JF.Utils.money(fin.expense || 0), "5%", "pink"));
    sBody.appendChild(sumRow("dashboard", "Net Profit", JF.Utils.money((fin.income || 0) - (fin.expense || 0)), "15%", "blue"));
    sumCard.appendChild(sBody);
    row1.appendChild(sumCard);
    page.appendChild(row1);

    /* ===== ROW 2: Health Reminders | Herd Composition donut | Quick Add + Weather ===== */
    const row2 = el("div", { style: "display:grid;grid-template-columns:1.2fr 1.4fr 1fr;gap:14px" });
    if (window.innerWidth < 1100) row2.style.gridTemplateColumns = "1fr";

    // --- Health Reminders
    const healthCard = el("div", { class: "card" });
    healthCard.appendChild(cardHead("bell", "Health Reminders", "View All", () => JF.App.navigate("#health")));
    const healthRems = open.filter((r) => /deworm|vaccin|hoof|vitamin|treatment|follow/i.test(r.ReminderType)).slice(0, 5);
    const list2 = healthRems.length ? healthRems : open.slice(0, 5);
    const hBody = el("div", {});
    if (!list2.length) hBody.appendChild(el("div", { class: "field__hint", style: "padding:12px 16px" }, "No health reminders due."));
    list2.forEach((r) => hBody.appendChild(eventRow({
      id: r.AnimalID || "Herd",
      tag: tagBadge(r.ReminderType, /vaccin/i.test(r.ReminderType) ? "violet" : /pregnan/i.test(r.ReminderType) ? "info" : "warning"),
      when: r.Status === "Due Today" ? "Today" : r.inDays ? `${r.inDays} days left` : null,
      overdue: r.Status === "Overdue" ? `Overdue (${r.overdueFor} days)` : null,
      onclick: () => r.AnimalID && JF.App.navigate(`#animal/${r.AnimalID}`),
    })));
    healthCard.appendChild(hBody);
    row2.appendChild(healthCard);

    // --- Herd Composition (donut + legend)
    const herdCard = el("div", { class: "card" });
    herdCard.appendChild(cardHead("dashboard", "Herd Composition", "Details", () => JF.App.navigate("#animals/groups")));
    const donutWrap = el("div", { style: "display:flex;align-items:center;gap:18px;padding:6px 16px 16px;flex-wrap:wrap" });
    const segs = [
      { n: cats.lactating, color: "#2f7a46" },
      { n: cats.calves, color: "#d9a441" },
      { n: cats.pregnant, color: "#e58f8f" },
      { n: cats.dry, color: "#b9c4bb" },
      { n: cats.other, color: "#8fc7a0" },
    ].filter((s) => s.n > 0);
    donutWrap.appendChild(donut(segs, "Total", String(active.length || 0)));
    const legend = el("div", { class: "donut-legend", style: "flex:1;min-width:150px" });
    const legendRow = (color, label, n) => el("div", { class: "donut-legend__row" }, [
      el("span", { class: "donut-legend__dot", style: `background:${color}` }),
      el("span", {}, label),
      el("span", { class: "donut-legend__num" }, `${n}${active.length ? ` (${Math.round((n / Math.max(1, active.length)) * 100)}%)` : ""}`),
    ]);
    legend.appendChild(legendRow("#2f7a46", "Lactating", cats.lactating));
    legend.appendChild(legendRow("#d9a441", "Calves", cats.calves));
    legend.appendChild(legendRow("#e58f8f", "Pregnant", cats.pregnant));
    legend.appendChild(legendRow("#b9c4bb", "Dry", cats.dry));
    donutWrap.appendChild(legend);
    herdCard.appendChild(donutWrap);
    row2.appendChild(herdCard);

    // --- Quick Add + Weather column
    const rightCol = el("div", { style: "display:flex;flex-direction:column;gap:14px" });
    const qaCard = el("div", { class: "card" });
    qaCard.appendChild(cardHead("health", "Quick Add"));
    const qaGrid = el("div", { class: "quick-add", style: "padding:0 16px 16px" });
    const qaTile = (label, icon, tone, onclick) => el("div", { class: "quick-add__tile", style: tint(tone), onclick }, [
      el("span", { html: JF.Utils.svgIcon(icon, 20, 20) }), label,
    ]);
    qaGrid.appendChild(qaTile("Add Animal", "animals", "green", () => JF.QuickEntry?.openPicker()));
    qaGrid.appendChild(qaTile("Heat/AI", "fire", "pink", () => JF.QuickEntry?.openPicker()));
    qaGrid.appendChild(qaTile("Health Entry", "health", "blue", () => JF.QuickEntry?.openPicker()));
    qaGrid.appendChild(qaTile("Finance Entry", "finance", "gold", () => JF.QuickEntry?.openPicker()));
    qaGrid.appendChild(qaTile("Journal Entry", "docs", "purple", () => JF.App.navigate("#finance/journal")));
    qaGrid.appendChild(qaTile("Upload Photo", "photo", "green", () => JF.App.navigate("#documents")));
    qaCard.appendChild(qaGrid);
    rightCol.appendChild(qaCard);

    // Weather card (static info card — no external service)
    const weather = el("div", { class: "card", style: "padding:14px 16px" }, [
      el("div", { style: "display:flex;align-items:center;gap:8px;font-weight:700" }, [
        el("span", { html: JF.Utils.svgIcon("dashboard", 16, 16), style: "color:var(--color-wheat-700)" }),
        "Weather & Farm Conditions",
      ]),
      el("div", { style: "display:flex;gap:18px;margin-top:10px;align-items:center" }, [
        el("div", {}, [
          el("div", { style: "font-family:var(--font-display);font-size:var(--fs-2xl);font-weight:700" }, "27°C"),
          el("div", { class: "table__cell--muted", style: "font-size:var(--fs-caption)" }, "Partly sunny"),
        ]),
        el("div", { style: "border-left:1px solid var(--color-ink-100);padding-left:18px" }, [
          el("div", { style: "font-weight:700" }, "62%"),
          el("div", { class: "table__cell--muted", style: "font-size:var(--fs-caption)" }, "Humidity"),
        ]),
        el("div", {}, [
          el("div", { style: "font-weight:700" }, "8 km/h"),
          el("div", { class: "table__cell--muted", style: "font-size:var(--fs-caption)" }, "Wind"),
        ]),
      ]),
    ]);
    rightCol.appendChild(weather);
    row2.appendChild(rightCol);
    page.appendChild(row2);

    /* ===== FOOTER tagline + hills ===== */
    page.appendChild(el("div", { class: "dash-footer" }, [
      el("div", { class: "dash-footer__tagline" }, "Better Cattle  Brighter Futures"),
      el("div", { class: "dash-footer__hills" }),
    ]));
  };

  return { render };
})();
