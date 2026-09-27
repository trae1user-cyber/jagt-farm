JF.Views = JF.Views || {};
JF.Views.Finance = (function () {
  const $ = () => document.getElementById("view-container");
  const money = (n) => JF.Utils.money(n || 0);

  const SUB = {
    overview:     { label: "Overview",      icon: "reports" },
    expenses:     { label: "Expenses",      icon: "money" },
    purchases:    { label: "Purchases",     icon: "purchase" },
    sales:        { label: "Cattle Sales",  icon: "sale" },
    journal:      { label: "Journal",       icon: "document" },
    ledger:       { label: "Ledger",        icon: "docs" },
    trialbalance: { label: "Trial Balance", icon: "check" },
    pl:           { label: "Profit & Loss", icon: "reports" },
    balancesheet: { label: "Balance Sheet", icon: "finance" },
    cashbook:     { label: "Cash Book",     icon: "money" },
    bankbook:     { label: "Bank Book",     icon: "finance" },
  };

  const subNav = (active) => {
    const row = JF.Utils.el("div", { class: "tabs", style: { marginBottom: "var(--space-5)", flexWrap: "wrap" } });
    Object.entries(SUB).forEach(([k, v]) => row.appendChild(JF.Utils.el("a", {
      class: `tab ${active === k ? "is-active" : ""}`, href: `#finance/${k}`,
    }, v.label)));
    return row;
  };

  const TD = (html) => { const td = document.createElement("td"); td.innerHTML = html; return td; };

  const table = (headers, rows, footers, emptyMsg = "No transactions recorded.") => {
    if (!rows.length && !footers) return JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-7)" } }, emptyMsg);
    const t = JF.Utils.el("table", { class: "table" });
    t.appendChild(JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, headers.map((h) => JF.Utils.el("th", {}, h)))));
    t.appendChild(JF.Utils.el("tbody", {}, rows.length ? rows : [JF.Utils.el("tr", {}, JF.Utils.el("td", { colspan: String(headers.length), style: "text-align:center;padding:24px;color:var(--color-ink-400)" }, emptyMsg))]));
    if (footers) t.appendChild(JF.Utils.el("tfoot", {}, JF.Utils.el("tr", { style: "font-weight:bold;background:var(--color-bg-soft)" }, footers.map((f) => JF.Utils.el("td", { html: String(f) })))));
    return JF.Utils.el("div", { class: "table-container card" }, t);
  };

  const statCard = (label, value) => JF.Utils.el("div", { class: "card card--stat" }, [
    JF.Utils.el("div", { class: "stat-number" }, String(value ?? "—")),
    JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, label),
  ]);

  const badge = (txt, cls) => `<span class="badge ${cls}">${txt}</span>`;

  const render = async (path = []) => {
    const sub = path?.[1] || "overview";
    const root = $();
    JF.Utils.clear(root);

    const [expenses, purchases, sales, journal, milkSales] = await Promise.all([
      JF.Store.expenses.list().catch(() => []),
      JF.Store.purchases.list().catch(() => []),
      JF.Store.sales.list().catch(() => []),
      JF.Store.journal.list().catch(() => []),
      JF.Store.milkSales.list().catch(() => []),
    ]);

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "💰 Finance & Accounting"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, SUB[sub]?.label || "Expenses"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Double-entry bookkeeping — every operational entry posts a balanced Dr/Cr journal pair automatically."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", {
          class: "btn btn--primary btn--icon-label btn--sm",
          html: `${JF.Utils.svgIcon("plus", 14, 14)} New Entry`,
          onclick: () => JF.QuickEntry?.openPicker(),
        }),
      ]),
    ]));
    page.appendChild(subNav(sub));

    /* ---------- Overview: graphs + milk income + asset value (all from entries) ---------- */
    if (sub === "overview") {
      const milk = JF.FinanceCalc.milkAnalytics(milkSales);
      const series = JF.FinanceCalc.monthlySeries(journal, 6);
      const p = JF.FinanceCalc.pnl(journal);
      const b = JF.FinanceCalc.balanceSheet(journal);

      const maxBar = Math.max(1, ...series.map((s) => Math.max(s.income, s.expense)));
      const barChart = (data, h = 120) => JF.Utils.el("div", { style: { display: "flex", alignItems: "flex-end", gap: "10px", height: `${h}px`, padding: "0 4px" } },
        data.map((s) => JF.Utils.el("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", height: "100%", justifyContent: "flex-end" } }, [
          JF.Utils.el("div", { style: { display: "flex", gap: "3px", alignItems: "flex-end", height: "100%", width: "100%", justifyContent: "center" } }, [
            JF.Utils.el("div", { title: `Income ${money(s.income)}`, style: { width: "38%", height: `${Math.max(2, (s.income / maxBar) * (h - 24))}px`, background: "var(--color-success-500)", borderRadius: "4px 4px 0 0", minHeight: "2px" } }),
            JF.Utils.el("div", { title: `Expense ${money(s.expense)}`, style: { width: "38%", height: `${Math.max(2, (s.expense / maxBar) * (h - 24))}px`, background: "var(--color-oxblood-500)", borderRadius: "4px 4px 0 0", minHeight: "2px" } }),
          ]),
          JF.Utils.el("div", { class: "field__hint", style: { fontSize: "10px" } }, s.label),
        ])));

      // Category doughnut (expense mix this FY): simple stacked bar, no libs.
      const byCat = {};
      expenses.forEach((e) => { byCat[e.Category || "Other"] = (byCat[e.Category || "Other"] || 0) + Number(e.Amount || 0); });
      const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      const catTotal = cats.reduce((s, [, v]) => s + v, 0) || 1;
      const catColors = ["#27407e", "#b92473", "#cf9110", "#2e8a4f", "#a33327", "#6f4a26", "#4164b5", "#86184f", "#59452f", "#a58d6f"];
      const catBar = JF.Utils.el("div", { style: { display: "flex", height: "18px", borderRadius: "9px", overflow: "hidden", marginTop: "8px" } },
        cats.map(([k, v], i) => JF.Utils.el("div", { title: `${k}: ${money(v)}`, style: { width: `${(v / catTotal) * 100}%`, background: catColors[i % catColors.length] } })));

      const milkThisMonth = (() => {
        const key = new Date().toISOString().slice(0, 7);
        const m = milk.monthly.find((x) => x.month === key);
        return m || { litres: 0, amount: 0, entries: 0 };
      })();
      const maxMilkBar = Math.max(1, ...milk.monthly.map((m) => m.amount));

      const cashBank = (() => {
        const t = JF.FinanceCalc.accountTotals(journal);
        const acc = (n) => t[n] || { dr: 0, cr: 0 };
        return acc("Cash").dr - acc("Cash").cr + acc("Bank").dr - acc("Bank").cr;
      })();
      page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
        statCard("NET PROFIT / (LOSS)", money(p.net)),
        statCard("MILK INCOME (TOTAL)", money(milk.totalAmount)),
        statCard("ASSET VALUE", money(b.totalAssets)),
        statCard("CASH + BANK", money(cashBank)),
      ]));

      page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-2", style: { marginBottom: "var(--space-5)" } }, [
        JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)" } }, [
          JF.Utils.el("div", { class: "card__eyebrow", style: { color: "var(--color-accent-700)" } }, "INCOME VS EXPENSE · LAST 6 MONTHS"),
          JF.Utils.el("div", { style: { marginTop: "10px", display: "flex", gap: "14px", fontSize: "11px" } }, [
            JF.Utils.el("span", { style: { color: "var(--color-success-700)" } }, "■ Income"),
            JF.Utils.el("span", { style: { color: "var(--color-oxblood-700)" } }, "■ Expense"),
          ]),
          barChart(series),
        ]),
        JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)" } }, [
          JF.Utils.el("div", { class: "card__eyebrow", style: { color: "var(--color-oxblood-700)" } }, "EXPENSE MIX BY CATEGORY"),
          cats.length ? catBar : JF.Utils.el("div", { class: "field__hint", style: { marginTop: "8px" } }, "No expenses recorded yet."),
          JF.Utils.el("div", { style: { marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" } },
            cats.slice(0, 8).map(([k, v], i) => JF.Utils.el("span", { class: "badge badge--neutral", style: { fontSize: "10px" } }, `${k} · ${Math.round((v / catTotal) * 100)}%`))),
        ]),
      ]));

      // Milk production panel — the heart of a dairy business
      page.appendChild(JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)", marginBottom: "var(--space-5)" } }, [
        JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" } }, [
          JF.Utils.el("div", {}, [
            JF.Utils.el("div", { class: "card__eyebrow", style: { color: "var(--color-accent-700)" } }, "🥛 MILK INCOME · FROM PAYMENT ENTRIES"),
            JF.Utils.el("div", { style: { fontWeight: 700, fontSize: "var(--fs-lg)" } }, `${milk.totalLitres} L sold · avg ₹${milk.avgRate}/L${milk.pending ? ` · ⚠ ${money(milk.pending)} pending` : ""}`),
          ]),
          JF.Utils.el("button", { class: "btn btn--accent btn--sm", onclick: () => JF.QuickEntry.openForm("milk") }, "+ Milk Payment"),
        ]),
        JF.Utils.el("div", { class: "grid grid--cols-3", style: { margin: "12px 0" } }, [
          statCard("THIS MONTH", money(milkThisMonth.amount)),
          statCard("LITRES THIS MONTH", String(milkThisMonth.litres || 0)),
          statCard("MORNING / EVENING SPLIT", `${money(milk.shiftSplit.Morning)} / ${money(milk.shiftSplit.Evening)}`),
        ]),
        milk.monthly.length ? JF.Utils.el("div", { style: { display: "flex", alignItems: "flex-end", gap: "8px", height: "90px" } },
          milk.monthly.slice(-6).map((m) => JF.Utils.el("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: "4px" } }, [
            JF.Utils.el("div", { title: `${m.month}: ${money(m.amount)} · ${m.litres}L`, style: { width: "70%", height: `${Math.max(3, (m.amount / maxMilkBar) * 66)}px`, background: "linear-gradient(180deg, #4164b5, #27407e)", borderRadius: "5px 5px 0 0" } }),
            JF.Utils.el("div", { class: "field__hint", style: { fontSize: "10px" } }, m.month.slice(5) + "/" + m.month.slice(2, 4)),
          ]))) : JF.Utils.el("div", { class: "field__hint" }, "Record your first milk payment to see monthly production here."),
      ]));

      page.appendChild(JF.Utils.el("div", { class: "field__hint" },
        "Everything on this page is computed from your entries only — no estimates, no dummy data. Post a milk payment, expense, purchase or sale from Quick Entry and this page updates instantly."));
    }

    /* ---------- Expenses ---------- */
    if (sub === "expenses") {
      const byCat = {};
      expenses.forEach((e) => { byCat[e.Category || "Other"] = (byCat[e.Category || "Other"] || 0) + Number(e.Amount || 0); });
      page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
        statCard("TOTAL EXPENSES", money(expenses.reduce((s, e) => s + Number(e.Amount || 0), 0))),
        statCard("ENTRIES", expenses.length),
        statCard("CATEGORIES", Object.keys(byCat).length),
        statCard("THIS MONTH", money(expenses.filter((e) => new Date(e.Date).getMonth() === new Date().getMonth()).reduce((s, e) => s + Number(e.Amount || 0), 0))),
      ]));

      /* ---- MEDICAL COST PER ANIMAL — which cow is not paying her way ---- */
      let medRows = [];
      try { medRows = await JF.LifeCycle.medicalEconomics(); } catch (e) { console.warn(e); }
      if (medRows.length) {
        const verdictBadge = (v) => ({ "cost-watch": "badge--danger", watch: "badge--warning", ok: "badge--success" }[v] || "badge--neutral");
        const verdictLabel = (v) => ({ "cost-watch": "⚠ Cost watch", watch: "Watch", ok: "OK" }[v] || "—");
        const section = JF.Utils.el("div", { class: "card", style: { marginBottom: "var(--space-5)" } }, [
          JF.Utils.el("div", { class: "card__header" }, [
            JF.Utils.el("div", {}, [
              JF.Utils.el("div", { class: "card__eyebrow" }, "🩺 COST-ECONOMICS"),
              JF.Utils.el("h3", { class: "section__title", style: { margin: 0 } }, "Medical Cost per Animal"),
            ]),
          ]),
          JF.Utils.el("div", { class: "table-container" }, JF.Utils.el("table", { class: "table" }, [
            JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, ["Animal", "Treatments", "Deworm/Vacc", "Med. Expenses", "Last 12 mo", "Lifetime", "Verdict"].map((h) => JF.Utils.el("th", {}, h)))),
            JF.Utils.el("tbody", {}, medRows.map(({ animal, lc }) => JF.Utils.el("tr", {
              onclick: () => JF.App.navigate(`#animal/${animal.AnimalID}/expenses`), style: { cursor: "pointer" },
            }, [
              JF.Utils.el("td", {}, [JF.Utils.el("strong", {}, animal.Name || animal.AnimalID), JF.Utils.el("div", { class: "field__hint" }, animal.AnimalID)]),
              JF.Utils.el("td", {}, money(lc.medical.parts.treatments)),
              JF.Utils.el("td", {}, money(lc.medical.parts.deworming + lc.medical.parts.vaccination)),
              JF.Utils.el("td", {}, money(lc.medical.parts.expenses)),
              JF.Utils.el("td", { html: `<strong>${money(lc.medical.last12m)}</strong>` }),
              JF.Utils.el("td", {}, money(lc.medical.total)),
              JF.Utils.el("td", { html: `<span class="badge ${verdictBadge(lc.verdict)}">${verdictLabel(lc.verdict)}</span>` }),
            ]))),
          ])),
          JF.Utils.el("div", { class: "field__hint", style: { padding: "var(--space-3) var(--space-4)" } },
            "From recorded treatments, dewormers, vaccines and medical expense entries only — no estimates. 'Cost watch' = ₹30,000+ medical spend or 5+ treatments in 12 months."),
        ]);
        page.appendChild(section);
      }

      page.appendChild(table(["Date", "Category", "Description", "Vendor", "Animal", "Payment", "Amount"],
        [...expenses].sort((a, b) => new Date(b.Date) - new Date(a.Date)).map((e) => JF.Utils.el("tr", {}, [
          TD(`<strong>${JF.Utils.formatDate(e.Date)}</strong>`),
          TD(badge(e.Category || "General", "badge--warning")),
          JF.Utils.el("td", {}, e.Description || "—"),
          JF.Utils.el("td", {}, e.Vendor || "—"),
          JF.Utils.el("td", {}, e.AnimalID ? JF.Utils.el("a", { href: `#animal/${e.AnimalID}/expenses`, style: { fontWeight: 600 } }, e.AnimalID) : "—"),
          JF.Utils.el("td", {}, e.PaymentMethod || "—"),
          JF.Utils.el("td", { html: `<strong>${money(e.Amount)}</strong>` }),
        ])),
        ["Total", "", "", "", "", "", money(expenses.reduce((s, e) => s + Number(e.Amount || 0), 0))]));
    }

    /* ---------- Purchases ---------- */
    else if (sub === "purchases") {
      page.appendChild(table(["Date", "Purchase ID", "Seller", "Animal", "Price", "Transport", "Vet Check", "Total", "Payment"],
        purchases.map((p) => JF.Utils.el("tr", {}, [
          TD(`<strong>${JF.Utils.formatDate(p.Date)}</strong>`),
          JF.Utils.el("td", {}, p.PurchaseID || p.id),
          JF.Utils.el("td", {}, p.Seller || "—"),
          JF.Utils.el("td", {}, p.AnimalID ? JF.Utils.el("a", { href: `#animal/${p.AnimalID}/overview` }, p.AnimalID) : "—"),
          JF.Utils.el("td", {}, money(p.PurchasePrice)),
          JF.Utils.el("td", {}, money(p.TransportationCost)),
          JF.Utils.el("td", {}, money(p.VeterinaryCheckCost)),
          JF.Utils.el("td", { html: `<strong>${money(p.TotalCost)}</strong>` }),
          JF.Utils.el("td", {}, p.PaymentMethod || "—"),
        ])),
        ["Total", "", "", "", "", "", "", money(purchases.reduce((s, p) => s + Number(p.TotalCost || 0), 0)), ""]));
    }

    /* ---------- Sales ---------- */
    else if (sub === "sales") {
      page.appendChild(table(["Date", "Sale ID", "Buyer", "Animal", "Price", "Transport", "Commission", "Net", "Payment"],
        sales.map((s) => JF.Utils.el("tr", {}, [
          TD(`<strong>${JF.Utils.formatDate(s.Date)}</strong>`),
          JF.Utils.el("td", {}, s.SaleID || s.id),
          JF.Utils.el("td", {}, s.Buyer || "—"),
          JF.Utils.el("td", {}, s.AnimalID ? JF.Utils.el("a", { href: `#animal/${s.AnimalID}/overview` }, s.AnimalID) : "—"),
          JF.Utils.el("td", {}, money(s.SalePrice)),
          JF.Utils.el("td", {}, money(s.Transportation)),
          JF.Utils.el("td", {}, money(s.Commission)),
          JF.Utils.el("td", { html: `<strong>${money(s.NetSale)}</strong>` }),
          JF.Utils.el("td", {}, s.PaymentMethod || "—"),
        ])),
        ["Total", "", "", "", "", "", "", money(sales.reduce((s, x) => s + Number(x.NetSale || 0), 0)), ""]));
    }

    /* ---------- Journal ---------- */
    else if (sub === "journal") {
      page.appendChild(table(["Date", "Journal ID", "Description", "Debit (Dr)", "Credit (Cr)", "Amount", "Reference"],
        [...journal].sort((a, b) => new Date(b.Date) - new Date(a.Date)).map((j) => JF.Utils.el("tr", {}, [
          TD(`<strong>${JF.Utils.formatDate(j.Date)}</strong>`),
          JF.Utils.el("td", {}, j.JournalID || j.id),
          JF.Utils.el("td", {}, j.Description || j.TransactionType || "Entry"),
          TD(`<span style="color:var(--color-oxblood-700)">${j.DebitAccount || "—"}</span>`),
          TD(`<span style="color:var(--color-accent-700)">${j.CreditAccount || "—"}</span>`),
          JF.Utils.el("td", { html: `<strong>${money(j.Amount)}</strong>` }),
          JF.Utils.el("td", {}, j.ReferenceID || "—"),
        ])),
        ["Total", "", "", "", "", money(journal.reduce((s, j) => s + Number(j.Amount || 0), 0)), ""]));
    }

    /* ---------- Ledger ---------- */
    else if (sub === "ledger") {
      let account = "Cash";
      const draw = () => {
        const led = JF.FinanceCalc.ledger(journal, account);
        const wrap = JF.Utils.el("div", {});
        wrap.appendChild(JF.Utils.el("div", { class: "grid grid--cols-3", style: { marginBottom: "var(--space-5)" } }, [
          statCard("OPENING", money(led.opening)),
          statCard(`MOVEMENT (Dr − Cr)`, money(led.closing - led.opening)),
          statCard("CLOSING", money(led.closing)),
        ]));
        wrap.appendChild(table(["Date", "Particulars", "Ref", "Debit", "Credit", "Balance"],
          led.rows.map((r) => JF.Utils.el("tr", {}, [
            TD(`<strong>${JF.Utils.formatDate(r.date)}</strong>`),
            JF.Utils.el("td", {}, r.particulars),
            JF.Utils.el("td", {}, r.ref || "—"),
            JF.Utils.el("td", {}, r.dr ? money(r.dr) : ""),
            JF.Utils.el("td", {}, r.cr ? money(r.cr) : ""),
            JF.Utils.el("td", { html: `<strong>${money(r.balance)}</strong>` }),
          ])),
          ["Totals", "", "", money(led.totalDr), money(led.totalCr), money(led.closing)],
          `No postings to ${account} yet.`));
        return wrap;
      };
      const selector = JF.Utils.el("select", { class: "select", style: { maxWidth: "320px", marginBottom: "var(--space-5)" }, onchange: (e) => { account = e.target.value; container.replaceChildren(draw()); } },
        JF.FinanceCalc.accountList().map((a) => JF.Utils.el("option", { value: a }, a)));
      const container = JF.Utils.el("div", {}, draw());
      page.appendChild(selector);
      page.appendChild(container);
    }

    /* ---------- Trial Balance ---------- */
    else if (sub === "trialbalance") {
      const tb = JF.FinanceCalc.trialBalance(journal);
      page.appendChild(JF.Utils.el("div", { class: "card", style: { marginBottom: "var(--space-5)", padding: "var(--space-5)", display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
        JF.Utils.el("div", {}, [
          JF.Utils.el("div", { class: "card__eyebrow" }, "VERIFICATION"),
          JF.Utils.el("div", { style: { fontWeight: 700, fontSize: "var(--fs-lg)" } }, tb.balanced ? "✓ Balanced" : `⚠ Difference: ${money(Math.abs(tb.difference))}`),
        ]),
        JF.Utils.el("span", { html: badge(tb.balanced ? "BALANCED" : "IMBALANCE DETECTED", tb.balanced ? "badge--success" : "badge--danger") }),
      ]));
      page.appendChild(table(["Account", "Debit (Dr)", "Credit (Cr)"],
        tb.rows.map((r) => JF.Utils.el("tr", {}, [
          JF.Utils.el("td", { html: `<strong>${r.account}</strong>` }),
          JF.Utils.el("td", {}, r.dr ? money(r.dr) : "—"),
          JF.Utils.el("td", {}, r.cr ? money(r.cr) : "—"),
        ])),
        ["Grand Totals", money(tb.totalDr), money(tb.totalCr)]));
    }

    /* ---------- P&L ---------- */
    else if (sub === "pl") {
      const p = JF.FinanceCalc.pnl(journal);
      const section = (title, items, total, color) => JF.Utils.el("div", { style: { marginBottom: "var(--space-5)" } }, [
        JF.Utils.el("div", { class: "card__eyebrow", style: { color, marginBottom: "8px" } }, title),
        ...items.map((x) => JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--color-ink-100)" } }, [
          JF.Utils.el("span", {}, x.account), JF.Utils.el("span", { style: { fontWeight: 600 } }, money(x.amount)),
        ])),
        JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, borderTop: "2px solid var(--color-ink-300)" } }, [
          JF.Utils.el("span", {}, `Total ${title.toLowerCase()}`), JF.Utils.el("span", {}, money(total)),
        ]),
      ]);
      page.appendChild(JF.Utils.el("div", { class: "card", style: { padding: "var(--space-6)" } }, [
        JF.Utils.el("h2", { style: { marginBottom: "var(--space-5)" } }, "Statement of Profit & Loss"),
        section("INCOME", p.income, p.totalIncome, "var(--color-accent-700)"),
        section("EXPENSES", p.expenses, p.totalExpense, "var(--color-oxblood-700)"),
        JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", padding: "var(--space-4)", background: p.net >= 0 ? "var(--color-success-100)" : "var(--color-danger-100)", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "var(--fs-lg)" } }, [
          JF.Utils.el("span", {}, "NET PROFIT / (LOSS)"),
          JF.Utils.el("span", { style: { color: p.net >= 0 ? "var(--color-success-700)" : "var(--color-danger-700)" } }, money(p.net)),
        ]),
        JF.Utils.el("div", { class: "field__hint", style: { marginTop: "var(--space-3)" } },
          "Income = milk payments + cattle sales recorded through Quick Entry; expenses come from the auto-posted journal. Post more entries to grow the picture."),
      ]));
    }

    /* ---------- Balance Sheet ---------- */
    else if (sub === "balancesheet") {
      const b = JF.FinanceCalc.balanceSheet(journal);
      const col = (title, items, total, color) => JF.Utils.el("div", {}, [
        JF.Utils.el("h3", { style: { color, borderBottom: `2px solid ${color}`, paddingBottom: "8px" } }, title),
        ...items.map((x) => JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-ink-100)" } }, [
          JF.Utils.el("span", {}, x.account), JF.Utils.el("span", { style: { fontWeight: 600 } }, money(x.amount)),
        ])),
        JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700 } }, [
          JF.Utils.el("span", {}, `Total ${title.toLowerCase()}`), JF.Utils.el("span", {}, money(total)),
        ]),
      ]);
      page.appendChild(JF.Utils.el("div", { class: "card", style: { padding: "var(--space-6)" } }, [
        JF.Utils.el("h2", { style: { marginBottom: "var(--space-5)" } }, "Balance Sheet"),
        JF.Utils.el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" } }, [
          col("ASSETS", b.assets, b.totalAssets, "var(--color-accent-700)"),
          JF.Utils.el("div", {}, [
            col("LIABILITIES", b.liabilities, b.totalLiabilities, "var(--color-oxblood-700)"),
            JF.Utils.el("div", { style: { height: "var(--space-5)" } }),
            col("EQUITY", b.equity, b.totalEquity, "var(--color-oxblood-700)"),
          ]),
        ]),
        JF.Utils.el("div", { style: { marginTop: "var(--space-5)", padding: "var(--space-4)", borderRadius: "var(--radius-md)", textAlign: "center", fontWeight: 700, background: b.balanced ? "var(--color-success-100)" : "var(--color-danger-100)", color: b.balanced ? "var(--color-success-700)" : "var(--color-danger-700)" } },
          b.balanced ? "✓ Balanced — Assets = Liabilities + Equity" : `⚠ Difference: ${money(Math.abs(b.difference))}`),
      ]));
    }

    /* ---------- Cash Book / Bank Book ---------- */
    else if (sub === "cashbook" || sub === "bankbook") {
      const account = sub === "cashbook" ? "Cash" : "Bank";
      const cb = JF.FinanceCalc.cashBook(journal, account);
      const contraRow = (r) => r.contra ? ` <span class="badge badge--info" style="font-size:10px">contra</span>` : "";
      page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-3", style: { marginBottom: "var(--space-5)" } }, [
        statCard("OPENING", money(cb.opening)),
        statCard(`RECEIPTS − PAYMENTS`, money(cb.totalReceipts - cb.totalPayments)),
        statCard("CLOSING", money(cb.closing)),
      ]));
      page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)" } }, [
          JF.Utils.el("div", { class: "card__eyebrow", style: { color: "var(--color-accent-700)" } }, "RECEIPTS (DR)"),
          ...cb.receipts.map((r) => JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-ink-100)" } }, [
            JF.Utils.el("span", { html: `${JF.Utils.formatDate(r.date)} · ${r.particulars}${contraRow(r)}` }),
            JF.Utils.el("span", { style: { fontWeight: 600 } }, money(r.amount)),
          ])),
          JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, borderTop: "2px solid var(--color-ink-300)" } }, [
            JF.Utils.el("span", {}, "Total receipts"), JF.Utils.el("span", {}, money(cb.totalReceipts)),
          ]),
        ]),
        JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)" } }, [
          JF.Utils.el("div", { class: "card__eyebrow", style: { color: "var(--color-oxblood-700)" } }, "PAYMENTS (CR)"),
          ...cb.payments.map((r) => JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-ink-100)" } }, [
            JF.Utils.el("span", { html: `${JF.Utils.formatDate(r.date)} · ${r.particulars}${contraRow(r)}` }),
            JF.Utils.el("span", { style: { fontWeight: 600 } }, money(r.amount)),
          ])),
          JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, borderTop: "2px solid var(--color-ink-300)" } }, [
            JF.Utils.el("span", {}, "Total payments"), JF.Utils.el("span", {}, money(cb.totalPayments)),
          ]),
        ]),
      ]));
    }

    root.appendChild(page);
  };

  return { render };
})();
