JF.Views = JF.Views || {};
JF.Views.Reports = (function () {
  const $ = () => document.getElementById("view-container");

  const money = (n) => JF.Utils.money(n || 0);
  const td = (h) => JF.Utils.el("td", { html: h });

  const cycleStats = (dates) => {
    const ds = dates.map((d) => new Date(d)).filter((d) => !isNaN(d)).sort((a, b) => b - a);
    const iv = [];
    for (let i = 1; i < ds.length; i++) iv.push(Math.round((ds[i - 1] - ds[i]) / 86400000));
    const avg = iv.length ? Math.round((iv.reduce((a, b) => a + b, 0) / iv.length) * 10) / 10 : null;
    return { count: ds.length, avg, min: iv.length ? Math.min(...iv) : null, max: iv.length ? Math.max(...iv) : null, last: ds[0] };
  };

  const build = async () => {
    const [animals, heats, ais, pregs, calvs, healths, dews, vax, deaths, purchases, sales, expenses, journal] = await Promise.all([
      JF.Store.animals.list(), JF.Store.heat.list(), JF.Store.insemination.list(),
      JF.Store.pregnancy.list(), JF.Store.calving.list(), JF.Store.health.list(),
      JF.Store.deworming.list(), JF.Store.vaccination.list(), JF.Store.death.list(),
      JF.Store.purchases.list(), JF.Store.sales.list(), JF.Store.expenses.list(), JF.Store.journal.list(),
    ]);
    const name = (id) => { const a = animals.find((x) => x.AnimalID === id); return a ? `${a.Name || ""} (${id})` : (id || "—"); };
    const active = animals.filter((a) => !["Sold", "Deceased"].includes(a.CurrentStatus));
    return { animals, active, heats, ais, pregs, calvs, healths, dews, vax, deaths, purchases, sales, expenses, journal, name };
  };

  /* ---------- 28 report definitions ---------- */
  const G = {};
  const R = (slug, group, title, run) => { G[slug] = { group, title, run }; };

  // Animal (7)
  R("complete-register", "animal", "Complete Animal Register", async () => {
    const { animals } = await build();
    return {
      headers: ["Animal ID", "Name", "Species", "Breed", "Gender", "DOB", "Age", "Status", "Group", "Location"],
      rows: animals.map((a) => [a.AnimalID, a.Name, a.Species, a.Breed, a.Gender, fmt(a.DateOfBirth), JF.Utils.ageLabel(a.DateOfBirth), a.CurrentStatus, a.CurrentGroup || "—", a.CurrentLocation || "—"]),
      footers: [`${animals.length} animals`, "", "", "", "", "", "", "", "", ""],
    };
  });
  R("active-herd", "animal", "Active Herd", async () => {
    const { active } = await build();
    return {
      headers: ["Animal ID", "Name", "Breed", "Age", "Status", "Location"],
      rows: active.map((a) => [a.AnimalID, a.Name, a.Breed, JF.Utils.ageLabel(a.DateOfBirth), a.CurrentStatus, a.CurrentLocation || "—"]),
      footers: [`${active.length} active`, "", "", "", "", ""],
    };
  });
  R("pregnant", "animal", "Pregnant Animals", async () => {
    const { active } = await build();
    const list = active.filter((a) => a.CurrentStatus === "Pregnant");
    return {
      headers: ["Animal ID", "Name", "Breed", "Age", "Status"],
      rows: list.map((a) => [a.AnimalID, a.Name, a.Breed, JF.Utils.ageLabel(a.DateOfBirth), a.CurrentStatus]),
      footers: [`${list.length} pregnant`, "", "", "", ""],
    };
  });
  R("open", "animal", "Open (Empty) Females", async () => {
    const { active } = await build();
    const list = active.filter((a) => a.Gender === "Female" && a.CurrentStatus === "Open");
    return {
      headers: ["Animal ID", "Name", "Breed", "Age", "Status"],
      rows: list.map((a) => [a.AnimalID, a.Name, a.Breed, JF.Utils.ageLabel(a.DateOfBirth), a.CurrentStatus]),
      footers: [`${list.length} open`, "", "", "", ""],
    };
  });
  R("in-heat", "animal", "In Heat", async () => {
    const { active } = await build();
    const list = active.filter((a) => a.CurrentStatus === "In Heat");
    return {
      headers: ["Animal ID", "Name", "Breed", "Status", "Location"],
      rows: list.map((a) => [a.AnimalID, a.Name, a.Breed, a.CurrentStatus, a.CurrentLocation || "—"]),
      footers: [`${list.length} in heat`, "", "", "", ""],
    };
  });
  R("sold", "animal", "Sold Animals", async () => {
    const { animals, sales } = await build();
    const sold = animals.filter((a) => a.CurrentStatus === "Sold");
    return {
      headers: ["Animal ID", "Name", "Breed", "Sold Via", "Date", "Net Price"],
      rows: sold.map((a) => {
        const s = sales.find((x) => x.AnimalID === a.AnimalID);
        return [a.AnimalID, a.Name, a.Breed, s?.Buyer || "—", s ? fmt(s.Date) : "—", s ? money(s.NetSale || s.SalePrice) : "—"];
      }),
      footers: [`${sold.length} sold`, "", "", "", "", ""],
    };
  });
  R("deceased", "animal", "Deceased Animals", async () => {
    const { animals, deaths } = await build();
    const dead = animals.filter((a) => a.CurrentStatus === "Deceased");
    return {
      headers: ["Animal ID", "Name", "Breed", "Date", "Cause", "Vet"],
      rows: dead.map((a) => {
        const d = deaths.find((x) => x.AnimalID === a.AnimalID);
        return [a.AnimalID, a.Name, a.Breed, d ? fmt(d.Date) : "—", d?.Cause || "—", d?.Veterinarian || "—"];
      }),
      footers: [`${dead.length} deceased`, "", "", "", "", ""],
    };
  });

  // Reproduction (7)
  R("heat-history", "repro", "Heat History", async () => {
    const { heats, name } = await build();
    const rows = [...heats].sort((a, b) => new Date(b.HeatDate) - new Date(a.HeatDate))
      .map((h) => [fmt(h.HeatDate), name(h.AnimalID), h.HeatIntensity || "—", h.DetectionMethod || "—", (h.Symptoms || []).join(", ") || "—"]);
    return { headers: ["Date", "Animal", "Intensity", "Detection", "Symptoms"], rows, footers: [`${rows.length} records`, "", "", "", ""] };
  });
  R("heat-cycle", "repro", "Heat Cycle Analysis", async () => {
    const { heats, name } = await build();
    const byA = {};
    heats.forEach((h) => { if (h.AnimalID) (byA[h.AnimalID] = byA[h.AnimalID] || []).push(h.HeatDate); });
    const rows = Object.entries(byA).map(([id, dates]) => {
      const s = cycleStats(dates);
      const expNext = s.avg && s.last ? fmt(JF.Utils.addDays(s.last, Math.round(s.avg))) : "—";
      return [name(id), s.count, s.avg ? `${s.avg}d` : "—", s.min ? `${s.min}d` : "—", s.max ? `${s.max}d` : "—", s.last ? fmt(s.last) : "—", expNext];
    });
    return { headers: ["Animal", "Heats", "Avg Cycle", "Shortest", "Longest", "Last Heat", "Expected Next"], rows, footers: [`${rows.length} animals`, "", "", "", "", "", ""] };
  });
  R("insemination", "repro", "Insemination List", async () => {
    const { ais, name } = await build();
    const rows = [...ais].sort((a, b) => new Date(b.Date) - new Date(a.Date))
      .map((x) => [fmt(x.Date), name(x.AnimalID), x.Method || "AI", x.SemenBullID || "—", x.Technician || "—", x.Cost ? money(x.Cost) : "—"]);
    return { headers: ["Date", "Animal", "Method", "Bull/Semen", "Technician", "Cost"], rows, footers: [`${rows.length} records`, "", "", "", "", ""] };
  });
  R("pregnancy", "repro", "Pregnancy Check List", async () => {
    const { pregs, name } = await build();
    const rows = [...pregs].sort((a, b) => new Date(b.Date) - new Date(a.Date))
      .map((p) => [fmt(p.Date), name(p.AnimalID), p.Method || "—", p.Result || "Unknown", p.Veterinarian || "—"]);
    return { headers: ["Date", "Animal", "Method", "Result", "Vet"], rows, footers: [`${rows.length} checks`, "", "", "", ""] };
  });
  R("calving-list", "repro", "Calving List", async () => {
    const { calvs, name } = await build();
    const rows = [...calvs].sort((a, b) => new Date(b.Date) - new Date(a.Date))
      .map((c) => [fmt(c.Date), name(c.AnimalID), c.CalfID || "—", c.CalfGender || "—", c.CalfWeight ? `${c.CalfWeight} kg` : "—", c.CalvingType || "—"]);
    return { headers: ["Date", "Mother", "Calf", "Gender", "Weight", "Type"], rows, footers: [`${rows.length} calvings`, "", "", "", "", ""] };
  });
  R("expected-calving", "repro", "Expected Calvings", async () => {
    const { pregs, ais, name } = await build();
    const gest = Number((await JF.Store.settings.allMap()).GestationDays ?? 283);
    const rows = [];
    for (const p of pregs.filter((x) => x.Result === "Positive")) {
      const ai = ais.find((x) => x.id === p.InseminationID || x.InseminationID === p.InseminationID);
      const calvDate = JF.Utils.addDays(ai?.Date || p.Date, gest);
      const left = JF.Utils.daysBetween(JF.Utils.today(), calvDate);
      rows.push([name(p.AnimalID), fmt(p.Date), p.InseminationID || "—", fmt(calvDate), left >= 0 ? `${left} days` : `${-left} days overdue`]);
    }
    return { headers: ["Animal", "Positive PD", "Linked AI", "Expected Calving", "Remaining"], rows, footers: [`${rows.length} expected`, "", "", "", ""] };
  });
  R("repro-perf", "repro", "Reproductive Performance", async () => {
    const { pregs, ais, calvs, animals } = await build();
    const posCount = pregs.filter((p) => p.Result === "Positive").length;
    const conception = pregs.length ? Math.round((posCount / pregs.length) * 100) : 0;
    // Calving interval: gap between consecutive calvings per animal (average)
    const byA = {};
    calvs.forEach((c) => { if (c.AnimalID) (byA[c.AnimalID] = byA[c.AnimalID] || []).push(new Date(c.Date)); });
    const gaps = [];
    Object.values(byA).forEach((ds) => {
      ds.sort((a, b) => a - b);
      for (let i = 1; i < ds.length; i++) gaps.push(Math.round((ds[i] - ds[i - 1]) / 86400000));
    });
    const avgCI = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
    const rows = [
      ["Conception rate (pos PD / total PD)", `${conception}%`, `${posCount}/${pregs.length}`],
      ["Total inseminations", String(ais.length), `${ais.length} services`],
      ["Calvings recorded", String(calvs.length), ""],
      ["Average calving interval", avgCI ? `${avgCI} days` : "—", "needs 2+ calvings per animal"],
      ["Heifers / pregnant / open", `${animals.filter((a) => a.CurrentStatus === "Heifer").length} / ${animals.filter((a) => a.CurrentStatus === "Pregnant").length} / ${animals.filter((a) => a.CurrentStatus === "Open").length}`, "current herd state"],
    ];
    return { headers: ["Metric", "Value", "Basis"], rows };
  });

  // Health (5)
  R("treatments", "health", "Treatment List", async () => {
    const { healths, name } = await build();
    const rows = [...healths].sort((a, b) => new Date(b.Date) - new Date(a.Date))
      .map((h) => [fmt(h.Date), name(h.AnimalID), h.Problem || "—", h.Diagnosis || "—", h.Medicine || "—", h.TreatmentCost ? money(h.TreatmentCost) : "—", h.RecoveryStatus || "Open"]);
    return { headers: ["Date", "Animal", "Problem", "Diagnosis", "Medicine", "Cost", "Status"], rows, footers: [`${rows.length} cases`, "", "", "", "", "", ""] };
  });
  R("disease-freq", "health", "Disease Frequency", async () => {
    const { healths } = await build();
    const map = {};
    healths.forEach((h) => {
      const key = h.Diagnosis || h.Problem || "Unknown";
      map[key] = map[key] || { cases: 0, animals: new Set(), cost: 0 };
      map[key].cases++; if (h.AnimalID) map[key].animals.add(h.AnimalID);
      map[key].cost += Number(h.TreatmentCost || 0);
    });
    const rows = Object.entries(map).sort((a, b) => b[1].cases - a[1].cases)
      .map(([k, v]) => [k, String(v.cases), String(v.animals.size), money(v.cost)]);
    return { headers: ["Diagnosis / Problem", "Cases", "Animals Affected", "Total Cost"], rows, footers: [`${rows.length} conditions`, "", "", ""] };
  });
  R("vaccination", "health", "Vaccination List + Compliance", async () => {
    const { vax, name, active } = await build();
    const rows = [...vax].sort((a, b) => new Date(b.DateGiven) - new Date(a.DateGiven))
      .map((v) => [fmt(v.DateGiven), name(v.AnimalID), v.Vaccine || "—", v.BatchNumber || "—", v.NextDueDate ? fmt(v.NextDueDate) : "—"]);
    const covered = new Set(vax.map((v) => v.AnimalID).filter(Boolean));
    const compliance = active.length ? Math.round((covered.size / active.length) * 100) : 0;
    rows.unshift([`— Compliance: ${compliance}% of active herd has ≥1 vaccination record —`, "", "", "", ""]);
    return { headers: ["Date", "Animal", "Vaccine", "Batch", "Next Due"], rows, footers: [`${vax.length} vaccinations`, "", "", "", ""] };
  });
  R("deworming", "health", "Deworming List + Compliance", async () => {
    const { dews, name, active } = await build();
    const rows = [...dews].sort((a, b) => new Date(b.Date) - new Date(a.Date))
      .map((d) => [fmt(d.Date), name(d.AnimalID), d.Medicine || "—", d.Dose || "—", d.NextDueDate ? fmt(d.NextDueDate) : "—"]);
    const covered = new Set(dews.map((d) => d.AnimalID).filter(Boolean));
    const compliance = active.length ? Math.round((covered.size / active.length) * 100) : 0;
    rows.unshift([`— Compliance: ${compliance}% of active herd has ≥1 deworming record —`, "", "", "", ""]);
    return { headers: ["Date", "Animal", "Medicine", "Dose", "Next Due"], rows, footers: [`${dews.length} dewormings`, "", "", "", ""] };
  });
  R("health-expenses", "health", "Health Expenses by Category", async () => {
    const { journal } = await build();
    const HEALTH = ["Veterinary Expense", "Medicine Expense", "Vaccination Expense", "Deworming Expense"];
    const map = {};
    journal.filter((e) => HEALTH.includes(e.DebitAccount)).forEach((e) => {
      map[e.DebitAccount] = (map[e.DebitAccount] || 0) + Number(e.Amount || 0);
    });
    const rows = Object.entries(map).map(([k, v]) => [k, money(v)]);
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return { headers: ["Expense Account", "Total"], rows, footers: ["Total", money(total)] };
  });

  // Financial (9 + cash/bank book + per-animal = 11 registered under fin; spec counts 9)
  R("expenses", "fin", "Expense Statement", async () => {
    const { expenses } = await build();
    const rows = [...expenses].sort((a, b) => new Date(b.Date) - new Date(a.Date))
      .map((e) => [fmt(e.Date), e.Category || "—", e.Description || "—", e.Vendor || "—", e.AnimalID || "—", e.PaymentMethod || "—", money(e.Amount)]);
    const total = expenses.reduce((s, e) => s + Number(e.Amount || 0), 0);
    return { headers: ["Date", "Category", "Description", "Vendor", "Animal", "Payment", "Amount"], rows, footers: ["Total", "", "", "", "", "", money(total)] };
  });
  R("purchase-register", "fin", "Purchase Register", async () => {
    const { purchases } = await build();
    const rows = purchases.map((p) => [fmt(p.Date), p.Seller || "—", p.AnimalID || "—", money(p.PurchasePrice), money(p.TransportationCost), money(p.VeterinaryCheckCost), money(p.TotalCost)]);
    const total = purchases.reduce((s, p) => s + Number(p.TotalCost || 0), 0);
    return { headers: ["Date", "Seller", "Animal", "Price", "Transport", "Vet Check", "Total"], rows, footers: ["Total", "", "", "", "", "", money(total)] };
  });
  R("sale-register", "fin", "Sale Register", async () => {
    const { sales } = await build();
    const rows = sales.map((s) => [fmt(s.Date), s.Buyer || "—", s.AnimalID || "—", money(s.SalePrice), money((Number(s.Transportation || 0) + Number(s.Commission || 0) + Number(s.OtherCost || 0))), money(s.NetSale)]);
    const total = sales.reduce((st, s) => st + Number(s.NetSale || 0), 0);
    return { headers: ["Date", "Buyer", "Animal", "Price", "Deductions", "Net"], rows, footers: ["Total", "", "", "", "", money(total)] };
  });
  R("journal", "fin", "Journal", async () => {
    const { journal } = await build();
    const rows = [...journal].sort((a, b) => new Date(b.Date) - new Date(a.Date))
      .map((j) => [fmt(j.Date), j.Description || j.TransactionType || "Entry", j.DebitAccount || "—", j.CreditAccount || "—", money(j.Amount), j.ReferenceID || "—"]);
    const total = journal.reduce((s, j) => s + Number(j.Amount || 0), 0);
    return { headers: ["Date", "Description", "Dr", "Cr", "Amount", "Reference"], rows, footers: ["Total", "", "", "", money(total), ""] };
  });
  R("ledger", "fin", "General Ledger (account summary)", async () => {
    const { journal } = await build();
    const totals = JF.FinanceCalc.accountTotals(journal);
    const rows = Object.entries(totals).sort((a, b) => a[0].localeCompare(b[0])).map(([acct, b]) => {
      const net = b.dr - b.cr;
      return [acct, money(b.dr), money(b.cr), net >= 0 ? `${money(net)} Dr` : `${money(-net)} Cr`];
    });
    return { headers: ["Account", "Total Dr", "Total Cr", "Net Balance"], rows };
  });
  R("trialbalance", "fin", "Trial Balance", async () => {
    const { journal } = await build();
    const tb = JF.FinanceCalc.trialBalance(journal);
    const rows = tb.rows.map((r) => [r.account, r.dr ? money(r.dr) : "—", r.cr ? money(r.cr) : "—"]);
    rows.push(tb.balanced ? ["✓ BALANCED", money(tb.totalDr), money(tb.totalCr)] : [`⚠ DIFFERENCE: ${money(Math.abs(tb.difference))}`, money(tb.totalDr), money(tb.totalCr)]);
    return { headers: ["Account", "Debit", "Credit"], rows };
  });
  R("pnl", "fin", "Profit & Loss", async () => {
    const { journal } = await build();
    const p = JF.FinanceCalc.pnl(journal);
    const rows = [["INCOME", "", ""], ...p.income.map((x) => ["", x.account, money(x.amount)]), ["Total income", "", money(p.totalIncome)], ["", "", ""], ["EXPENSES", "", ""], ...p.expenses.map((x) => ["", x.account, money(x.amount)]), ["Total expenses", "", money(p.totalExpense)], ["", "", ""], ["NET PROFIT / (LOSS)", "", money(p.net)]];
    return { headers: ["Section", "Line", "Amount"], rows };
  });
  R("balancesheet", "fin", "Balance Sheet", async () => {
    const { journal } = await build();
    const b = JF.FinanceCalc.balanceSheet(journal);
    const rows = [
      ["ASSETS", "", ""], ...b.assets.map((x) => ["", x.account, money(x.amount)]), ["Total assets", "", money(b.totalAssets)], ["", "", ""],
      ["LIABILITIES", "", ""], ...b.liabilities.map((x) => ["", x.account, money(x.amount)]), ["Total liabilities", "", money(b.totalLiabilities)], ["", "", ""],
      ["EQUITY", "", ""], ...b.equity.map((x) => ["", x.account, money(x.amount)]), ["Total equity", "", money(b.totalEquity)], ["", "", ""],
      [b.balanced ? "✓ BALANCED (A = L + E)" : `⚠ DIFFERENCE: ${money(Math.abs(b.difference))}`, "", ""],
    ];
    return { headers: ["Section", "Line", "Amount"], rows };
  });
  R("cashbook", "fin", "Cash Book", async () => {
    const { journal } = await build();
    const cb = JF.FinanceCalc.cashBook(journal, "Cash");
    const rows = [];
    rows.push(["", "OPENING BALANCE", "", money(cb.opening), ""]);
    cb.receipts.forEach((r) => rows.push([fmt(r.date), r.particulars, r.ref, money(r.amount), r.contra ? "contra" : ""]));
    cb.payments.forEach((p) => rows.push([fmt(p.date), p.particulars, p.ref, "", money(p.amount)]));
    rows.push(["", `RECEIPTS ${money(cb.totalReceipts)} · PAYMENTS ${money(cb.totalPayments)}`, "", "", ""]);
    rows.push(["", "CLOSING BALANCE", "", money(cb.closing), ""]);
    return { headers: ["Date", "Particulars", "Ref", "Receipt (Dr)", "Payment (Cr)"], rows };
  });
  R("bankbook", "fin", "Bank Book", async () => {
    const { journal } = await build();
    const cb = JF.FinanceCalc.cashBook(journal, "Bank");
    const rows = [];
    rows.push(["", "OPENING BALANCE", "", money(cb.opening), ""]);
    cb.receipts.forEach((r) => rows.push([fmt(r.date), r.particulars, r.ref, money(r.amount), r.contra ? "contra" : ""]));
    cb.payments.forEach((p) => rows.push([fmt(p.date), p.particulars, p.ref, "", money(p.amount)]));
    rows.push(["", `RECEIPTS ${money(cb.totalReceipts)} · PAYMENTS ${money(cb.totalPayments)}`, "", "", ""]);
    rows.push(["", "CLOSING BALANCE", "", money(cb.closing), ""]);
    return { headers: ["Date", "Particulars", "Ref", "Receipt (Dr)", "Payment (Cr)"], rows };
  });
  R("per-animal-cost", "fin", "Per-Animal Cost", async () => {
    const { journal, name } = await build();
    const map = {};
    journal.filter((e) => e.AnimalID && (e.DebitAccount || "").includes("Expense")).forEach((e) => {
      map[e.AnimalID] = (map[e.AnimalID] || 0) + Number(e.Amount || 0);
    });
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1]).map(([id, v]) => [name(id), money(v)]);
    return { headers: ["Animal", "Total Expense Posted"], rows, footers: [`${rows.length} animals with costs`, ""] };
  });

  const fmt = (d) => JF.Utils.formatDate(d);

  /* ---------- Landing ---------- */
  const GROUPS = [
    { id: "animal", title: "Animal Reports", icon: "animals", eyebrow: "🐄 ANIMAL" },
    { id: "repro", title: "Reproduction Reports", icon: "heart", eyebrow: "🔄 REPRODUCTION" },
    { id: "health", title: "Health Reports", icon: "health", eyebrow: "🩺 HEALTH" },
    { id: "fin", title: "Financial Reports", icon: "finance", eyebrow: "💰 FINANCIAL" },
  ];

  const landing = () => {
    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "📊 Reports Center"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, "All Reports"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          `${Object.keys(G).length} live reports built from your records — print or export any of them.`),
      ]),
    ]));
    page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-2" }, GROUPS.map((g) => {
      const slugs = Object.entries(G).filter(([, v]) => v.group === g.id);
      return JF.Utils.el("div", { class: "card" }, [
        JF.Utils.el("div", { class: "card__header" }, [
          JF.Utils.el("div", {}, [
            JF.Utils.el("div", { class: "card__eyebrow" }, g.eyebrow),
            JF.Utils.el("h3", { class: "section__title", style: { margin: 0 } }, `${g.title} `,
              JF.Utils.el("span", { class: "chip" }, `${slugs.length} reports`)),
          ]),
          JF.Utils.el("div", { class: "stat-icon", html: JF.Utils.svgIcon(g.icon, 20, 20) }),
        ]),
        JF.Utils.el("div", { class: "divider" }),
        JF.Utils.el("div", { style: { display: "flex", flexDirection: "column", gap: "var(--space-3)" } },
          slugs.map(([slug, def]) => JF.Utils.el("a", {
            href: `#reports/${slug}`, class: "chip",
            style: { justifyContent: "space-between", padding: "10px var(--space-4)", width: "100%", cursor: "pointer", borderRadius: "var(--radius-md)", fontSize: "var(--fs-sm)", fontWeight: 500 },
            html: `<span>${def.title}</span>${JF.Utils.svgIcon("arrowRight", 14, 14)}`,
          }))),
      ]);
    })));
    return page;
  };

  /* ---------- Report page ---------- */
  const csvBtn = (headers, rows) => JF.Utils.el("button", {
    class: "btn btn--ghost btn--sm", onclick: () => {
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [headers.map(esc).join(",")];
      rows.forEach((tr) => lines.push([...tr.children].map((c) => c.innerText).map(esc).join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "report.csv";
      a.click();
      JF.Toast.show("CSV exported (client-side stub).", "success");
    },
  }, "Export CSV");

  const reportPage = async (slug) => {
    const def = G[slug];
    const page = JF.Utils.el("div", { class: "page" });
    let result;
    try { result = await def.run(); }
    catch (e) { console.error("Report failed:", slug, e); result = { headers: ["Error"], rows: [[String(e.message || e)]] }; }
    const { headers, rows, footers } = result;
    page.appendChild(JF.Utils.el("a", { class: "eyebrow", href: "#reports", style: { marginBottom: "var(--space-3)", cursor: "pointer", display: "inline-block" }, html: "← All reports" }));
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "📊 REPORT"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, def.title),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        csvBtn(headers, rows),
        JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => window.print() }, "Print"),
      ]),
    ]));

    const t = JF.Utils.el("table", { class: "table" });
    t.appendChild(JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, headers.map((h) => JF.Utils.el("th", {}, h)))));
    t.appendChild(JF.Utils.el("tbody", {}, rows.length
      ? rows.map((r) => JF.Utils.el("tr", {}, r.map((c) => typeof c === "string" && /[<>]/.test(c) ? td(c) : JF.Utils.el("td", {}, c))))
      : [JF.Utils.el("tr", {}, JF.Utils.el("td", { colspan: String(headers.length), style: "text-align:center;padding:24px;color:var(--color-ink-400)" }, "No data for this report."))]));
    if (footers) t.appendChild(JF.Utils.el("tfoot", {}, JF.Utils.el("tr", { style: "font-weight:bold;background:var(--color-bg-soft)" }, footers.map((f) => JF.Utils.el("td", { html: String(f) })))));
    page.appendChild(JF.Utils.el("div", { class: "table-container card" }, t));
    return page;
  };

  const render = async (path = []) => {
    const root = $();
    JF.Utils.clear(root);
    const slug = path?.[1];
    if (slug && G[slug]) root.appendChild(await reportPage(slug));
    else if (slug) root.appendChild(JF.Utils.el("div", { class: "page" },
      JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-7)" } }, `Unknown report "${slug}".`)));
    else root.appendChild(landing());
  };

  return { render, REPORTS: G };
})();
