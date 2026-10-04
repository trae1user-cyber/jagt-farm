JF.Views = JF.Views || {};

/**
 * Pedigree — search any animal and read its family tree.
 *
 *   ↑ Ancestors: mother & father (farm animal or custom name), grandparents
 *     when the parents are farm animals, plus the dam's calving history.
 *   → The animal itself: breed, DOB, phase, herd value.
 *   ↓ Offspring: every farm animal whose MotherID/FatherID points here, with
 *     links to keep walking the tree downward.
 *
 * A parent recorded as a custom name (AI straws, outside bulls) still shows —
 * the tree is built from MotherID/MotherName/FatherID/SireName, so nothing
 * disappears just because the sire was never registered as a farm animal.
 */
JF.Views.Pedigree = (function () {
  const $ = () => document.getElementById("view-container");

  const byId = (animals, id) => JF.Utils.findAnimal(animals, id);

  const card = (a, { role = "", clickable = true } = {}) => {
    if (!a) return null;
    const inner = [
      JF.Utils.el("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, [
        (a.PhotoURL && /^https?:|data:image/.test(String(a.PhotoURL)))
          ? JF.Utils.el("img", { src: a.PhotoURL, alt: "", style: { width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover" } })
          : JF.Utils.el("div", { class: "stat-icon", style: { width: "44px", height: "44px" }, html: JF.Utils.svgIcon("animals", 22, 22) }),
        JF.Utils.el("div", {}, [
          JF.Utils.el("div", { style: { fontWeight: 700 } }, `${a.Name || a.AnimalID}${role ? ` · ${role}` : ""}`),
          JF.Utils.el("div", { class: "field__hint" }, `${a.AnimalID || ""}${a.Breed ? " · " + a.Breed : ""}${a.DateOfBirth ? " · b. " + JF.Utils.formatDate(a.DateOfBirth, "dd MMM yyyy") : ""}`),
          JF.Utils.el("div", { class: "field__hint" }, [a.Category, a.CurrentStatus].filter(Boolean).join(" · ")),
        ]),
      ]),
    ].filter(Boolean);
    const el = JF.Utils.el("div", { class: "card", style: { padding: "var(--space-3)", marginBottom: "var(--space-2)" } }, inner);
    if (clickable) el.style.cursor = "pointer";
    if (clickable) el.addEventListener("click", () => JF.App.navigate(`#pedigree/${a.AnimalID || a.id}`));
    return el;
  };

  const customParent = (name, role) => JF.Utils.el("div", { class: "card", style: { padding: "var(--space-3)", marginBottom: "var(--space-2)", borderStyle: "dashed" } }, [
    JF.Utils.el("div", { style: { fontWeight: 700 } }, `${name} · ${role}`),
    JF.Utils.el("div", { class: "field__hint" }, "Recorded by name — not a registered farm animal (outside bull / AI straw)."),
  ]);

  const col = (title, children) => JF.Utils.el("div", {}, [
    JF.Utils.el("div", { class: "card__eyebrow", style: { marginBottom: "var(--space-2)" } }, title),
    ...children.filter(Boolean),
    children.filter(Boolean).length ? null : JF.Utils.el("div", { class: "field__hint" }, "Not recorded."),
  ]);

  const render = async (path = []) => {
    const root = $();
    JF.Utils.clear(root);
    const animals = (await JF.Store.animals.list()) || [];
    const calvings = (await JF.Store.calving.list()) || [];
    const page = JF.Utils.el("div", { class: "page" });

    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "🐂 HERD"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, "Pedigree"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Pick any animal and read its family: the bull used, the mother, grandparents and every calf she has produced. Parents can be farm animals or names recorded on the entry."),
      ]),
    ]));

    // ---- Search / select ----
    const q = (path[1] || "").trim();
    const selId = JF.Utils.el("input", { class: "input", list: "pedigree-animals", placeholder: "Search by name or ID…", value: "" });
    const hit = q ? (byId(animals, decodeURIComponent(q)) || null) : null;
    const sel = JF.Utils.el("select", { class: "select", style: { maxWidth: "380px" }, onchange: (e) => { if (e.target.value) JF.App.navigate(`#pedigree/${e.target.value}`); } }, [
      JF.Utils.el("option", { value: "" }, "-- Select an animal --"),
      ...animals.map((a) => JF.Utils.el("option", { value: a.AnimalID || a.id, selected: hit && (hit.AnimalID === (a.AnimalID || a.id)) ? true : null }, `${a.Name || a.AnimalID} (${a.AnimalID || a.id})`)),
    ]);
    page.appendChild(JF.Utils.el("div", { class: "card", style: { padding: "var(--space-4)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" } }, [
      JF.Utils.el("div", { class: "field", style: { margin: 0, minWidth: "260px" } }, [JF.Utils.el("label", { class: "field__label" }, "Animal"), sel]),
    ]));

    if (!hit) {
      page.appendChild(JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-6)" } },
        "Select an animal above to see its pedigree tree."));
      root.appendChild(page);
      return;
    }

    const id = hit.AnimalID || hit.id;

    // ---- Ancestors ----
    const mother = hit.MotherID ? byId(animals, hit.MotherID) : null;
    const father = hit.FatherID ? byId(animals, hit.FatherID) : null;
    const maternalGM = mother && mother.MotherID ? byId(animals, mother.MotherID) : null;
    const maternalGF = mother && mother.FatherID ? byId(animals, mother.FatherID) : null;
    const paternalGM = father && father.MotherID ? byId(animals, father.MotherID) : null;
    const paternalGF = father && father.FatherID ? byId(animals, father.FatherID) : null;

    // ---- Offspring (calves pointing at this animal) + calvings as mother ----
    const offspring = animals.filter((a) => a.MotherID === id || a.FatherID === id);
    const asMother = calvings.filter((c) => c.AnimalID === id).sort((x, y) => String(y.Date || "").localeCompare(String(x.Date || "")));

    const ancestorsCol = col("PARENTS & GRANDPARENTS", [
      mother ? card(mother, { role: "Mother (dam)" }) : (hit.MotherName ? customParent(hit.MotherName, "mother (name only)") : null),
      father ? card(father, { role: "Father (sire)" }) : (hit.SireName ? customParent(hit.SireName, "sire (name only)") : null),
      maternalGM ? card(maternalGM, { role: "Maternal grandmother" }) : null,
      maternalGF ? card(maternalGF, { role: "Maternal grandfather" }) : null,
      paternalGM ? card(paternalGM, { role: "Paternal grandmother" }) : null,
      paternalGF ? card(paternalGF, { role: "Paternal grandfather" }) : null,
    ]);

    const offspringCol = col("OFFSPRING (FARM RECORDS)", offspring.map((o) =>
      card(o, { role: o.MotherID === id ? "out of " + (hit.Name || id) : "sired by " + (hit.Name || id) })));

    const selfCard = JF.Utils.el("div", { class: "card card--feature", style: { padding: "var(--space-4)", marginBottom: "var(--space-3)" } }, [
      JF.Utils.el("div", { style: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" } }, [
        (hit.PhotoURL && /^https?:|data:image/.test(String(hit.PhotoURL)))
          ? JF.Utils.el("img", { src: hit.PhotoURL, alt: "", style: { width: "64px", height: "64px", borderRadius: "12px", objectFit: "cover" } })
          : JF.Utils.el("div", { class: "stat-icon", style: { width: "64px", height: "64px" }, html: JF.Utils.svgIcon("animals", 30, 30) }),
        JF.Utils.el("div", {}, [
          JF.Utils.el("h3", { class: "section__title", style: { margin: 0 } }, `${hit.Name || id}`),
          JF.Utils.el("div", { class: "field__hint" }, `${hit.AnimalID || id} · ${hit.Breed || "breed not set"} · ${hit.Gender || "Female"} · b. ${hit.DateOfBirth ? JF.Utils.formatDate(hit.DateOfBirth, "dd MMM yyyy") : "unknown"}`),
          JF.Utils.el("div", { style: { marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" } }, [
            hit.Category ? JF.Utils.el("span", { class: "badge badge--info" }, hit.Category) : null,
            hit.CurrentStatus ? JF.Utils.el("span", { class: "badge badge--neutral" }, hit.CurrentStatus) : null,
            hit.MotherID ? JF.Utils.el("a", { class: "badge badge--neutral", href: `#animal/${hit.MotherID}` }, `dam: ${mother?.Name || hit.MotherID}`) : (hit.MotherName ? JF.Utils.el("span", { class: "badge badge--neutral" }, `dam: ${hit.MotherName} (name)`) : null),
            hit.FatherID ? JF.Utils.el("a", { class: "badge badge--neutral", href: `#pedigree/${hit.FatherID}` }, `sire: ${father?.Name || hit.FatherID}`) : (hit.SireName ? JF.Utils.el("span", { class: "badge badge--neutral" }, `sire: ${hit.SireName} (name)`) : null),
          ].filter(Boolean)),
        ]),
        JF.Utils.el("div", { style: { marginLeft: "auto" } }, [
          JF.Utils.el("a", { class: "btn btn--ghost btn--sm", href: `#animal/${id}` }, "Open full profile →"),
        ]),
      ]),
    ]);

    // Calving history of this animal as a mother (links calf → pedigree).
    const historyCol = col("CALVING HISTORY", asMother.map((c) => JF.Utils.el("div", { class: "card", style: { padding: "var(--space-3)", marginBottom: "var(--space-2)" } }, [
      JF.Utils.el("div", { style: { fontWeight: 700 } }, `${c.CalfName || c.CalfID || "Calf"} · ${c.CalfGender || "?"}`),
      JF.Utils.el("div", { class: "field__hint" }, `${JF.Utils.formatDate(c.Date || c.CalvingDate, "dd MMM yyyy")} · ${c.CalvingType || "Normal"}${c.SireID || c.SireName ? ` · sire: ${c.SireName || c.SireID}` : ""}`),
      c.CalfID ? JF.Utils.el("div", { style: { marginTop: "6px" } }, [
        animals.some((a) => (a.AnimalID || a.id) === c.CalfID)
          ? JF.Utils.el("a", { class: "btn btn--ghost btn--sm", href: `#pedigree/${c.CalfID}` }, "View calf's pedigree →")
          : JF.Utils.el("span", { class: "field__hint" }, "calf not registered as a farm animal"),
      ]) : null,
    ])));

    const grid = JF.Utils.el("div", { class: "grid grid--cols-2", style: { alignItems: "start" } }, [
      JF.Utils.el("div", {}, [selfCard, ancestorsCol, historyCol]),
      JF.Utils.el("div", {}, [offspringCol]),
    ]);
    page.appendChild(grid);

    // A hidden datalist powers free-text search later (kept simple: dropdown above).
    root.appendChild(page);
  };

  return { render };
})();
