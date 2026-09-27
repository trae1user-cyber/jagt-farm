JF.Views = JF.Views || {};
JF.Views.Health = (function () {
  const $ = () => document.getElementById("view-container");
  const SUB = {
    vet:        { label: "Veterinary Records", icon: "health" },
    treatments: { label: "Treatments",         icon: "treatment" },
    vaccine:    { label: "Vaccination",        icon: "syringe" },
    deworming:  { label: "Deworming",          icon: "drop" },
  };

  const subNav = (active = "vet") => {
    const row = JF.Utils.el("div", { class: "tabs", style: { marginBottom: "var(--space-5)" } });
    Object.entries(SUB).forEach(([k, v]) => {
      const a = JF.Utils.el("a", {
        class: `tab ${active === k ? "is-active" : ""}`,
        href: `#health/${k}`,
        html: `<span style="display:inline-flex;align-items:center;gap:6px;">${JF.Utils.svgIcon(v.icon, 14, 14)} ${v.label}</span>`,
      });
      row.appendChild(a);
    });
    return row;
  };

  const renderTable = (headers, rows) => {
    const container = JF.Utils.el("div", { class: "table-container card" });
    const table = JF.Utils.el("table", { class: "table" });
    const thead = JF.Utils.el("thead", {}, [
      JF.Utils.el("tr", {}, headers.map(h => JF.Utils.el("th", {}, h)))
    ]);
    const tbody = JF.Utils.el("tbody", {}, rows.length ? rows.map(r =>
      JF.Utils.el("tr", {
        style: r.animalId ? "cursor:pointer" : "",
        onclick: r.animalId ? () => JF.App.navigate(`#animal/${r.animalId}`) : null
      }, r.cols.map(c => JF.Utils.el("td", {}, c)))
    ) : [
      JF.Utils.el("tr", {}, [
        JF.Utils.el("td", { colSpan: headers.length, style: "text-align:center;padding:24px;color:var(--color-ink-400)" }, "No records found in this view.")
      ])
    ]);
    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
    return container;
  };

  const render = async (path = "") => {
    const root = $();
    const sub = path?.[1] || "vet";
    JF.Utils.clear(root);

    let healths = [], vax = [], dews = [];
    try {
      healths = await JF.Store.health.list();
      vax = await JF.Store.vaccination.list();
      dews = await JF.Store.deworming.list();
    } catch (e) { console.warn(e); }

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "🩺 Health"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, SUB[sub]?.label || "Veterinary Records"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Herd health management — treatment logs, vaccinations, deworming schedules and veterinary cases."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", {
          class: "btn btn--primary btn--icon-label btn--sm",
          html: `${JF.Utils.svgIcon("plus", 14, 14)} Log Record`,
          onclick: () => JF.QuickEntry?.openForm(sub === "vaccine" ? "vaccine" : sub === "deworming" ? "deworm" : "treat"),
        }),
      ]),
    ]));

    page.appendChild(subNav(sub));

    if (sub === "vaccine") {
      const rows = vax.map(v => ({
        animalId: v.AnimalID,
        cols: [
          `<strong>${v.VaccinationID || "VAX-REC"}</strong>`,
          v.AnimalID || "—",
          v.Vaccine || "Standard Vaccine",
          JF.Utils.formatDate(v.DateGiven, "dd MMM yyyy"),
          v.NextDueDate ? JF.Utils.formatDate(v.NextDueDate, "dd MMM yyyy") : "—",
          v.BatchNumber || "—",
          v.Veterinarian || "—",
          v.Cost ? JF.Utils.money(v.Cost) : "—"
        ]
      }));
      page.appendChild(renderTable(["Vaccination ID", "Animal ID", "Vaccine Name", "Date Given", "Next Due Date", "Batch #", "Vet", "Cost"], rows));
    } else if (sub === "deworming") {
      const rows = dews.map(d => ({
        animalId: d.AnimalID,
        cols: [
          `<strong>${d.DewormingID || "DEW-REC"}</strong>`,
          d.AnimalID || "—",
          d.Medicine || "Dewormer",
          JF.Utils.formatDate(d.Date, "dd MMM yyyy"),
          d.Dose || "Standard",
          d.NextDueDate ? JF.Utils.formatDate(d.NextDueDate, "dd MMM yyyy") : "—",
          d.Veterinarian || "—",
          d.Cost ? JF.Utils.money(d.Cost) : "—"
        ]
      }));
      page.appendChild(renderTable(["Deworming ID", "Animal ID", "Medicine", "Date", "Dose", "Next Due Date", "Vet", "Cost"], rows));
    } else {
      // vet & treatments
      const rows = healths.map(h => ({
        animalId: h.AnimalID,
        cols: [
          `<strong>${h.HealthRecordID || "VET-REC"}</strong>`,
          h.AnimalID || "—",
          JF.Utils.formatDate(h.Date, "dd MMM yyyy"),
          h.Problem || "Checkup",
          h.Diagnosis || "—",
          h.Medicine || "—",
          `<span class="badge ${h.RecoveryStatus === "Recovered" ? "badge--accent" : "badge--warning"}">${h.RecoveryStatus || "Active"}</span>`,
          h.TreatmentCost ? JF.Utils.money(h.TreatmentCost) : "—"
        ]
      }));
      page.appendChild(renderTable(["Record ID", "Animal ID", "Date", "Problem", "Diagnosis", "Medicine", "Status", "Cost"], rows));
    }

    root.appendChild(page);
  };

  return { render };
})();

