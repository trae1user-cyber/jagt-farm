/**
 * JF.FinanceCalc - shared double-entry accounting math.
 * Pure functions over the journal list; used by the Finance views, Reports,
 * the animal-profile Accounting tab and the dashboard finance strip.
 * Every journal entry: { Date, DebitAccount, CreditAccount, Amount, AnimalID, ReferenceID, TransactionType }
 */
JF.FinanceCalc = (function () {

  const CHART = [
    { name: "Cash",                type: "asset" },
    { name: "Bank",                type: "asset" },
    { name: "Livestock",           type: "asset" },
    { name: "Equipment",           type: "asset" },
    { name: "Veterinary Expense",  type: "expense" },
    { name: "Medicine Expense",    type: "expense" },
    { name: "Vaccination Expense", type: "expense" },
    { name: "Deworming Expense",   type: "expense" },
    { name: "Labor Expense",       type: "expense" },
    { name: "Electricity Expense", type: "expense" },
    { name: "Water Expense",       type: "expense" },
    { name: "Fuel Expense",        type: "expense" },
    { name: "Transportation Expense", type: "expense" },
    { name: "Maintenance Expense", type: "expense" },
    { name: "Equipment Expense",   type: "expense" },
    { name: "Other Farm Expense",  type: "expense" },
    { name: "Cattle Sales",        type: "income" },
    { name: "Milk Sales",          type: "income" },
    { name: "Loans",               type: "liability" },
    { name: "Payables",            type: "liability" },
    { name: "Owner Capital",       type: "equity" },
    { name: "Retained Earnings",   type: "equity" },
    { name: "Drawings",            type: "equity" },
  ];

  const accountType = (name) => (CHART.find((a) => a.name === name) || {}).type || "expense";
  const accountList = () => CHART.map((a) => a.name);

  const inRange = (d, from, to) => {
    if (!from && !to) return true;
    const t = new Date(d).setHours(0, 0, 0, 0);
    if (from && t < new Date(from).setHours(0, 0, 0, 0)) return false;
    if (to && t > new Date(to).setHours(0, 0, 0, 0)) return false;
    return true;
  };

  const filter = (journal, { from, to, animalId, txnType } = {}) =>
    (journal || []).filter((e) =>
      inRange(e.Date, from, to) &&
      (!animalId || e.AnimalID === animalId) &&
      (!txnType || e.TransactionType === txnType)
    );

  /** Per-account { dr, cr } totals over the filtered journal. */
  const accountTotals = (journal, opts = {}) => {
    const map = {};
    filter(journal, opts).forEach((e) => {
      const amt = Number(e.Amount || 0);
      const dr = e.DebitAccount || "Cash";
      const cr = e.CreditAccount || "Cash";
      if (!map[dr]) map[dr] = { dr: 0, cr: 0 };
      if (!map[cr]) map[cr] = { dr: 0, cr: 0 };
      map[dr].dr += amt;
      map[cr].cr += amt;
    });
    return map;
  };

  /** Trial balance rows + grand totals. */
  const trialBalance = (journal, opts = {}) => {
    const totals = accountTotals(journal, opts);
    const rows = Object.entries(totals)
      .map(([account, b]) => ({ account, dr: b.dr, cr: b.cr }))
      .sort((a, b) => a.account.localeCompare(b.account));
    const totalDr = rows.reduce((s, r) => s + r.dr, 0);
    const totalCr = rows.reduce((s, r) => s + r.cr, 0);
    const difference = Math.round((totalDr - totalCr) * 100) / 100;
    return { rows, totalDr, totalCr, difference, balanced: Math.abs(difference) < 1 };
  };

  /**
   * Classic columnar ledger for one account with running balance.
   * opening = (sum of dr - sum of cr) for entries strictly BEFORE `from`.
   */
  const ledger = (journal, account, { from, to } = {}) => {
    const entries = filter(journal, { from, to })
      .filter((e) => e.DebitAccount === account || e.CreditAccount === account)
      .sort((a, b) => new Date(a.Date) - new Date(b.Date));
    let opening = 0;
    if (from) {
      filter(journal, { to: shift(from, -1) }).forEach((e) => {
        const amt = Number(e.Amount || 0);
        if (e.DebitAccount === account) opening += amt;
        if (e.CreditAccount === account) opening -= amt;
      });
    }
    let bal = opening;
    const rows = entries.map((e) => {
      const amt = Number(e.Amount || 0);
      const dr = e.DebitAccount === account ? amt : 0;
      const cr = e.CreditAccount === account ? amt : 0;
      bal += dr - cr;
      return {
        date: e.Date,
        particulars: e.Description || e.TransactionType || "Entry",
        ref: e.ReferenceID || e.JournalID || "",
        animalId: e.AnimalID || "",
        dr, cr,
        balance: bal,
      };
    });
    return {
      opening,
      rows,
      totalDr: rows.reduce((s, r) => s + r.dr, 0),
      totalCr: rows.reduce((s, r) => s + r.cr, 0),
      closing: bal,
    };
  };

  const shift = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  /**
   * Cash/Bank book: receipts (Dr side) and payments (Cr side) for the account,
   * with opening/closing. Contra entries (both legs cash+bank) flagged.
   */
  const cashBook = (journal, account, { from, to } = {}) => {
    const entries = filter(journal, { from, to })
      .filter((e) => e.DebitAccount === account || e.CreditAccount === account)
      .sort((a, b) => new Date(a.Date) - new Date(b.Date));
    let opening = 0;
    if (from) {
      filter(journal, { to: shift(from, -1) }).forEach((e) => {
        const amt = Number(e.Amount || 0);
        if (e.DebitAccount === account) opening += amt;
        if (e.CreditAccount === account) opening -= amt;
      });
    }
    const receipts = [], payments = [];
    let totalR = 0, totalP = 0;
    entries.forEach((e) => {
      const amt = Number(e.Amount || 0);
      const isContra =
        (e.DebitAccount === "Cash" && e.CreditAccount === "Bank") ||
        (e.DebitAccount === "Bank" && e.CreditAccount === "Cash");
      if (e.DebitAccount === account) {
        receipts.push({ date: e.Date, particulars: e.Description || e.TransactionType, ref: e.ReferenceID || "", amount: amt, contra: isContra });
        totalR += amt;
      }
      if (e.CreditAccount === account) {
        payments.push({ date: e.Date, particulars: e.Description || e.TransactionType, ref: e.ReferenceID || "", amount: amt, contra: isContra });
        totalP += amt;
      }
    });
    return { opening, receipts, payments, totalReceipts: totalR, totalPayments: totalP, closing: opening + totalR - totalP };
  };

  /** P&L: income (Cattle Sales etc.) minus grouped expenses. getExternalIncome() is the integration hook. */
  const getExternalIncome = () => []; // TODO: external income API hook - intentionally empty

  /**
   * Milk income analytics, straight from the milkSales entries (no estimates).
   * Monthly buckets use YYYY-MM so any date range works.
   */
  const milkAnalytics = (sales) => {
    const rows = (sales || []).filter((s) => s.Date).sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
    const months = {};
    rows.forEach((s) => {
      const key = String(s.Date).slice(0, 7);
      const m = (months[key] = months[key] || { month: key, litres: 0, amount: 0, entries: 0 });
      m.litres += Number(s.QuantityLitres || 0);
      m.amount += Number(s.Amount || 0);
      m.entries += 1;
    });
    const monthly = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    const totalLitres = rows.reduce((s, x) => s + Number(x.QuantityLitres || 0), 0);
    const totalAmount = rows.reduce((s, x) => s + Number(x.Amount || 0), 0);
    const pending = rows.filter((x) => String(x.PaymentStatus || "").toLowerCase() !== "received")
      .reduce((s, x) => s + Number(x.Amount || 0), 0);
    const shiftSplit = { Morning: 0, Evening: 0 };
    rows.forEach((x) => { const k = x.Shift === "Evening" ? "Evening" : "Morning"; shiftSplit[k] += Number(x.Amount || 0); });
    return {
      entries: rows.length,
      totalLitres: Math.round(totalLitres * 10) / 10,
      totalAmount: Math.round(totalAmount),
      avgRate: totalLitres ? Math.round((totalAmount / totalLitres) * 10) / 10 : 0,
      pending: Math.round(pending),
      monthly,
      shiftSplit,
      last: rows[rows.length - 1] || null,
    };
  };

  /** Month-keyed income/expense series for the finance graphs (from the journal). */
  const monthlySeries = (journal, monthsBack = 6) => {
    const buckets = {};
    const now = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets[d.toISOString().slice(0, 7)] = { month: d.toISOString().slice(0, 7), label: d.toLocaleString("en", { month: "short" }), income: 0, expense: 0 };
    }
    (journal || []).forEach((j) => {
      const key = String(j.Date || "").slice(0, 7);
      if (!buckets[key]) return;
      const t = accountType(j.DebitAccount);
      const amt = Number(j.Amount || 0);
      if (t === "income") buckets[key].income += amt;
      else if (t === "expense") buckets[key].expense += amt;
    });
    return Object.values(buckets);
  };

  const pnl = (journal, { from, to } = {}) => {
    const totals = accountTotals(journal, { from, to });
    const income = [], expenses = [];
    let totalIncome = 0, totalExpense = 0;
    Object.entries(totals).forEach(([account, b]) => {
      const type = accountType(account);
      const net = type === "income" ? b.cr - b.dr : b.dr - b.cr;
      if (type === "income" && net !== 0) { income.push({ account, amount: net }); totalIncome += net; }
      if (type === "expense" && net !== 0) { expenses.push({ account, amount: net }); totalExpense += net; }
    });
    getExternalIncome().forEach((x) => { income.push(x); totalIncome += Number(x.amount || 0); });
    income.sort((a, b) => b.amount - a.amount);
    expenses.sort((a, b) => b.amount - a.amount);
    return { income, expenses, totalIncome, totalExpense, net: totalIncome - totalExpense };
  };

  /** Balance sheet from account classification. Balanced when every journal entry is balanced. */
  const balanceSheet = (journal, { from, to } = {}) => {
    const totals = accountTotals(journal, { from, to });
    const assets = [], liabilities = [], equity = [];
    let tA = 0, tL = 0, tE = 0, income = 0, expense = 0;
    Object.entries(totals).forEach(([account, b]) => {
      const type = accountType(account);
      if (type === "asset") { const v = b.dr - b.cr; if (v !== 0) { assets.push({ account, amount: v }); tA += v; } }
      else if (type === "liability") { const v = b.cr - b.dr; if (v !== 0) { liabilities.push({ account, amount: v }); tL += v; } }
      else if (type === "equity") { const v = b.cr - b.dr; if (v !== 0) { equity.push({ account, amount: v }); tE += v; } }
      else if (type === "income") income += b.cr - b.dr;
      else if (type === "expense") expense += b.dr - b.cr;
    });
    const retained = income - expense;
    if (retained !== 0) { equity.push({ account: "Retained Earnings (period)", amount: retained }); tE += retained; }
    const tAssets = Math.round(tA * 100) / 100;
    const tLE = Math.round((tL + tE) * 100) / 100;
    return { assets, liabilities, equity, totalAssets: tA, totalLiabilities: tL, totalEquity: tE, difference: tAssets - tLE, balanced: Math.abs(tA - (tL + tE)) < 1 };
  };

  return { CHART, accountType, accountList, filter, accountTotals, trialBalance, ledger, cashBook, pnl, balanceSheet, getExternalIncome, milkAnalytics, monthlySeries };
})();
