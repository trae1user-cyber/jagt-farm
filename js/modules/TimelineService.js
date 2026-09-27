JF.Timeline = (function () {
  const TYPES = [
    { entity: "heat",         Title: "🔥 Heat detected",          Icon: "fire",       DateKey: "HeatDate",    Kind: "heat",      DotClass: "timeline__dot--heat" },
    { entity: "insemination", Title: "❤️ Insemination performed", Icon: "syringe",    DateKey: "Date",        Kind: "ai" },
    { entity: "pregnancy",    Title: "🧪 Pregnancy check",        Icon: "pregnancy",   DateKey: "Date",        Kind: "pregnancy" },
    { entity: "calving",      Title: "👶 Calving",                Icon: "baby2",       DateKey: "Date",        Kind: "calving",   DotClass: "timeline__dot--birth" },
    { entity: "health",       Title: "🩺 Veterinary treatment",   Icon: "treatment",   DateKey: "Date",        Kind: "health",    DotClass: "timeline__dot--health" },
    { entity: "deworming",    Title: "💊 Deworming completed",    Icon: "drop",        DateKey: "Date",        Kind: "deworming" },
    { entity: "vaccination",  Title: "💉 Vaccination given",      Icon: "syringe",     DateKey: "DateGiven",   Kind: "vaccine" },
    { entity: "purchases",    Title: "🐄 Cattle purchase",        Icon: "purchase",    DateKey: "Date",        Kind: "finance",   DotClass: "timeline__dot--finance" },
    { entity: "sales",        Title: "🏷 Cattle sale",            Icon: "sale",        DateKey: "Date",        Kind: "finance",   DotClass: "timeline__dot--finance" },
    { entity: "death",        Title: "⚰ Death recorded",         Icon: "death",       DateKey: "Date",        Kind: "death",     DotClass: "timeline__dot--danger" },
    { entity: "expenses",     Title: "💰 Expense recorded",       Icon: "money",       DateKey: "Date",        Kind: "finance",   DotClass: "timeline__dot--finance" },
  ];

  const animalFor = async (animalId) => {
    const events = [];
    for (const t of TYPES) {
      try {
        const all = await JF.Store[t.entity].list();
        all.forEach((rec) => {
          if (rec.AnimalID && rec.AnimalID === animalId) {
            events.push({
              id: `${t.entity}-${rec.id}`,
              Kind: t.Kind,
              Title: t.Title,
              Subtitle: buildSubtitle(t.entity, rec),
              Date: rec[t.DateKey] || rec.CreatedAt,
              Record: rec,
              Entity: t.entity,
              Icon: t.Icon,
              DotClass: t.DotClass || "",
            });
          }
        });
      } catch (e) { /* noop */ }
    }
    events.sort((a, b) => {
      const da = new Date(a.Date || 0), db = new Date(b.Date || 0);
      return db.getTime() - da.getTime();
    });
    return events;
  };

  const buildSubtitle = (entity, r) => {
    switch (entity) {
      case "heat": return r.HeatIntensity ? `${r.HeatIntensity} · Symptoms: ${(r.Symptoms || []).slice(0,2).join(", ")}` : "Heat event";
      case "insemination": return [r.Method, r.SemenBullID ? `Bull/Semen: ${r.SemenBullID}` : null, r.Technician].filter(Boolean).join(" · ");
      case "pregnancy": return `Result: ${r.Result || "—"}${r.Method ? " · Method: " + r.Method : ""}`;
      case "calving": return `Calf: ${r.CalfID || "New calf"} · ${r.CalfGender || ""} · ${r.CalfWeight ? r.CalfWeight + "kg" : ""}`;
      case "health": return [r.Problem, r.Diagnosis, r.RecoveryStatus].filter(Boolean).join(" · ");
      case "deworming": return [r.Medicine, r.Dose ? r.Dose + " dose" : null, r.Weight ? r.Weight + "kg" : null].filter(Boolean).join(" · ");
      case "vaccination": return [r.Vaccine, r.BatchNumber ? "Batch " + r.BatchNumber : null].filter(Boolean).join(" · ");
      case "purchases": return `₹${r.TotalCost || r.PurchasePrice || 0} from ${r.Seller || "seller"}`;
      case "sales": return `₹${r.NetSale || r.SalePrice || 0} to ${r.Buyer || "buyer"} · ${r.Reason || ""}`;
      case "death": return [r.Cause, r.Veterinarian ? "Vet: " + r.Veterinarian : null].filter(Boolean).join(" · ");
      case "expenses": return `${r.Category || "Expense"} · ₹${r.Amount || 0}${r.Vendor ? " · " + r.Vendor : ""}`;
      default: return "";
    }
  };

  const renderNode = (list) => {
    const wrap = JF.Utils.el("div", { class: "timeline" });
    if (!list.length) {
      wrap.appendChild(JF.Utils.el("div", { class: "search-empty" }, "No timeline events yet. Events appear automatically as you record heats, treatments, vaccinations and more."));
      return wrap;
    }
    list.forEach((ev) => {
      const item = JF.Utils.el("div", { class: "timeline__item" }, [
        JF.Utils.el("div", { class: `timeline__dot ${ev.DotClass || ""}`, html: JF.Utils.svgIcon(ev.Icon, 10, 10) }),
        JF.Utils.el("div", { class: "timeline__date" }, JF.Utils.formatDate(ev.Date, "dd MMM yyyy")),
        JF.Utils.el("div", { class: "timeline__title" }, ev.Title),
        JF.Utils.el("div", { class: "timeline__desc" }, ev.Subtitle || ""),
      ]);
      wrap.appendChild(item);
    });
    return wrap;
  };

  /**
   * Synchronous variant used by the animal profile: builds the same unified event
   * list from a pre-fetched cache ({ heat: [...], health: [...], ... }) instead of
   * hitting the Store. Used when the profile already loaded all entity lists.
   */
  const animalForSync = (animalId, cache = {}) => {
    const events = [];
    TYPES.forEach((t) => {
      (cache[t.entity] || []).forEach((rec) => {
        if (rec && rec.AnimalID === animalId) {
          events.push({
            id: `${t.entity}-${rec.id}`,
            Kind: t.Kind,
            Title: t.Title,
            Subtitle: buildSubtitle(t.entity, rec),
            Date: rec[t.DateKey] || rec.CreatedAt,
            Record: rec,
            Entity: t.entity,
            Icon: t.Icon,
            DotClass: t.DotClass || "",
          });
        }
      });
    });
    events.sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
    return events;
  };

  return { animalFor, animalForSync, renderNode, TYPES };
})();
