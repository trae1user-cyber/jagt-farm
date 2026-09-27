JF.Views = JF.Views || {};
JF.Views.Animals = (function () {
  const $ = () => document.getElementById("view-container");
  const SUB = {
    all:      { label: "All Animals", icon: "animals" },
    add:      { label: "Add Animal",  icon: "plus" },
    groups:   { label: "Animal Groups", icon: "analytics" },
    calves:   { label: "Calves",      icon: "baby" },
    pregnant: { label: "Pregnant",    icon: "pregnancy" },
    open:     { label: "Open",        icon: "animals" },
    heat:     { label: "Heat",        icon: "fire" },
    dry:      { label: "Dry",         icon: "animals" },
    sick:     { label: "Sick / Treatment", icon: "treatment" },
    sold:     { label: "Sold",        icon: "sale" },
    deceased: { label: "Deceased",    icon: "death" },
  };
  const SUB_FILTER = {
    calves: (a) => a.CurrentStatus === "Calf" || a.CurrentStatus === "Heifer",
    pregnant: (a) => a.CurrentStatus === "Pregnant",
    open: (a) => a.CurrentStatus === "Open",
    heat: (a) => a.CurrentStatus === "In Heat",
    dry: (a) => a.CurrentStatus === "Dry",
    sick: (a) => ["Sick", "Under Treatment"].includes(a.CurrentStatus),
    sold: (a) => a.CurrentStatus === "Sold",
    deceased: (a) => a.CurrentStatus === "Deceased",
  };

  const statusBadge = (status) => {
    const map = {
      "Calf": "badge--info", "Heifer": "badge--info", "Pregnant": "badge--success", "Lactating": "badge--success",
      "Open": "badge--warning", "In Heat": "badge--danger", "Sick": "badge--danger", "Under Treatment": "badge--danger",
      "Dry": "badge--neutral", "Active": "badge--success", "Sold": "badge--neutral", "Deceased": "badge--neutral",
    };
    return `<span class="badge ${map[status] || "badge--neutral"}">${status || "Active"}</span>`;
  };

  const subNav = (active = "all") => {
    const row = JF.Utils.el("div", { class: "tabs", style: { marginBottom: "var(--space-5)", flexWrap: "wrap" } });
    Object.entries(SUB).forEach(([k, v]) => {
      row.appendChild(JF.Utils.el("a", {
        class: `tab ${active === k ? "is-active" : ""}`,
        href: `#animals/${k}`,
        html: `<span style="display:inline-flex;align-items:center;gap:6px;">${JF.Utils.svgIcon(v.icon, 14, 14)} ${v.label}</span>`,
      }));
    });
    return row;
  };

  const head = (sub, count) => JF.Utils.el("div", { class: "page__head-row" }, [
    JF.Utils.el("div", {}, [
      JF.Utils.el("div", { class: "eyebrow" }, "🐄 Animals"),
      JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, SUB[sub]?.label || "All Animals"),
      JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
        count != null ? `${count} animals in this view · click any row for the full profile.` : "Individual animal records, filters, and groups."),
    ]),
    JF.Utils.el("div", { class: "page__actions" }, [
      JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => JF.App?.navigate("#animals/groups") }, "Manage Groups"),
      JF.Utils.el("button", { class: "btn btn--primary btn--icon-label btn--sm", html: `${JF.Utils.svgIcon("plus", 14, 14)} Add Animal`, onclick: () => JF.QuickEntry?.openForm("animal") }),
    ]),
  ]);

  /* ---------- Filters ---------- */
  const filters = { q: "", species: "", breed: "", gender: "", status: "", group: "" };

  const filterBar = (animals) => {
    const uniq = (key) => [...new Set(animals.map((a) => a[key]).filter(Boolean))].sort();
    const sel = (label, key) => JF.Utils.el("select", {
      class: "select", style: { minWidth: "130px" },
      onchange: (e) => { filters[key] = e.target.value; render(); },
    }, [
      JF.Utils.el("option", { value: "" }, label),
      ...uniq(key === "group" ? "CurrentGroup" : key).map((v) => JF.Utils.el("option", { value: v, selected: filters[key] === v ? true : null }, v)),
    ]);
    return JF.Utils.el("div", { class: "card", style: { marginBottom: "var(--space-5)", padding: "var(--space-4)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" } }, [
      JF.Utils.el("input", {
        class: "input", type: "search", placeholder: "Search ID, tag, name…", style: { minWidth: "200px", flex: "1" },
        value: filters.q, oninput: JF.Utils.debounce((e) => { filters.q = e.target.value; render(); }, 250),
      }),
      sel("All species", "species"), sel("All breeds", "breed"), sel("All genders", "gender"),
      sel("All statuses", "status"), sel("All groups", "group"),
    ]);
  };

  const applyFilters = (animals) => animals.filter((a) => {
    const q = filters.q.toLowerCase();
    if (q && ![a.AnimalID, a.TagNumber, a.Name].filter(Boolean).some((x) => String(x).toLowerCase().includes(q))) return false;
    if (filters.species && a.Species !== filters.species) return false;
    if (filters.breed && a.Breed !== filters.breed) return false;
    if (filters.gender && a.Gender !== filters.gender) return false;
    if (filters.status && a.CurrentStatus !== filters.status) return false;
    if (filters.group && a.CurrentGroup !== filters.group) return false;
    return true;
  });

  /* ---------- Table ---------- */
  const renderTable = async (animals) => {
    if (!animals.length) {
      return JF.Utils.el("div", { class: "card", style: { padding: "var(--space-8)", textAlign: "center" } }, [
        JF.Utils.el("div", { class: "search-empty" }, [
          JF.Utils.el("div", { style: { opacity: 0.4, marginBottom: "12px" }, html: JF.Utils.svgIcon("animals", 28, 28) }),
          "No animals match this view. Adjust the filters or add a new animal.",
        ]),
      ]);
    }
    // Traffic lights (reproductive action state) for each animal
    const lights = {};
    await Promise.all(animals.map(async (a) => {
      try { lights[a.AnimalID] = await JF.ReproIntel.trafficLight(a); } catch (e) { lights[a.AnimalID] = null; }
    }));
    const table = JF.Utils.el("table", { class: "table" });
    table.appendChild(JF.Utils.el("thead", {}, [
      JF.Utils.el("tr", {}, ["Animal", "Tag", "Breed", "Gender", "Age", "Status", "Next Action", "Group", ""].map((h) => JF.Utils.el("th", {}, h))),
    ]));
    const tbody = JF.Utils.el("tbody");
    animals.forEach((a) => {
      const tl = lights[a.AnimalID];
      tbody.appendChild(JF.Utils.el("tr", { onclick: () => JF.App.navigate(`#animal/${a.AnimalID}`), style: { cursor: "pointer" } }, [
        JF.Utils.el("td", {}, [
          JF.Utils.el("div", { style: { display: "grid", gridTemplateColumns: "40px 1fr", gap: "12px", alignItems: "center" } }, [
            JF.Utils.el("div", {
              class: "avatar avatar--sm",
              html: `<img src="${a.PhotoURL || JF.Utils.portraitSVG(a.Name || a.AnimalID, a.Species === "Buffalo" ? "buffalo" : "cattle")}" alt=""/>`,
            }),
            JF.Utils.el("div", {}, [
              JF.Utils.el("div", { class: "table__cell--primary" }, a.AnimalID),
              JF.Utils.el("div", { class: "table__cell--muted" }, a.Name || "—"),
            ]),
          ]),
        ]),
        JF.Utils.el("td", { class: "table__cell--muted" }, a.TagNumber || "—"),
        JF.Utils.el("td", { class: "table__cell--muted" }, a.Breed || "—"),
        JF.Utils.el("td", {}, a.Gender || "—"),
        JF.Utils.el("td", {}, a.DateOfBirth ? JF.Utils.ageLabel(a.DateOfBirth) : "—"),
        JF.Utils.el("td", { html: statusBadge(a.CurrentStatus) }),
        JF.Utils.el("td", {}, tl ? JF.Utils.el("div", { class: `traffic ${tl.cls}` }, [
          JF.Utils.el("span", { class: "traffic__dot" }),
          JF.Utils.el("span", { class: "traffic__label" }, tl.hidden ? "—" : tl.next || tl.label),
        ]) : "—"),
        JF.Utils.el("td", { class: "table__cell--muted" }, a.CurrentGroup || "—"),
        JF.Utils.el("td", { style: { textAlign: "right" } }, [
          JF.Utils.el("button", {
            class: "btn btn--ghost btn--sm",
            onclick: (e) => { e.stopPropagation(); JF.App.navigate(`#animal/${a.AnimalID}`); },
          }, "Open →"),
        ]),
      ]));
    });
    table.appendChild(tbody);
    return JF.Utils.el("div", { class: "table-wrap" }, [table]);
  };

  /* ---------- Groups editor ---------- */
  const groupsPage = async () => {
    const animals = (await JF.Store.animals.list()) || [];
    const customGroups = (await JF.Store.groups.list().catch(() => [])) || [];
    // Count animals per CurrentGroup
    const counts = {};
    animals.forEach((a) => { if (a.CurrentGroup) counts[a.CurrentGroup] = (counts[a.CurrentGroup] || 0) + 1; });
    const allGroupNames = [...new Set([...customGroups.map((g) => g.GroupName).filter(Boolean), ...Object.keys(counts)])].sort();

    const wrap = JF.Utils.el("div", { style: { display: "grid", gap: "var(--space-5)" } });

    // Create + assign controls
    const nameInput = JF.Utils.el("input", { class: "input", id: "grp-name", placeholder: "New group name, e.g. Quarantine Pen" });
    const createBtn = JF.Utils.el("button", {
      class: "btn btn--primary btn--sm", onclick: async () => {
        const name = document.getElementById("grp-name").value.trim();
        if (!name) { JF.Toast.show("Enter a group name.", "warning"); return; }
        await JF.Store.groups.create({ GroupName: name, Description: "" });
        JF.Toast.show(`Group "${name}" created.`, "success");
        render();
      },
    }, "Create Group");
    const animalSel = JF.Utils.el("select", { class: "select", id: "grp-animal" },
      animals.filter((a) => !["Sold", "Deceased"].includes(a.CurrentStatus)).map((a) => JF.Utils.el("option", { value: a.AnimalID }, `${a.Name} (${a.AnimalID})`)));
    const groupSel = JF.Utils.el("select", { class: "select", id: "grp-target" },
      allGroupNames.map((g) => JF.Utils.el("option", { value: g }, g)));
    const assignBtn = JF.Utils.el("button", {
      class: "btn btn--ghost btn--sm", onclick: async () => {
        const aid = document.getElementById("grp-animal").value;
        const g = document.getElementById("grp-target").value;
        if (!aid || !g) { JF.Toast.show("Pick an animal and a group.", "warning"); return; }
        await JF.Store.animals.update(aid, { CurrentGroup: g });
        JF.Toast.show(`${aid} moved to ${g}.`, "success");
        render();
      },
    }, "Assign Animal");

    wrap.appendChild(JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" } }, [
      JF.Utils.el("div", { class: "field", style: { flex: "1", minWidth: "180px", margin: 0 } }, [JF.Utils.el("label", { class: "field__label" }, "New group"), nameInput]),
      createBtn,
      JF.Utils.el("div", { class: "field", style: { minWidth: "180px", margin: 0 } }, [JF.Utils.el("label", { class: "field__label" }, "Animal"), animalSel]),
      JF.Utils.el("div", { class: "field", style: { minWidth: "160px", margin: 0 } }, [JF.Utils.el("label", { class: "field__label" }, "Group"), groupSel]),
      assignBtn,
    ]));

    // Group cards
    wrap.appendChild(JF.Utils.el("div", { class: "grid grid--cols-3" }, allGroupNames.map((g) => {
      const members = animals.filter((a) => a.CurrentGroup === g);
      return JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)" } }, [
        JF.Utils.el("div", { class: "card__header", style: { marginBottom: "8px" } }, [
          JF.Utils.el("h3", { class: "section__title", style: { margin: 0, fontSize: "var(--fs-md)" } }, g),
          JF.Utils.el("span", { class: "chip" }, `${members.length} animals`),
        ]),
        JF.Utils.el("div", { class: "chip-row" }, members.slice(0, 6).map((m) =>
          JF.Utils.el("a", { class: "chip", href: `#animal/${m.AnimalID}` }, m.Name || m.AnimalID))),
        members.length > 6 ? JF.Utils.el("div", { class: "field__hint", style: { marginTop: "6px" } }, `+${members.length - 6} more`) : null,
      ].filter(Boolean));
    })));
    return wrap;
  };

  /* ---------- Render ---------- */
  const render = async (path = []) => {
    const sub = path?.[1] || "all";
    const root = $();
    JF.Utils.clear(root);
    const page = JF.Utils.el("div", { class: "page" });
    const all = JF.Store ? ((await JF.Store.animals.list()) || []) : [];

    if (sub === "groups") {
      page.appendChild(head(sub));
      page.appendChild(subNav(sub));
      page.appendChild(await groupsPage());
    } else if (sub === "add") {
      page.appendChild(head(sub));
      page.appendChild(subNav(sub));
      page.appendChild(JF.Utils.el("div", { class: "card card--feature", style: { padding: "var(--space-6)", textAlign: "center" } }, [
        JF.Utils.el("h3", { class: "section__title" }, "Register a new animal"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "8px" } },
          "Opens the full 10-field Quick Entry form — name, tag, species, breed, gender, DOB, purchase info, group and location. The animal ID is generated automatically."),
        JF.Utils.el("button", { class: "btn btn--primary", style: { marginTop: "var(--space-4)" }, onclick: () => JF.QuickEntry?.openForm("animal") }, "Open Add Animal Form"),
      ]));
    } else {
      const base = SUB_FILTER[sub] ? all.filter(SUB_FILTER[sub]) : all;
      const filtered = sub === "all" ? applyFilters(base) : base;
      page.appendChild(head(sub, filtered.length));
      page.appendChild(subNav(sub));
      if (sub === "all") page.appendChild(filterBar(all));
      page.appendChild(await renderTable(filtered));
    }
    root.appendChild(page);
  };

  return { render };
})();
