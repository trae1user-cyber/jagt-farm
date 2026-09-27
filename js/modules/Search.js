JF.Search = (function () {
  const input = () => document.getElementById("global-search");
  const resultsEl = () => document.getElementById("search-results");
  let activeIdx = -1;
  let currentItems = [];

  const render = (groups = []) => {
    const el = resultsEl();
    if (!groups.length) { el.hidden = true; return; }
    JF.Utils.clear(el);
    currentItems = [];
    let flatIdx = 0;
    groups.forEach((g) => {
      const group = JF.Utils.el("div", { class: "search-group" });
      group.appendChild(JF.Utils.el("div", { class: "search-group__title" }, g.title));
      (g.items || []).forEach((item) => {
        const idx = flatIdx++;
        currentItems.push(item);
        const node = JF.Utils.el("div", {
          class: `search-item ${activeIdx === idx ? "is-active" : ""}`,
          "data-idx": idx,
          onclick: () => { if (typeof item.onSelect === "function") item.onSelect(item); close(); },
        }, [
          JF.Utils.el("span", { class: "icon-btn", style: { width: "32px", height: "32px" }, html: JF.Utils.svgIcon(item.icon || "search", 16, 16) }),
          JF.Utils.el("div", {}, [
            JF.Utils.el("div", { class: "search-item__title" }, item.title),
            JF.Utils.el("div", { class: "search-item__sub" }, item.subtitle || ""),
          ]),
          JF.Utils.el("span", { class: "eyebrow" }, item.meta || ""),
        ]);
        group.appendChild(node);
      });
      el.appendChild(group);
    });
    el.hidden = false;
  };

  const buildGroups = async (q) => {
    const qq = q.toLowerCase().trim();
    if (!qq) return [];
    const groups = [];

    try {
      if (JF.Store && JF.Store.animals) {
        const animals = (await JF.Store.animals.list() || []).filter((a) =>
          [a.AnimalID, a.TagNumber, a.Name, a.Breed, a.Species].filter(Boolean)
            .some((x) => String(x).toLowerCase().includes(qq))
        ).slice(0, 8);
        if (animals.length) {
          groups.push({
            title: "Animals",
            items: animals.map((a) => ({
              icon: "animals",
              title: `${a.AnimalID} — ${a.Name || ""}`,
              subtitle: [a.Breed, a.Gender, JF.Utils.ageLabel(a.DateOfBirth)].filter(Boolean).join(" · "),
              meta: a.CurrentStatus || "",
              onSelect: () => JF.App && JF.App.navigate(`#animal/${a.AnimalID}`),
            })),
          });
        }
      }
    } catch (e) { /* noop */ }

    try {
      if (JF.Store && JF.Store.reminders) {
        const rems = (await JF.Store.reminders.list() || []).filter((r) =>
          (r.AnimalID || "").toLowerCase().includes(qq) ||
          (r.ReminderType || "").toLowerCase().includes(qq) ||
          (r.Notes || "").toLowerCase().includes(qq)
        ).slice(0, 6);
        if (rems.length) {
          groups.push({
            title: "Reminders",
            items: rems.map((r) => ({
              icon: "bell",
              title: `${r.ReminderType} — ${r.AnimalID || ""}`,
              subtitle: r.DueDate ? `Due ${JF.Utils.formatDate(r.DueDate)}` : "",
              meta: r.Status || "",
              onSelect: () => JF.App && JF.App.navigate("#reminders"),
            })),
          });
        }
      }
    } catch (e) { /* noop */ }

    try {
      if (JF.Store) {
        // Operational records linked to an animal (or matching an event ID prefix)
        const SOURCES = [
          ["heat", "fire", "Heat", "heat"],
          ["insemination", "syringe", "Insemination", "insemination"],
          ["pregnancy", "pregnancy", "Pregnancy Check", "pregnancy"],
          ["calving", "baby2", "Calving", "calving"],
          ["health", "treatment", "Treatment", "health"],
          ["deworming", "drop", "Deworming", "deworming"],
          ["vaccination", "syringe", "Vaccination", "vaccination"],
        ];
        const recItems = [];
        for (const [entity, icon, label, tab] of SOURCES) {
          const rows = (await JF.Store[entity].list()) || [];
          rows.filter((r) =>
            [r.AnimalID, r.id, r.ReferenceID].filter(Boolean).some((x) => String(x).toLowerCase().includes(qq))
          ).slice(0, 3).forEach((r) => recItems.push({
            icon, title: `${label} - ${r.AnimalID || ""}`.trim(),
            subtitle: [r.Problem, r.Medicine, r.Vaccine, r.Result, r.CalfID, r.Cause, r.Diagnosis].filter(Boolean).slice(0, 2).join(" \u00b7 ") || r.id,
            meta: JF.Utils.formatDate(r.HeatDate || r.Date || r.DateGiven || ""),
            onSelect: () => JF.App && JF.App.navigate(`#animal/${r.AnimalID || ""}/${tab}`),
          }));
        }
        if (recItems.length) groups.push({ title: "Records", items: recItems.slice(0, 8) });

        // Accounting entries referencing the animal or reference
        const jnl = (await JF.Store.journal.list()) || [];
        const jItems = jnl.filter((e) =>
          [e.AnimalID, e.ReferenceID, e.Description].filter(Boolean).some((x) => String(x).toLowerCase().includes(qq))
        ).slice(0, 5).map((e) => ({
          icon: "money",
          title: `${e.JournalID} - ${e.Description || e.TransactionType}`,
          subtitle: `Dr ${e.DebitAccount} / Cr ${e.CreditAccount}`,
          meta: JF.Utils.money(e.Amount || 0),
          onSelect: () => JF.App && JF.App.navigate("#finance/journal"),
        }));
        if (jItems.length) groups.push({ title: "Accounting", items: jItems });

        // Documents by filename or animal link
        const files = (await JF.Store.files.list()) || [];
        const fItems = files.filter((f) =>
          [f.FileName, f.AnimalID, f.RecordID, f.Category].filter(Boolean).some((x) => String(x).toLowerCase().includes(qq))
        ).slice(0, 5).map((f) => ({
          icon: "document",
          title: f.FileName || f.id,
          subtitle: [f.Category, f.AnimalID].filter(Boolean).join(" \u00b7 "),
          meta: JF.Utils.formatDate(f.UploadDate || ""),
          onSelect: () => JF.App && JF.App.navigate(`#documents/${(f.Category || "other").toLowerCase()}`),
        }));
        if (fItems.length) groups.push({ title: "Documents", items: fItems });
      }
    } catch (e) { /* noop */ }

    if (!groups.length) {
      groups.push({
        title: "",
        items: [{ icon: "search", title: `No results for “${q}”`, subtitle: "Try an animal ID, tag number, or event type." }],
      });
    }

    return groups;
  };

  const close = () => { const r = resultsEl(); if (r) r.hidden = true; activeIdx = -1; };
  const go = (dir) => {
    if (!currentItems.length) return;
    activeIdx = (activeIdx + dir + currentItems.length) % currentItems.length;
    const items = document.querySelectorAll(".search-item");
    items.forEach((n, i) => n.classList.toggle("is-active", i === activeIdx));
    if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: "nearest" });
  };
  const activate = () => {
    if (activeIdx >= 0 && currentItems[activeIdx]) {
      const it = currentItems[activeIdx];
      if (typeof it.onSelect === "function") { it.onSelect(it); close(); }
    }
  };

  const init = () => {
    const inp = input();
    if (!inp) return;
    const run = JF.Utils.debounce(async (q) => render(await buildGroups(q)), 250);
    inp.addEventListener("input", (e) => run(e.target.value));
    inp.addEventListener("focus", (e) => { if (e.target.value) run(e.target.value); });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); go(-1); }
      else if (e.key === "Enter") { e.preventDefault(); activate(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); inp.blur(); }
    });
    document.addEventListener("click", (e) => {
      if (!inp.contains(e.target) && !resultsEl().contains(e.target)) close();
    });
  };

  return { init, close, render, buildGroups };
})();
