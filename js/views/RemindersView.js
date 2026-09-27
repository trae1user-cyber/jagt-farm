JF.Views = JF.Views || {};
JF.Views.Reminders = (function () {
  const $ = () => document.getElementById("view-container");

  let filters = { type: "", animal: "", priority: "" };

  const bucketOf = (r) => {
    const s = JF.Utils.daysBetween(JF.Utils.today(), r.DueDate);
    if (["Completed", "Dismissed"].includes(r.Status)) return "done";
    if (s < 0) return "overdue";
    if (s === 0) return "today";
    return "upcoming";
  };

  const typeIcon = (type) => ({
    "Heat Expected": "fire", "Pregnancy Check": "pregnancy", "Treatment Follow-up": "treatment",
    "Deworming": "drop", "Vaccination": "syringe", "Expected Calving": "baby2",
  }[type] || "bell");

  const daysBadge = (r) => {
    const s = JF.Utils.daysBetween(JF.Utils.today(), r.DueDate);
    if (s < 0) return `<span class="badge badge--danger">${-s}d overdue</span>`;
    if (s === 0) return `<span class="badge badge--oxblood">today</span>`;
    if (s <= 7) return `<span class="badge badge--warning">in ${s}d</span>`;
    return `<span class="badge badge--info">in ${s}d</span>`;
  };

  const row = (r) => JF.Utils.el("div", { class: "timeline__item", style: { alignItems: "flex-start" } }, [
    JF.Utils.el("div", { class: "timeline__dot timeline__dot--finance", html: JF.Utils.svgIcon(typeIcon(r.ReminderType), 10, 10) }),
    JF.Utils.el("div", { class: "timeline__date" }, JF.Utils.formatDate(r.DueDate) + (r.Time ? ` · ${r.Time}` : "")),
    JF.Utils.el("div", { class: "timeline__title" },
      `${r.ReminderType} · ${r.AnimalID || "Herd"}`,
      JF.Utils.el("span", { html: daysBadge(r), style: { marginLeft: "8px" } })),
    JF.Utils.el("div", { class: "timeline__desc" }, [
      r.Notes ? r.Notes : "",
      r.AnimalID ? JF.Utils.el("a", { href: `#animal/${r.AnimalID}/overview`, style: { marginLeft: "6px", fontWeight: 600 } }, "view animal") : null,
    ].filter(Boolean)),
    JF.Utils.el("div", { style: { display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" } }, [
      JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => act(r, "Completed") }, "✓ Done"),
      JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => act(r, "Dismissed") }, "Dismiss"),
      JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => snooze(r) }, "Snooze 3d"),
    ]),
  ]);

  const act = async (r, status) => {
    await JF.Store.reminders.update(r.id, { Status: status });
    JF.Toast.show(status === "Completed" ? "Reminder completed." : "Reminder dismissed.", "success");
    render();
  };

  const snooze = async (r) => {
    const base = new Date(r.DueDate) > new Date() ? new Date(r.DueDate) : JF.Utils.today();
    const nd = JF.Utils.addDays(base, 3);
    await JF.Store.reminders.update(r.id, { DueDate: JF.Utils.formatDate(nd, "yyyy-MM-dd"), Status: "Upcoming" });
    JF.Toast.show(`Snoozed to ${JF.Utils.formatDate(nd)}.`, "success");
    render();
  };

  /* ---------- Custom reminder (anything the farm wants to remember) ---------- */

  const statusForDate = (dueISO) => {
    const diff = JF.Utils.daysBetween(JF.Utils.todayISO(), dueISO);
    if (diff < 0) return "Overdue";
    if (diff === 0) return "Due Today";
    return "Upcoming";
  };

  const openCustomModal = async () => {
    const animals = (await JF.Store.animals.list().catch(() => [])) || [];
    const active = animals.filter((a) => !["Sold", "Deceased"].includes(a.CurrentStatus));
    const field = (label, inputEl, hint) => JF.Utils.el("div", { class: "field" }, [
      JF.Utils.el("label", { class: "field__label" }, label),
      inputEl,
      hint ? JF.Utils.el("div", { class: "field__hint" }, hint) : null,
    ].filter(Boolean));

    const title = JF.Utils.el("input", { class: "input", id: "cr-title", placeholder: "e.g. Hoof trimming, Bank work, Miner mixture order", maxlength: "60" });
    const date = JF.Utils.el("input", { class: "input", type: "date", id: "cr-date", value: JF.Utils.todayISO() });
    const time = JF.Utils.el("input", { class: "input", type: "time", id: "cr-time" });
    const animal = JF.Utils.el("select", { class: "select", id: "cr-animal" }, [
      JF.Utils.el("option", { value: "" }, "Whole farm (no specific animal)"),
      ...active.map((a) => JF.Utils.el("option", { value: a.AnimalID }, `${a.Name || a.AnimalID} (${a.AnimalID})`)),
    ]);
    const priority = JF.Utils.el("select", { class: "select", id: "cr-priority" }, [
      JF.Utils.el("option", { value: "Normal" }, "Normal"),
      JF.Utils.el("option", { value: "High" }, "High"),
      JF.Utils.el("option", { value: "Low" }, "Low"),
    ]);
    const lead = JF.Utils.el("input", { class: "input", type: "number", id: "cr-lead", value: "0", min: "0", max: "60" });
    const notes = JF.Utils.el("textarea", { class: "input", id: "cr-notes", rows: "2", placeholder: "Optional details…" });

    const body = JF.Utils.el("div", { class: "form-stack" }, [
      field("What needs doing? *", title),
      JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        field("Date *", date),
        field("Time (optional)", time, "Shown on the reminder; phone browsers get a time picker."),
      ]),
      field("Animal (optional)", animal),
      JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        field("Priority", priority),
        field("Remind days before", lead),
      ]),
      field("Notes", notes),
    ]);

    const err = JF.Utils.el("div", { class: "field__hint", style: { color: "var(--color-oxblood-700)", minHeight: "18px" } });
    body.appendChild(err);

    const saveBtn = JF.Utils.el("button", { class: "btn btn--primary" }, "Save Reminder");
    saveBtn.onclick = async () => {
      const t = title.value.trim();
      const d = date.value;
      if (!t) { err.textContent = "Give the reminder a title."; title.focus(); return; }
      if (!d) { err.textContent = "Pick a date."; date.focus(); return; }
      const leadN = Math.max(0, Math.min(60, parseInt(lead.value, 10) || 0));
      const remindOn = JF.Utils.formatDate(JF.Utils.addDays(d, -leadN), "yyyy-MM-dd");
      await JF.Store.reminders.create({
        ReminderID: `RMN-CUSTOM-${JF.Utils.uid()}`,
        AnimalID: animal.value || null,
        ReminderType: t,
        DueDate: d,
        Time: time.value || null,
        ReminderDate: remindOn,
        Priority: priority.value,
        Status: statusForDate(d),
        Source: "Custom",
        Notes: notes.value.trim() || (leadN ? `Reminds ${leadN}d before` : ""),
      });
      JF.Modal.close();
      JF.Toast.show("Reminder added.", "success");
      JF.App.updateBadgeCounts();
      render();
    };

    JF.Modal.open({
      title: "Add Custom Reminder",
      size: "md",
      body,
      footer: JF.Utils.el("div", { style: { display: "flex", gap: "10px", justifyContent: "flex-end" } }, [
        JF.Utils.el("button", { class: "btn btn--ghost", onclick: () => JF.Modal.close() }, "Cancel"),
        saveBtn,
      ]),
      onMount: () => setTimeout(() => title.focus(), 60),
    });
  };

  const section = (title, eyebrow, icon, items, accent) => {
    const list = JF.Utils.el("div", {});
    if (items.length) items.forEach((r) => list.appendChild(row(r)));
    else list.appendChild(JF.Utils.el("div", { class: "search-empty" }, [
      JF.Utils.el("div", { style: { opacity: 0.4, marginBottom: "8px" }, html: JF.Utils.svgIcon(icon, 24, 24) }),
      "Nothing here — all clear for this bucket.",
    ]));
    return JF.Utils.el("div", { class: "card" }, [
      JF.Utils.el("div", { class: "card__header" }, [
        JF.Utils.el("div", {}, [
          JF.Utils.el("div", { class: "card__eyebrow" }, eyebrow),
          JF.Utils.el("h3", { class: "section__title", style: { margin: 0 } },
            `${title} `, JF.Utils.el("span", { class: "chip" }, `${items.length}`)),
        ]),
        JF.Utils.el("div", { class: `stat-icon ${accent || ""}`, html: JF.Utils.svgIcon(icon, 20, 20) }),
      ]),
      JF.Utils.el("div", { class: "timeline" }, [list]),
    ]);
  };

  const filterBar = (types, animals) => {
    const sel = (id, label, opts, val, cb) => JF.Utils.el("select", { class: "select", id, onchange: (e) => { cb(e.target.value); render(); } }, [
      JF.Utils.el("option", { value: "" }, label),
      ...opts.map((o) => JF.Utils.el("option", { value: o, selected: val === o ? true : null }, o)),
    ]);
    return JF.Utils.el("div", { class: "card", style: { marginBottom: "var(--space-5)", padding: "var(--space-4)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" } }, [
      sel("flt-type", "All types", types, filters.type, (v) => filters.type = v),
      sel("flt-animal", "All animals", animals, filters.animal, (v) => filters.animal = v),
      sel("flt-priority", "Any priority", ["High", "Normal", "Low"], filters.priority, (v) => filters.priority = v),
      JF.Utils.el("label", { class: "chip", style: { cursor: "pointer" } }, [
        JF.Utils.el("input", { type: "checkbox", id: "flt-done", checked: filters.showDone ? true : null, style: { marginRight: "6px" }, onchange: (e) => { filters.showDone = e.target.checked; render(); } }),
        "Show completed",
      ]),
    ]);
  };

  const render = async () => {
    const root = $();
    JF.Utils.clear(root);
    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "🔔 Reminders"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, "Your Action List"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Overdue first, then today, then what's ahead. Snooze or dismiss anything that's handled."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", {
          class: "btn btn--ghost btn--sm", onclick: async () => {
            const list = (await JF.Store.reminders.list()).filter((r) => bucketOf(r) === "overdue");
            for (const r of list) await JF.Store.reminders.update(r.id, { DueDate: JF.Utils.todayISO(), Status: "Due Today" });
            JF.Toast.show(list.length ? `${list.length} overdue reminders moved to today.` : "No overdue reminders.", "success");
            render();
          },
        }, "Pull Overdue to Today"),
        JF.Utils.el("button", { class: "btn btn--accent btn--sm", onclick: () => openCustomModal() }, "+ Custom Reminder"),
        JF.Utils.el("button", {
          class: "btn btn--primary btn--sm", type: "button",
          onclick: async () => {
            if (!confirm("Rebuild every reminder from the entries on file?\n\nAll existing reminders (including manual ones) are deleted first, then regenerated from the Rules sheet against your real records. Nothing else is touched.")) return;
            const btns = document.querySelectorAll(".page__actions .btn");
            btns.forEach((b) => { b.disabled = true; });
            JF.Toast.show("Rebuilding reminders from entries...", "info");
            try {
              const r = await JF.RuleEngine.rebuild();
              JF.Toast.show(`Deleted ${r.removed} old reminder(s), regenerated ${r.created} from ${r.animals} animals' entries.`, "success");
            } catch (e) {
              JF.Toast.show(`Rebuild failed: ${e.message}`, "danger");
            }
            render();
          },
        }, "🔄 Rebuild From Entries"),
        JF.Utils.el("button", {
          class: "btn btn--ghost btn--sm", type: "button",
          onclick: async () => {
            if (!confirm("Delete ALL reminders?\n\nUse 'Rebuild From Entries' instead if you want them regenerated automatically from your records.")) return;
            const n = await JF.RuleEngine.clearReminders({ includeManual: true });
            JF.Toast.show(`Deleted ${n} reminder(s).`, "success");
            render();
          },
        }, "🗑 Delete All Reminders"),
      ]),
    ]));

    let all = (await JF.Store.reminders.list().catch(() => [])) || [];
    const types = [...new Set(all.map((r) => r.ReminderType).filter(Boolean))].sort();
    const animals = [...new Set(all.map((r) => r.AnimalID).filter(Boolean))].sort();
    page.appendChild(filterBar(types, animals));

    const F = filters;
    const filtered = all.filter((r) =>
      (!F.type || r.ReminderType === F.type) &&
      (!F.animal || r.AnimalID === F.animal) &&
      (!F.priority || (r.Priority || "Normal") === F.priority)
    );
    const buckets = { overdue: [], today: [], upcoming: [], done: [] };
    filtered.forEach((r) => buckets[bucketOf(r)].push(r));
    buckets.overdue.sort((a, b) => new Date(a.DueDate) - new Date(b.DueDate));
    buckets.today.sort((a, b) => String(a.ReminderType).localeCompare(b.ReminderType));
    buckets.upcoming.sort((a, b) => new Date(a.DueDate) - new Date(b.DueDate));

    const stat = (label, n, icon, accent) => JF.Utils.el("div", { class: "card card--stat" }, [
      JF.Utils.el("div", { class: `stat-icon ${accent || ""}`, html: JF.Utils.svgIcon(icon, 20, 20) }),
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "stat-number" }, String(n)),
        JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, label),
      ]),
    ]);
    page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-3", style: { marginBottom: "var(--space-6)" } }, [
      stat("⚠️ OVERDUE", buckets.overdue.length, "warning", "stat-icon--danger"),
      stat("📍 TODAY", buckets.today.length, "clock", "stat-icon--oxblood"),
      stat("⏭️ UPCOMING", buckets.upcoming.length, "calendar", ""),
    ]));

    page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-3" }, [
      section("Overdue", "🚨 PAST DUE", "warning", buckets.overdue, "stat-icon--danger"),
      section("Today", "📍 DUE TODAY", "clock", buckets.today, "stat-icon--oxblood"),
      section("Upcoming", "⏭️ NEXT UP", "calendar", buckets.upcoming, ""),
    ]));

    if (filters.showDone) {
      page.appendChild(JF.Utils.el("div", { style: { marginTop: "var(--space-5)" } },
        section("Completed / Dismissed", "✓ DONE", "check", buckets.done, "")));
    }

    root.appendChild(page);
  };

  return { render };
})();
