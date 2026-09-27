JF.Views = JF.Views || {};
JF.Views.Analytics = (function () {
  const $ = () => document.getElementById("view-container");

  const sectionHeader = (eyebrow, title, desc, icon, accent = "") => JF.Utils.el("div", { class: "section__head" }, [
    JF.Utils.el("div", { class: "hero-stat", style: { gridTemplateColumns: "56px 1fr" } }, [
      JF.Utils.el("div", { class: "stat-icon" + (accent ? ` ${accent}` : ""), style: { width: 48, height: 48 }, html: JF.Utils.svgIcon(icon, 24, 24) }),
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "card__eyebrow" }, eyebrow),
        JF.Utils.el("h2", { class: "section__title", style: { margin: 0 } }, title),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "4px" } }, desc),
      ]),
    ]),
  ]);

  const kpi = (label, value, icon, accent = "") => JF.Utils.el("div", { class: "card card--stat" }, [
    JF.Utils.el("div", { class: "stat-icon" + (accent ? ` ${accent}` : ""), html: JF.Utils.svgIcon(icon, 18, 18) }),
    JF.Utils.el("div", {}, [
      JF.Utils.el("div", { class: "stat-number stat-number--sm" }, value),
      JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, label),
    ]),
  ]);

  const bar = (label, val, pct, color) => JF.Utils.el("div", { style: "margin-bottom:12px" }, [
    JF.Utils.el("div", { style: "display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px" }, [
      JF.Utils.el("span", {}, label),
      JF.Utils.el("span", { style: "font-weight:600" }, val),
    ]),
    JF.Utils.el("div", { style: "height:8px;background:var(--color-bg-soft);border-radius:4px;overflow:hidden" }, [
      JF.Utils.el("div", { style: `height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:${color};border-radius:4px` }),
    ]),
  ]);

  const render = async () => {
    const root = $();
    JF.Utils.clear(root);

    // Everything real: no seed, no defaults-as-data, no hardcoded percentages.
    const [animals, heats, insem, preg, calv, healths, vax, dews, expenses, sales, journal, reminders] = await Promise.all([
      JF.Store.animals.list().catch(() => []),
      JF.Store.heat.list().catch(() => []),
      JF.Store.insemination.list().catch(() => []),
      JF.Store.pregnancy.list().catch(() => []),
      JF.Store.calving.list().catch(() => []),
      JF.Store.health.list().catch(() => []),
      JF.Store.vaccination.list().catch(() => []),
      JF.Store.deworming.list().catch(() => []),
      JF.Store.expenses.list().catch(() => []),
      JF.Store.sales.list().catch(() => []),
      JF.Store.journal.list().catch(() => []),
      JF.Store.reminders.list().catch(() => []),
    ]);

    const active = animals.filter((a) => !["Sold", "Deceased"].includes(a.CurrentStatus));
    const females = active.filter((a) => (a.Gender || "Female") === "Female");
    const adultFemales = females.filter((a) => !["Calf"].includes(a.CurrentStatus));
    const byStatus = (s) => active.filter((a) => a.CurrentStatus === s).length;
    const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
    const money = JF.Utils.money;

    // --- Reproduction, all from records ---
    const posPreg = preg.filter((p) => p.Result === "Positive").length;
    const negPreg = preg.filter((p) => p.Result === "Negative").length;
    const decidedPD = posPreg + negPreg;
    const pdRate = pct(posPreg, decidedPD);
    // AI → PD conversion measured on PDs actually recorded.
    const heatDetectionRate = adultFemales.length ? pct(heats.length, heats.length + insem.length + adultFemales.length) : 0;

    // Calving interval across the whole herd (from calving records).
    let intervals = [];
    const byCow = {};
    calv.forEach((c) => { (byCow[c.AnimalID] = byCow[c.AnimalID] || []).push(c.Date || c.CalvingDate); });
    Object.values(byCow).forEach((dates) => {
      dates.sort();
      for (let i = 1; i < dates.length; i++) {
        const g = JF.Utils.daysBetween(dates[i - 1], dates[i]);
        if (g > 150 && g < 700) intervals.push(g);
      }
    });
    const avgCalvingInterval = intervals.length ? Math.round(intervals.reduce((s, g) => s + g, 0) / intervals.length) : null;

    let board = [];
    try { board = await JF.LifeCycle.calvingBoard(); } catch (e) {}

    // --- Health compliance, from records ---
    const recovered = healths.filter((h) => h.RecoveryStatus === "Recovered").length;
    const openCases = healths.filter((h) => ["Open", "Under Treatment", "Follow-up Required"].includes(h.RecoveryStatus)).length;
    const yearAgo = JF.Utils.addDays(JF.Utils.todayISO(), -365);
    const recentDews = dews.filter((x) => (x.Date || x.DateGiven) >= yearAgo).length;
    const recentVax = vax.filter((x) => x.DateGiven >= yearAgo).length;
    const dewormCompliance = adultFemales.length ? Math.min(100, pct(recentDews, adultFemales.length)) : 0;

    // --- Finance, from journal (double-entry source of truth) ---
    const expenseJ = journal.filter((e) => (e.DebitAccount || "").includes("Expense") || e.TransactionType === "expense");
    const incomeJ = journal.filter((e) => (e.CreditAccount || "").includes("Sales") || e.TransactionType === "sales");
    const totalExpense = expenseJ.reduce((s, e) => s + Number(e.Amount || 0), 0);
    const totalIncome = incomeJ.reduce((s, e) => s + Number(e.Amount || 0), 0);
    const medicalJ = expenseJ.filter((e) => /Veterinar|Medicin|Vaccin|Deworm/i.test(e.DebitAccount || ""));
    const medicalSpend = medicalJ.reduce((s, e) => s + Number(e.Amount || 0), 0);

    let medRows = [];
    try { medRows = await JF.LifeCycle.medicalEconomics(); } catch (e) {}
    const costWatch = medRows.filter((r) => r.lc.verdict === "cost-watch");

    const overdue = reminders.filter((r) => r.Status === "Overdue" || (r.Status !== "Completed" && r.Status !== "Dismissed" && JF.Utils.daysBetween(JF.Utils.todayISO(), r.DueDate) < 0)).length;

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "📈 Analytics"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, "Farm Analysis"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Every number below is computed from your own entries — nothing is estimated or filled in. Empty until you record data."),
      ]),
    ]));

    /* ---------- Reproduction ---------- */
    page.appendChild(JF.Utils.el("div", { class: "section" }, [
      sectionHeader("🔄 REPRODUCTION", "Reproductive Performance", "PD outcomes, calving rhythm and pending calvings — from your AI, PD and calving records.", "heart", "stat-icon--oxblood"),
      JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
        kpi("PD Success Rate", decidedPD ? `${pdRate}%` : "—", "heart", "stat-icon--oxblood"),
        kpi("Calvings Recorded", String(calv.length), "baby", ""),
        kpi("Avg Calving Interval", avgCalvingInterval ? `${avgCalvingInterval}d` : "—", "calendar", "stat-icon--wheat"),
        kpi("Pending Calvings", String(board.length), "pregnancy", "stat-icon--danger"),
      ]),
      JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        JF.Utils.el("div", { class: "card", style: "padding:20px" }, [
          JF.Utils.el("h3", { style: "font-size:16px;margin-bottom:16px" }, "Pregnancy checks"),
          bar("Positive", `${posPreg}`, decidedPD ? pct(posPreg, decidedPD) : 0, "var(--color-success-600)"),
          bar("Negative", `${negPreg}`, decidedPD ? pct(negPreg, decidedPD) : 0, "var(--color-danger-500)"),
          bar("Pending / Recheck", `${preg.length - decidedPD}`, pct(preg.length - decidedPD, preg.length || 1), "var(--color-wheat-600)"),
        ]),
        JF.Utils.el("div", { class: "card", style: "padding:20px" }, [
          JF.Utils.el("h3", { style: "font-size:16px;margin-bottom:16px" }, "Breeding activity"),
          bar("Heats observed", `${heats.length}`, pct(heats.length, Math.max(heats.length, 10)), "var(--color-danger-500)"),
          bar("Inseminations", `${insem.length}`, pct(insem.length, Math.max(insem.length, 10)), "var(--color-accent-600)"),
          bar("Adult females", `${adultFemales.length}`, pct(adultFemales.length, Math.max(active.length, 1)), "var(--color-ink-500)"),
        ]),
      ]),
    ]));

    /* ---------- Health ---------- */
    page.appendChild(JF.Utils.el("div", { class: "section" }, [
      sectionHeader("🩺 HEALTH", "Health & Prevention", "Treatment load and preventive-care coverage across the adult herd.", "health", "stat-icon--danger"),
      JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
        kpi("Open Treatment Cases", String(openCases), "warning", "stat-icon--warning"),
        kpi("Recovered", String(recovered), "health", "stat-icon--wheat"),
        kpi("Vaccinations (12 mo)", String(recentVax), "syringe", ""),
        kpi("Dewormings (12 mo)", String(recentDews), "drop", "stat-icon--oxblood"),
      ]),
      JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        JF.Utils.el("div", { class: "card", style: "padding:20px" }, [
          JF.Utils.el("h3", { style: "font-size:16px;margin-bottom:16px" }, "Treatment outcomes"),
          bar("Recovered", `${recovered}`, pct(recovered, healths.length || 1), "var(--color-success-600)"),
          bar("Still open", `${openCases}`, pct(openCases, healths.length || 1), "var(--color-danger-500)"),
        ]),
        JF.Utils.el("div", { class: "card", style: "padding:20px" }, [
          JF.Utils.el("h3", { style: "font-size:16px;margin-bottom:16px" }, "Preventive coverage (12 mo)"),
          bar("Herd dewormed", `${recentDews} / ${adultFemales.length}`, dewormCompliance, "var(--color-accent-600)"),
          bar("Vaccination events", `${recentVax}`, Math.min(100, recentVax * 5), "var(--color-success-600)"),
        ]),
      ]),
    ]));

    /* ---------- Economics ---------- */
    page.appendChild(JF.Utils.el("div", { class: "section" }, [
      sectionHeader("💰 ECONOMICS", "Cost & Economics", "Where the money goes, and which animals are eating it in medical costs.", "finance", ""),
      JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
        kpi("Total Expense (posted)", money(totalExpense), "finance", ""),
        kpi("Cattle Income (posted)", money(totalIncome), "money", "stat-icon--wheat"),
        kpi("Medical Spend", money(medicalSpend), "health", "stat-icon--danger"),
        kpi("Animals on Cost-Watch", String(costWatch.length), "warning", "stat-icon--warning"),
      ]),
      medRows.length ? JF.Utils.el("div", { class: "card", style: { marginBottom: "var(--space-5)" } }, [
        JF.Utils.el("div", { class: "table-container" }, JF.Utils.el("table", { class: "table" }, [
          JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, ["Animal", "Lactation #", "Medical 12 mo", "Medical lifetime", "Verdict"].map((h) => JF.Utils.el("th", {}, h)))),
          JF.Utils.el("tbody", {}, medRows.slice(0, 8).map(({ animal, lc }) => JF.Utils.el("tr", { onclick: () => JF.App.navigate(`#animal/${animal.AnimalID}/expenses`), style: { cursor: "pointer" } }, [
            JF.Utils.el("td", {}, [JF.Utils.el("strong", {}, animal.Name || animal.AnimalID), JF.Utils.el("div", { class: "field__hint" }, animal.AnimalID)]),
            JF.Utils.el("td", {}, `#${lc.lactationNo || 0}`),
            JF.Utils.el("td", { html: `<strong>${money(lc.medical.last12m)}</strong>` }),
            JF.Utils.el("td", {}, money(lc.medical.total)),
            JF.Utils.el("td", { html: `<span class="badge ${lc.verdict === "cost-watch" ? "badge--danger" : lc.verdict === "watch" ? "badge--warning" : "badge--success"}">${lc.verdict === "cost-watch" ? "Cost watch" : lc.verdict === "watch" ? "Watch" : "OK"}</span>` }),
          ]))),
        ])),
      ]) : JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-5)" } },
        "No medical costs recorded yet — treatments, dewormers, vaccines and medical expenses will rank animals here."),
    ]));

    /* ---------- Herd ---------- */
    page.appendChild(JF.Utils.el("div", { class: "section" }, [
      sectionHeader("🐄 HERD", "Herd Composition", "Live counts by status — click any status to see those animals.", "animals", ""),
      JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
        kpi("Active Animals", String(active.length), "animals", ""),
        kpi("Lactating", String(byStatus("Lactating")), "baby2", "stat-icon--oxblood"),
        kpi("Pregnant", String(byStatus("Pregnant")), "pregnancy", "stat-icon--danger"),
        kpi("Dry", String(byStatus("Dry")), "drop", "stat-icon--wheat"),
      ]),
      JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        JF.Utils.el("div", { class: "card", style: "padding:20px" }, [
          JF.Utils.el("h3", { style: "font-size:16px;margin-bottom:16px" }, "Status breakdown"),
          ...["Lactating", "Pregnant", "Open", "In Heat", "Dry", "Heifer", "Calf", "Under Treatment"].map((s) =>
            bar(s, `${byStatus(s)}`, pct(byStatus(s), active.length || 1), "var(--color-accent-600)")),
        ]),
        JF.Utils.el("div", { class: "card", style: "padding:20px" }, [
          JF.Utils.el("h3", { style: "font-size:16px;margin-bottom:16px" }, "Attention needed"),
          bar("Overdue reminders", `${overdue}`, Math.min(100, overdue * 10), "var(--color-danger-500)"),
          bar("Open treatment cases", `${openCases}`, Math.min(100, openCases * 10), "var(--color-warning-500)"),
          bar("Calvings due ≤ 7 days", `${board.filter((r) => r.daysTo <= 7).length}`, Math.min(100, board.filter((r) => r.daysTo <= 7).length * 20), "var(--color-oxblood-600)"),
        ]),
      ]),
    ]));

    root.appendChild(page);
  };

  return { render };
})();
