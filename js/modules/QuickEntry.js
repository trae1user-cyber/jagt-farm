JF.QuickEntry = (function () {
  const OPTIONS = [
    { id: "animal",   label: "New Animal",      icon: "animals",   key: "🐄" },
    { id: "heat",     label: "Heat",            icon: "fire",      key: "🔥" },
    { id: "ai",       label: "Insemination",    icon: "syringe",   key: "❤️" },
    { id: "preg",     label: "Pregnancy Check", icon: "pregnancy", key: "🧪" },
    { id: "calving",  label: "Calving",         icon: "baby2",     key: "👶" },
    { id: "treat",    label: "Treatment",       icon: "treatment", key: "🩺" },
    { id: "vaccine",  label: "Vaccination",     icon: "syringe",   key: "💉" },
    { id: "deworm",   label: "Deworming",       icon: "drop",      key: "💊" },
    { id: "dryoff",   label: "Make Dry",        icon: "drop",      key: "🛑" },
    { id: "death",    label: "Death",           icon: "death",     key: "⚰️" },
    { id: "expense",  label: "Expense",         icon: "money",     key: "💰" },
    { id: "milk",     label: "Milk Payment",    icon: "drop",      key: "🥛" },
    { id: "purchase", label: "Purchase",        icon: "purchase",  key: "🧾" },
    { id: "sale",     label: "Sale",            icon: "sale",      key: "🏷️" },
    { id: "photo",    label: "Upload Photo",    icon: "photo",     key: "📷" },
    { id: "observe",  label: "Heat Observation", icon: "fire",      key: "🕵" },
    { id: "document", label: "Document",        icon: "document",  key: "📄" },
    { id: "reminder", label: "Custom Reminder", icon: "bell",      key: "🔔" },
  ];

  const $v = (id) => document.getElementById(id)?.value?.trim() || "";

  const field = (label, id, opts = {}) => JF.Utils.el("div", { class: "field" }, [
    JF.Utils.el("label", { class: "field__label" }, label),
    opts.options
      ? JF.Utils.el("select", { class: "select", id }, opts.options.map((o) => JF.Utils.el("option", { value: o }, o)))
      : JF.Utils.el("input", { class: "input", type: opts.type || "text", id, value: opts.value ?? "", placeholder: opts.ph || "" }),
  ]);

  const animalSelect = async (id) => {
    const animals = ((await JF.Store.animals.list()) || []).filter((a) => !["Sold", "Deceased"].includes(a.CurrentStatus));
    const sel = JF.Utils.el("select", { class: "select", id }, [
      JF.Utils.el("option", { value: "" }, "-- Select animal --"),
      ...animals.map((a) => JF.Utils.el("option", { value: a.AnimalID }, `${a.Name} (${a.AnimalID})`)),
    ]);
    return JF.Utils.el("div", { class: "field" }, [JF.Utils.el("label", { class: "field__label" }, "Animal *"), sel]);
  };

  const dateField = (id = "qe-date") => field("Date *", id, { type: "date", value: JF.Utils.todayISO() });

  const ok = (checks) => {
    const bad = checks.filter(([v]) => !v);
    if (bad.length) { JF.Toast.show(`Missing: ${bad.map(([, n]) => n).join(", ")}`, "warning"); return false; }
    return true;
  };

  const num = (id) => { const v = $v(id); return v ? Number(v) : 0; };

  // Values that must be a positive number (quantities, money). Zero or negative
  // gets rejected with the field's display name - a real save can never produce
  // a "₹-576 milk payment" style record.
  const positive = (checks) => {
    const bad = checks.filter(([v]) => !(typeof v === "number" && v > 0 && Number.isFinite(v)));
    if (bad.length) { JF.Toast.show(`Must be a positive number: ${bad.map(([, n]) => n).join(", ")}`, "warning"); return false; }
    return true;
  };

  /* ---------- One save() per operation. Each returns {label, id, tab} for the toast link. ---------- */
  const SAVE = {
    async animal(formEl) {
      if (!ok([[$v("qe-name"), "Name"]])) return null;
      const species = $v("qe-species") || "Cattle";
      const prefix = species === "Buffalo" ? "BUFF" : ($v("qe-gender") === "Male" ? "BULL" : "COW");
      const all = await JF.Store.animals.list();
      let n = all.filter((a) => a.AnimalID?.startsWith(prefix)).length + 1;
      let id = `${prefix}-${String(n).padStart(3, "0")}`;
      while (all.some((a) => a.AnimalID === id)) { n++; id = `${prefix}-${String(n).padStart(3, "0")}`; }
      const uploaded = await JF.PhotoUpload.consume(formEl && formEl._photoField, { animalId: "", kind: "Profile" });
      await JF.Store.animals.create({
        id, AnimalID: id, Name: $v("qe-name"), TagNumber: $v("qe-tag") || null,
        Species: species, Breed: $v("qe-breed") || null, Gender: $v("qe-gender") || "Female",
        DateOfBirth: $v("qe-dob") || null, PurchaseDate: $v("qe-pdate") || null,
        PurchasePrice: num("qe-pprice") || null, CurrentStatus: "Open",
        CurrentGroup: $v("qe-group") || "Main Herd", CurrentLocation: $v("qe-loc") || "Barn A",
        PhotoURL: uploaded || JF.Utils.portraitSVG($v("qe-name") || id, species === "Buffalo" ? "buffalo" : "cattle"),
      });
      if (uploaded) {
        try { await JF.PhotoUpload.attachToAnimal({ animalId: id, url: uploaded, kind: "Profile", fileName: $v("qe-name") + "-profile.jpg" }); } catch (e) { console.warn(e); }
      }
      return { label: "Animal", id, tab: "overview" };
    },

    async heat() {
      if (!ok([[$v("qe-animal"), "Animal"]])) return null;
      await JF.Store.heat.create({
        HeatRecordID: `HEAT-${JF.Utils.uid()}`, AnimalID: $v("qe-animal"), HeatDate: $v("qe-date"),
        HeatTime: $v("qe-time") || null, HeatIntensity: $v("qe-int") || "Moderate",
        DetectionMethod: $v("qe-det") || "Visual",
        Symptoms: [...document.querySelectorAll(".qe-symptom:checked")].map((c) => c.value),
        PhotoURL: JF.Utils.portraitSVG(`heat-${$v("qe-animal")}-${$v("qe-date")}`, "cattle"),
      });
      return { label: "Heat record", id: $v("qe-animal"), tab: "heat" };
    },

    async ai() {
      if (!ok([[$v("qe-animal"), "Animal"]])) return null;
      await JF.Store.insemination.create({
        InseminationID: `AI-${JF.Utils.uid()}`, AnimalID: $v("qe-animal"), Date: $v("qe-date"),
        Method: $v("qe-method") || "Artificial Insemination", SemenBullID: $v("qe-bull") || null,
        Technician: $v("qe-tech") || null, Cost: num("qe-cost"),
      });
      return { label: "Insemination", id: $v("qe-animal"), tab: "insemination" };
    },

    async preg() {
      if (!ok([[$v("qe-animal"), "Animal"], [$v("qe-result"), "Result"]])) return null;
      await JF.Store.pregnancy.create({
        PregnancyCheckID: `PREG-${JF.Utils.uid()}`, AnimalID: $v("qe-animal"), Date: $v("qe-date"),
        Method: $v("qe-pmethod") || "Rectal Palpation", Result: $v("qe-result"),
        Veterinarian: $v("qe-vet") || null, InseminationID: $v("qe-ai") || null,
      });
      return { label: "Pregnancy check", id: $v("qe-animal"), tab: "pregnancy" };
    },

    async calving() {
      if (!ok([[$v("qe-animal"), "Animal"]])) return null;
      const animals = await JF.Store.animals.list();
      const year = new Date($v("qe-date")).getFullYear();
      const n = animals.filter((a) => a.AnimalID?.startsWith(`CALF-${year}-`)).length + 1;
      const calfID = `CALF-${year}-${String(n).padStart(3, "0")}`;
      const calfGender = $v("qe-cgender") || "Female";
      const mother = await JF.Store.animals.get($v("qe-animal"));
      await JF.Store.calving.create({
        CalvingID: `CALV-${JF.Utils.uid()}`, AnimalID: $v("qe-animal"), Date: $v("qe-date"),
        CalvingType: $v("qe-ctype") || "Normal", AssistanceRequired: false, Complications: "None",
        CalfID: calfID, CalfName: $v("qe-cname") || null, CalfGender: calfGender, CalfWeight: num("qe-cweight") || null,
        CalfHealth: $v("qe-chealth") || "Healthy", Veterinarian: $v("qe-vet") || null,
        PhotoURL: JF.Utils.portraitSVG(`calving-${calfID}`, "calf"),
      });
      // NOTE: the calf master record (with MotherID/FatherID + care-plan reminders) is
      // created by the cascade engine's calving:created handler, so every entry path
      // behaves identically.
      return { label: `Calving · calf ${calfID}`, id: calfID, tab: "overview" };
    },

    async treat() {
      if (!ok([[$v("qe-animal"), "Animal"], [$v("qe-problem"), "Problem"]])) return null;
      const meds = [...document.querySelectorAll(".qe-med-row")].map((row) => ({
        name: row.querySelector(".qe-med-name")?.value?.trim(),
        dose: row.querySelector(".qe-med-dose")?.value?.trim(),
        duration: row.querySelector(".qe-med-dur")?.value?.trim(),
      })).filter((m) => m.name);
      const animals = await JF.Store.animals.list();
      const cur = animals.find((x) => x.AnimalID === $v("qe-animal"));
      await JF.Store.health.create({
        HealthRecordID: `HEA-${JF.Utils.uid()}`, AnimalID: $v("qe-animal"), Date: $v("qe-date"),
        Problem: $v("qe-problem"), Diagnosis: $v("qe-diag") || null,
        Treatment: $v("qe-treat") || null, Medicine: meds[0]?.name || null, Dose: meds[0]?.dose || null,
        Medicines: meds, Veterinarian: $v("qe-vet") || null, TreatmentCost: num("qe-cost"),
        FollowUpDate: $v("qe-followup") || null,
        RecoveryStatus: $v("qe-status") || "Under Treatment",
      });
      // Remember the pre-illness status so recovery can restore it (only when the
      // animal is newly entering care — don't clobber a stored value).
      if (cur && !["Under Treatment", "Sick"].includes(cur.CurrentStatus)) {
        await JF.Store.animals.update(cur.id, { PreviousStatus: cur.CurrentStatus, UpdatedAt: new Date().toISOString() });
      }
      return { label: "Treatment", id: $v("qe-animal"), tab: "health" };
    },

    async vaccine() {
      if (!ok([[$v("qe-animal"), "Animal"], [$v("qe-vaccine"), "Vaccine"]])) return null;
      await JF.Store.vaccination.create({
        VaccinationID: `VAC-${JF.Utils.uid()}`, AnimalID: $v("qe-animal"),
        Vaccine: $v("qe-vaccine"), DateGiven: $v("qe-date"), BatchNumber: $v("qe-batch") || null,
        NextDueDate: $v("qe-next") || null, Veterinarian: $v("qe-vet") || null, Cost: num("qe-cost"),
      });
      return { label: "Vaccination", id: $v("qe-animal"), tab: "vaccination" };
    },

    async deworm() {
      if (!ok([[$v("qe-animal"), "Animal"]])) return null;
      await JF.Store.deworming.create({
        DewormingID: `DEW-${JF.Utils.uid()}`, AnimalID: $v("qe-animal"), Date: $v("qe-date"),
        Medicine: $v("qe-med") || "Albendazole", Dose: $v("qe-dose") || null,
        Weight: num("qe-weight") || null, Veterinarian: $v("qe-vet") || null, Cost: num("qe-cost"),
        NextDueDate: $v("qe-next") || null,
      });
      return { label: "Deworming", id: $v("qe-animal"), tab: "deworming" };
    },

    async dryoff() {
      if (!ok([[$v("qe-animal"), "Animal"]])) return null;
      const animals = await JF.Store.animals.list();
      const a = animals.find((x) => x.AnimalID === $v("qe-animal"));
      const dim = a && a.LactationStart ? JF.Utils.daysBetween(a.LactationStart, $v("qe-date")) : null;
      await JF.Store.dryOff.create({
        DryOffID: `DRY-${JF.Utils.uid()}`, AnimalID: $v("qe-animal"), Date: $v("qe-date"),
        ExpectedCalvingDate: $v("qe-nextcalv") || null, DaysInMilkAtDry: dim, Reason: $v("qe-dryreason") || "Scheduled dry-off",
      });
      return { label: `Dry-off · ${$v("qe-animal")}`, id: $v("qe-animal"), tab: "overview" };
    },

    async death() {
      if (!ok([[$v("qe-animal"), "Animal"]])) return null;
      await JF.Store.death.create({
        DeathID: `DEATH-${JF.Utils.uid()}`, AnimalID: $v("qe-animal"), Date: $v("qe-date"),
        Cause: $v("qe-cause") || "Unknown", Veterinarian: $v("qe-vet") || null,
        EstimatedValue: num("qe-value") || null, Notes: $v("qe-notes") || null,
      });
      return { label: "Death record", id: $v("qe-animal"), tab: "overview" };
    },

    async expense() {
      if (!positive([[num("qe-amount"), "Amount"]])) return null;
      await JF.Store.expenses.create({
        ExpenseID: `EXP-${JF.Utils.uid()}`, Date: $v("qe-date"), Category: $v("qe-cat") || "Other Farm Expense",
        Description: $v("qe-desc") || null, Amount: num("qe-amount"),
        PaymentMethod: $v("qe-pay") || "Cash", Vendor: $v("qe-vendor") || null,
        AnimalID: $v("qe-animal-x") || null,
      });
      return { label: "Expense", id: $v("qe-animal-x"), tab: "expenses" };
    },

    /** Milk payment received: the dairy's main income. Posts Dr Cash/Bank · Cr Milk Sales. */
    async milk() {
      if (!positive([[num("qe-milk-qty"), "Quantity"], [num("qe-milk-rate"), "Rate"]])) return null;
      const qty = num("qe-milk-qty"), rate = num("qe-milk-rate");
      const amount = Math.round(qty * rate * 100) / 100;
      await JF.Store.milkSales.create({
        MilkSaleID: `MILK-${JF.Utils.uid("m")}`, Date: $v("qe-date"), Time: $v("qe-milk-time") || null,
        Shift: $v("qe-milk-shift") || "Morning", Buyer: $v("qe-milk-buyer") || null,
        QuantityLitres: qty, FatPercent: num("qe-milk-fat") || null, RatePerLitre: rate,
        Amount: amount, PaymentMethod: $v("qe-milk-pay") || "Cash",
        PaymentStatus: $v("qe-milk-status") || "Received",
        AnimalNotes: $v("qe-milk-notes") || null,
      });
      return { label: `Milk payment · ₹${amount}`, id: null, tab: null };
    },

    async purchase() {
      if (!ok([[$v("qe-seller"), "Seller"], []]) || !positive([[num("qe-price"), "Price"]])) return null;
      const species = $v("qe-species") || "Cattle";
      const prefix = species === "Buffalo" ? "BUFF" : ($v("qe-gender") === "Male" ? "BULL" : "COW");
      const all = await JF.Store.animals.list();
      let n = all.filter((a) => a.AnimalID?.startsWith(prefix)).length + 1;
      let id = `${prefix}-${String(n).padStart(3, "0")}`;
      while (all.some((a) => a.AnimalID === id)) { n++; id = `${prefix}-${String(n).padStart(3, "0")}`; }
      const total = num("qe-price") + num("qe-transport") + num("qe-vetcheck");
      await JF.Store.animals.create({
        id, AnimalID: id, Name: $v("qe-name") || id, Species: species,
        Breed: $v("qe-breed") || null, Gender: $v("qe-gender") || "Female",
        DateOfBirth: $v("qe-dob") || null, PurchaseDate: $v("qe-date"),
        PurchasePrice: num("qe-price"), CurrentStatus: "Open",
        PhotoURL: JF.Utils.portraitSVG($v("qe-name") || id, species === "Buffalo" ? "buffalo" : "cattle"),
      });
      await JF.Store.purchases.create({
        PurchaseID: `PUR-${JF.Utils.uid()}`, Date: $v("qe-date"), Seller: $v("qe-seller"),
        AnimalID: id, Species: species, Breed: $v("qe-breed") || null, Age: null, Weight: num("qe-weight") || null,
        PurchasePrice: num("qe-price"), TransportationCost: num("qe-transport"),
        VeterinaryCheckCost: num("qe-vetcheck"), OtherCost: 0, TotalCost: total,
        PaymentMethod: $v("qe-pay") || "Cash",
      });
      return { label: `Purchase · ${id}`, id, tab: "overview" };
    },

    async sale() {
      if (!ok([[$v("qe-animal"), "Animal"], []]) || !positive([[num("qe-price"), "Sale price"]])) return null;
      const price = num("qe-price"), trans = num("qe-trans"), comm = num("qe-comm");
      await JF.Store.sales.create({
        SaleID: `SALE-${JF.Utils.uid()}`, Date: $v("qe-date"), AnimalID: $v("qe-animal"),
        Buyer: $v("qe-buyer") || null, SalePrice: price, Transportation: trans, Commission: comm,
        OtherCost: 0, NetSale: price - trans - comm, PaymentMethod: $v("qe-pay") || "Cash",
        Reason: $v("qe-reason") || null,
      });
      return { label: "Sale", id: $v("qe-animal"), tab: "overview" };
    },

    async observe(formEl) {
      if (!ok([[$v("qe-animal"), "Animal"]])) return null;
      const signs = [...document.querySelectorAll(".qe-obs-sign:checked")].map((c) => c.value);
      if (!signs.length) { ok([["", "At least one observed sign"]]); return null; }
      const animalId = $v("qe-animal");
      let photoURL = null;
      try {
        const url = await JF.PhotoUpload.consume(formEl && formEl._photoField, { animalId, kind: "Heat" });
        if (url) photoURL = url;
      } catch (e) { /* photo optional */ }
      await JF.Store.heat.create({
        HeatRecordID: `HEAT-${JF.Utils.uid()}`, AnimalID: animalId,
        HeatDate: $v("qe-date") || JF.Utils.todayISO(), HeatTime: $v("qe-time") || "",
        HeatIntensity: signs.some((s) => /standing/i.test(s)) ? "Standing" : "Observed",
        DetectionMethod: "Observation Sheet", Symptoms: signs,
        PhotoURL: photoURL || null,
        Notes: "Recorded via observation sheet",
      });
      return { label: "Observation", id: animalId, tab: "heat" };
    },

    async photo(formEl) {
      if (!ok([[$v("qe-animal"), "Animal"]])) return null;
      const animalId = $v("qe-animal");
      const kind = $v("qe-photo-kind") || "Profile";
      const fallback = JF.Utils.portraitSVG(`photo-${animalId}-${Date.now()}`, "cattle");
      let url = fallback, mode = "local";
      try {
        const res = await JF.PhotoUpload.consume(formEl && formEl._photoField, { animalId, kind });
        if (res) { url = res; mode = JF.PhotoUpload.isDriveLink(res) ? "drive" : "local"; }
      } catch (e) { console.warn(e); }
      await JF.Store.files.create({
        FileID: `FILE-${JF.Utils.uid()}`, FileName: `photo-${animalId}-${$v("qe-date")}.jpg`,
        Category: "Animal", FileType: "image", AnimalID: animalId,
        RecordType: kind, RecordID: animalId,
        DriveURL: mode === "drive" ? url : null, LocalURL: url,
        UploadDate: JF.Utils.todayISO(),
        Notes: mode === "drive" ? "Uploaded to the farm server" : "Stored on this device (backend not connected)",
      });
      if (kind === "Profile" || kind === "Identification") {
        const animals = await JF.Store.animals.list();
        const a = animals.find((x) => x.AnimalID === animalId || x.id === animalId);
        if (a) await JF.Store.animals.update(a.id, { PhotoURL: url });
      }
      JF.Toast.show(mode === "drive" ? "Photo uploaded to the server." : "Photo saved on this device (connect the farm API in Settings to sync).", mode === "drive" ? "success" : "warning");
      return { label: "Photo", id: animalId, tab: "photos" };
    },

    async document() {
      if (!ok([[$v("qe-docname"), "File name"]])) return null;
      await JF.Store.files.create({
        FileID: `FILE-${JF.Utils.uid()}`, FileName: $v("qe-docname"),
        Category: $v("qe-doccat") || "Other", AnimalID: $v("qe-animal") || null,
        RecordType: null, RecordID: $v("qe-docref") || null, DriveURL: null,
        UploadDate: JF.Utils.todayISO(), Notes: $v("qe-docnotes") || null,
      });
      return { label: "Document", id: $v("qe-animal"), tab: null };
    },

    async reminder() {
      if (!ok([[$v("qe-remtype"), "Type"]])) return null;
      await JF.Store.reminders.create({
        ReminderID: `RMN-${JF.Utils.uid()}`, ReminderType: $v("qe-remtype"),
        AnimalID: $v("qe-animal") || null, DueDate: $v("qe-remdue") || JF.Utils.todayISO(),
        ReminderDate: $v("qe-remdue") || JF.Utils.todayISO(),
        Priority: $v("qe-rempri") || "Normal", Status: "Upcoming", Notes: $v("qe-remnotes") || null,
      });
      return { label: "Reminder", id: $v("qe-animal"), tab: null };
    },
  };

  /* ---------- Form layouts ---------- */
  const FORMS = {
    animal: async () => {
      const photo = JF.PhotoUpload.photoField({ inputId: "qe-photo", label: "Photo / ID shot (uploads to the server when connected)" });
      const wrap = JF.Utils.el("div", { class: "form-stack" }, [
        photo,
        field("Name *", "qe-name"), field("Tag number", "qe-tag"),
        field("Species", "qe-species", { options: ["Cattle", "Buffalo"] }),
        field("Breed", "qe-breed", { options: ["HF Cross", "Jersey Cross", "Sahiwal", "Gir", "Red Sindhi", "Tharparkar", "Murrah Buffalo", "Nili-Ravi Buffalo", "Indigenous Cross"] }),
        field("Gender", "qe-gender", { options: ["Female", "Male"] }),
        field("Date of birth", "qe-dob", { type: "date" }),
        field("Purchase date", "qe-pdate", { type: "date" }),
        field("Purchase price (₹)", "qe-pprice", { type: "number", ph: "e.g. 85000" }),
        field("Group", "qe-group", { options: ["Main Herd", "Maternity", "Dry Lot", "Hospital Pen", "Young Stock", "Breeding"] }),
        field("Location", "qe-loc", { options: ["Barn A", "Barn B", "Barn C", "Grazing Field 3", "Hospital", "Maternity Barn"] }),
      ]);
      wrap._photoField = photo;
      return wrap;
    },

    heat: async () => {
      const w = JF.Utils.el("div", { class: "form-stack" }, [
        await animalSelect("qe-animal"), dateField(),
        field("Heat time", "qe-time", { type: "time", value: "08:00" }),
        field("Intensity", "qe-int", { options: ["Mild", "Moderate", "Strong", "Standing"] }),
        field("Detection method", "qe-det", { options: ["Visual", "Activity Monitor", "Teaser Bull", "Chin Ball"] }),
      ]);
      w.appendChild(JF.Utils.el("div", { class: "field" }, [
        JF.Utils.el("label", { class: "field__label" }, "Symptoms"),
        JF.Utils.el("div", { class: "chip-row" }, ["Standing Heat", "Mounting", "Mucus Discharge", "Restlessness", "Reduced Intake", "Vulvar Swelling"].map((s) =>
          JF.Utils.el("label", { class: "chip", style: { cursor: "pointer" } }, [
            JF.Utils.el("input", { type: "checkbox", class: "qe-symptom", value: s, style: { marginRight: "5px" } }), s,
          ]))),
      ]));
      return w;
    },

    ai: async () => JF.Utils.el("div", { class: "form-stack" }, [
      await animalSelect("qe-animal"), dateField(),
      field("Method", "qe-method", { options: ["Artificial Insemination", "Natural Service"] }),
      field("Bull / Semen ID", "qe-bull", { ph: "e.g. BULL-001" }),
      field("Technician", "qe-tech", { ph: "e.g. Dr. Sharma" }),
      field("Cost (₹)", "qe-cost", { type: "number", ph: "e.g. 400" }),
    ]),

    preg: async () => JF.Utils.el("div", { class: "form-stack" }, [
      await animalSelect("qe-animal"), dateField(),
      field("Method", "qe-pmethod", { options: ["Rectal Palpation", "Ultrasound"] }),
      field("Result *", "qe-result", { options: ["Positive", "Negative", "Recheck", "Unknown"] }),
      field("Linked AI ID (optional)", "qe-ai", { ph: "e.g. AI-001" }),
      field("Veterinarian", "qe-vet", { ph: "e.g. Dr. Sharma" }),
    ]),

    calving: async () => JF.Utils.el("div", { class: "form-stack" }, [
      await animalSelect("qe-animal"), dateField(),
      field("Calving type", "qe-ctype", { options: ["Normal", "Assisted", "Dystokia", "C-Section"] }),
      field("Calf name", "qe-cname", { ph: "optional" }),
      field("Calf gender", "qe-cgender", { options: ["Female", "Male"] }),
      field("Calf weight (kg)", "qe-cweight", { type: "number", ph: "e.g. 32" }),
      field("Calf health", "qe-chealth", { options: ["Healthy", "Weak", "Needs Care"] }),
      field("Veterinarian", "qe-vet", { ph: "optional" }),
    ]),

    treat: async () => {
      const w = JF.Utils.el("div", { class: "form-stack" }, [
        await animalSelect("qe-animal"), dateField(),
        field("Problem *", "qe-problem", { ph: "e.g. Mild fever" }),
        field("Diagnosis", "qe-diag", { ph: "optional" }),
        field("Treatment", "qe-treat", { ph: "e.g. Antibiotic course" }),
        field("Veterinarian", "qe-vet", { ph: "optional" }),
      ]);
      const medWrap = JF.Utils.el("div", { class: "field" }, [
        JF.Utils.el("label", { class: "field__label" }, "Medicines"),
        JF.Utils.el("div", { id: "qe-med-lines" }, [medRow()]),
        JF.Utils.el("button", { type: "button", class: "btn btn--ghost btn--sm", style: { marginTop: "8px" }, onclick: () => document.getElementById("qe-med-lines").appendChild(medRow()) }, "+ Add medicine"),
      ]);
      w.appendChild(medWrap);
      w.appendChild(field("Treatment cost (₹)", "qe-cost", { type: "number", ph: "e.g. 1500" }));
      w.appendChild(field("Follow-up date", "qe-followup", { type: "date" }));
      w.appendChild(field("Recovery status", "qe-status", { options: ["Under Treatment", "Follow-up Required", "Recovered", "Chronic"] }));
      return w;
    },

    vaccine: async () => {
      const w = JF.Utils.el("div", { class: "form-stack" }, [
        await animalSelect("qe-animal"), dateField(),
        field("Vaccine *", "qe-vaccine", { options: ["FMD (Foot & Mouth Disease)", "HS (Haemorrhagic Septicaemia)", "BQ (Black Quarter)", "Anthrax", "Brucellosis", "Theileriosis"] }),
        field("Batch number", "qe-batch", { ph: "optional" }),
        field("Next due date", "qe-next", { type: "date" }),
        field("Veterinarian", "qe-vet", { ph: "optional" }),
        field("Cost (₹)", "qe-cost", { type: "number" }),
      ]);
      return w;
    },

    deworm: async () => JF.Utils.el("div", { class: "form-stack" }, [
      await animalSelect("qe-animal"), dateField(),
      field("Medicine", "qe-med", { options: ["Albendazole", "Ivermectin", "Fenbendazole", "Oxyclozanide"] }),
      field("Dose", "qe-dose", { ph: "e.g. 60 ml" }),
      field("Weight (kg)", "qe-weight", { type: "number" }),
      field("Next due date", "qe-next", { type: "date" }),
      field("Veterinarian", "qe-vet", { ph: "optional" }),
      field("Cost (₹)", "qe-cost", { type: "number" }),
    ]),

    death: async () => JF.Utils.el("div", { class: "form-stack" }, [
      await animalSelect("qe-animal"), dateField(),
      field("Cause", "qe-cause", { ph: "e.g. Severe bloat" }),
      field("Veterinarian", "qe-vet", { ph: "optional" }),
      field("Estimated value (₹)", "qe-value", { type: "number" }),
      field("Notes", "qe-notes"),
    ]),

    dryoff: async () => {
      // Pre-fill the expected calving date from the derived model (AI + 283d).
      let suggested = "";
      try { const board = await JF.LifeCycle.calvingBoard(); const row = board.find((r) => r.animal.AnimalID === $v("qe-animal")); if (row) suggested = row.lc.expectedCalving.date; } catch (e) {}
      return JF.Utils.el("div", { class: "form-stack" }, [
        await animalSelect("qe-animal"),
        dateField(),
        field("Expected calving date (optional)", "qe-nextcalv", { type: "date", value: suggested }),
        field("Reason", "qe-dryreason", { options: ["Scheduled dry-off", "Low yield", "Health", "Other"] }),
      ]);
    },

    milk: async () => JF.Utils.el("div", { class: "form-stack" }, [
      dateField(),
      field("Time", "qe-milk-time", { type: "time", value: new Date().toTimeString().slice(0, 5) }),
      field("Shift", "qe-milk-shift", { options: ["Morning", "Evening"] }),
      field("Quantity (litres) *", "qe-milk-qty", { type: "number", step: "0.1", ph: "e.g. 24.5" }),
      field("Fat % (optional)", "qe-milk-fat", { type: "number", step: "0.1", ph: "e.g. 6.2" }),
      field("Rate per litre (₹) *", "qe-milk-rate", { type: "number", step: "0.5", ph: "e.g. 42" }),
      field("Buyer", "qe-milk-buyer", { ph: "e.g. Verka Dairy / local vendor" }),
      field("Payment method", "qe-milk-pay", { options: ["Cash", "Bank Transfer", "UPI", "Cheque", "Card"] }),
      field("Payment status", "qe-milk-status", { options: ["Received", "Pending"] }),
      field("Notes", "qe-milk-notes", { ph: "optional" }),
    ]),

    expense: async () => JF.Utils.el("div", { class: "form-stack" }, [
      dateField(),
      field("Category", "qe-cat", { options: ["Veterinary", "Medicine", "Vaccination", "Deworming", "Labor", "Electricity", "Water", "Fuel", "Transportation", "Maintenance", "Equipment", "Raw Material Purchase", "Other Farm Expense"] }),
      field("Amount (₹) *", "qe-amount", { type: "number", ph: "e.g. 5000" }),
      field("Vendor", "qe-vendor", { ph: "optional" }),
      field("Payment method", "qe-pay", { options: ["Cash", "Bank Transfer", "UPI", "Cheque", "Card"] }),
      field("Linked animal (optional)", "qe-animal-x", { ph: "e.g. COW-005" }),
      field("Description", "qe-desc"),
    ]),

    purchase: async () => JF.Utils.el("div", { class: "form-stack" }, [
      dateField(),
      field("Seller *", "qe-seller", { ph: "e.g. Ramesh Kumar Dairy Farm" }),
      field("Name", "qe-name", { ph: "animal name (optional)" }),
      field("Species", "qe-species", { options: ["Cattle", "Buffalo"] }),
      field("Breed", "qe-breed", { options: ["HF Cross", "Jersey Cross", "Sahiwal", "Gir", "Red Sindhi", "Tharparkar", "Murrah Buffalo", "Nili-Ravi Buffalo"] }),
      field("Gender", "qe-gender", { options: ["Female", "Male"] }),
      field("Purchase price (₹) *", "qe-price", { type: "number" }),
      field("Transportation (₹)", "qe-transport", { type: "number" }),
      field("Vet check (₹)", "qe-vetcheck", { type: "number" }),
      field("Payment method", "qe-pay", { options: ["Cash", "Bank Transfer", "UPI", "Cheque", "Card"] }),
    ]),

    sale: async () => JF.Utils.el("div", { class: "form-stack" }, [
      await animalSelect("qe-animal"), dateField(),
      field("Buyer", "qe-buyer", { ph: "optional" }),
      field("Sale price (₹) *", "qe-price", { type: "number" }),
      field("Transportation (₹)", "qe-trans", { type: "number" }),
      field("Commission (₹)", "qe-comm", { type: "number" }),
      field("Payment method", "qe-pay", { options: ["Cash", "Bank Transfer", "UPI", "Cheque", "Card"] }),
      field("Reason", "qe-reason", { ph: "e.g. Cull, transfer" }),
    ]),

    photo: async () => {
      const photo = JF.PhotoUpload.photoField({ inputId: "qe-photo-file", label: "Choose photo", animalId: $v("qe-animal") || undefined });
      const wrap = JF.Utils.el("div", { class: "form-stack" }, [
        await animalSelect("qe-animal"),
        photo,
        field("Kind", "qe-photo-kind", { options: ["Profile", "Identification", "Heat", "Calving", "Health", "Other"] }),
        dateField("qe-date"),
      ]);
      wrap._photoField = photo;
      return wrap;
    },

    /* ---- Heat observation sheet: signs → live evidence meter ---- */
    observe: async () => {
      const SIGNS = [
        "Standing Heat", "Mounting", "Clear Mucus", "Restlessness",
        "Increased Vocalization", "Vulvar Swelling", "Reduced Intake", "Tail Raising",
      ];
      const wrap = JF.Utils.el("div", { class: "form-stack" });
      wrap.appendChild(await animalSelect("qe-animal"));
      wrap.appendChild(JF.Utils.el("div", { class: "grid grid--cols-2" }, [
        field("Date", "qe-date", { type: "date", value: JF.Utils.todayISO() }),
        field("Time", "qe-time", { type: "time", value: new Date().toTimeString().slice(0, 5) }),
      ]));
      const chipBox = JF.Utils.el("div", { class: "chip-row", id: "qe-obs-signs" });
      SIGNS.forEach((s) => {
        chipBox.appendChild(JF.Utils.el("label", { class: "chip chip--toggle", style: { cursor: "pointer" } }, [
          JF.Utils.el("input", { type: "checkbox", class: "qe-obs-sign", value: s, style: { marginRight: "5px" }, onchange: updateMeter }), s,
        ]));
      });
      wrap.appendChild(JF.Utils.el("div", { class: "field" }, [
        JF.Utils.el("label", { class: "field__label" }, "Observed signs"),
        chipBox,
      ]));

      // Live evidence meter
      const meter = JF.Utils.el("div", { class: "live-meter" });
      function updateMeter() {
        const chosen = [...document.querySelectorAll(".qe-obs-sign:checked")].map((c) => c.value);
        let total = 0, standing = false;
        chosen.forEach((s) => {
          const e = JF.ReproIntel.EVIDENCE[s];
          if (!e) return;
          total += e.w;
          if (e.strong) standing = true;
        });
        const pct = Math.round(Math.min(1, total / 1.6) * 100);
        const conf = standing ? "HIGH" : pct >= 45 ? "MEDIUM" : pct > 0 ? "LOW" : "—";
        JF.Utils.clear(meter);
        meter.appendChild(JF.Utils.el("div", { class: "live-meter__bar" }, [
          JF.Utils.el("div", { class: "live-meter__fill", style: { width: `${pct}%` } }),
        ]));
        meter.appendChild(JF.Utils.el("div", { class: "live-meter__caption" },
          `Standing-heat evidence: ${pct}% · ${conf} confidence${standing ? " · window will be tight (24–32h)" : chosen.length ? " · window widened" : ""}`));
      }
      updateMeter();
      wrap.appendChild(JF.Utils.el("div", { class: "field" }, [
        JF.Utils.el("label", { class: "field__label" }, "Evidence strength (live)"),
        meter,
      ]));

      // Optional photo evidence
      const photo = JF.PhotoUpload.photoField({ inputId: "qe-obs-photo", label: "Photo evidence (optional)", label2: null });
      wrap.appendChild(photo);
      wrap._photoField = photo;

      // Voice note capture (best-effort; transcription only on Chrome/Android)
      try {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
          const btn = JF.Utils.el("button", { type: "button", class: "btn btn--ghost btn--sm", style: { marginTop: "4px" } }, "🎤 Speak observation");
          const out = JF.Utils.el("div", { class: "field__hint", style: { marginTop: "4px" } });
          btn.addEventListener("click", () => {
            try {
              const rec = new SR();
              rec.lang = "en-IN"; rec.interimResults = false;
              btn.textContent = "... listening";
              rec.onresult = (e2) => {
                const text = e2.results[0][0].transcript;
                out.textContent = `Heard: "${text}" — tick the matching signs above to confirm.`;
                const lower = text.toLowerCase();
                [...document.querySelectorAll(".qe-obs-sign")].forEach((c) => {
                  const s = c.value.toLowerCase();
                  const hit = s.split(/\s+/).some((word) => word.length > 3 && lower.includes(word));
                  if (hit) { c.checked = true; }
                });
                updateMeter();
                btn.textContent = "🎤 Speak again";
              };
              rec.onerror = () => { btn.textContent = "🎤 Try again"; };
              rec.onend = () => { if (btn.textContent.startsWith("...")) btn.textContent = "🎤 Speak observation"; };
              rec.start();
            } catch (e2) { out.textContent = "Voice capture unavailable here."; }
          });
          wrap.appendChild(JF.Utils.el("div", { class: "field" }, [btn, out]));
        }
      } catch (e) { /* no speech API */ }

      return wrap;
    },

    document: async () => JF.Utils.el("div", { class: "form-stack" }, [
      field("File name *", "qe-docname", { ph: "e.g. purchase-bill-PUR-001.pdf" }),
      field("Category", "qe-doccat", { options: ["Animal", "Veterinary", "Purchase", "Sale", "Invoices", "Certificates", "Other"] }),
      field("Linked animal (optional)", "qe-animal", { ph: "e.g. COW-005" }),
      field("Record reference (optional)", "qe-docref", { ph: "e.g. PUR-001" }),
      field("Notes", "qe-docnotes"),
    ]),

    reminder: async () => JF.Utils.el("div", { class: "form-stack" }, [
      field("Type *", "qe-remtype", { options: ["Heat Expected", "Pregnancy Check", "Treatment Follow-up", "Deworming", "Vaccination", "Expected Calving", "Custom"] }),
      field("Due date", "qe-remdue", { type: "date", value: JF.Utils.todayISO() }),
      field("Animal (optional)", "qe-animal", { ph: "e.g. COW-005" }),
      field("Priority", "qe-rempri", { options: ["High", "Normal", "Low"] }),
      field("Notes", "qe-remnotes"),
    ]),
  };

  const medRow = () => JF.Utils.el("div", { class: "qe-med-row", style: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "6px", marginBottom: "6px" } }, [
    JF.Utils.el("input", { class: "input qe-med-name", placeholder: "Medicine" }),
    JF.Utils.el("input", { class: "input qe-med-dose", placeholder: "Dose" }),
    JF.Utils.el("input", { class: "input qe-med-dur", placeholder: "Duration" }),
  ]);

  /* ---------- Picker + form shell ---------- */
  const openPicker = () => {
    const grid = JF.Utils.el("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "var(--space-3)" } });
    OPTIONS.forEach((o) => {
      grid.appendChild(JF.Utils.el("button", {
        type: "button", class: "card", style: { padding: "var(--space-4)", textAlign: "left", background: "var(--color-bg)", cursor: "pointer" },
        onclick: () => openForm(o.id),
      }, [
        JF.Utils.el("div", { class: "stat-icon", style: { marginBottom: "var(--space-2)" }, html: JF.Utils.svgIcon(o.icon, 20, 20) }),
        JF.Utils.el("div", { style: { fontSize: "var(--fs-sm)", fontWeight: 600 } }, `${o.key} ${o.label}`),
      ]));
    });
    JF.Modal.open({ title: "Quick Entry", size: "lg", body: grid, footer: [
      JF.Utils.el("button", { type: "button", class: "btn btn--ghost", onclick: () => JF.Modal.close() }, "Cancel"),
    ] });
  };

  const openForm = async (id) => {
    const body = await (FORMS[id] || (async () => JF.Utils.el("div", {}, "Form unavailable.")))();
    const saveBtn = JF.Utils.el("button", { type: "button", class: "btn btn--primary" }, "Save Record");
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true; saveBtn.textContent = "Saving...";
      try {
        const res = await (SAVE[id] || (async () => null))(body);
        if (!res) { saveBtn.disabled = false; saveBtn.textContent = "Save Record"; return; }
        JF.Toast.show(`${res.label} saved successfully!`, { type: "success", action: res.id ? { label: "Go to record", href: res.tab ? `#animal/${res.id}/${res.tab}` : (res.id.startsWith?.("C") ? `#animal/${res.id}` : "#reminders"), onClick: () => { JF.Modal.close(); JF.App.navigate(res.tab ? `#animal/${res.id}/${res.tab}` : (res.id.startsWith?.("C") ? `#animal/${res.id}` : "#reminders")); } } : null });
        JF.Modal.close();
      } catch (e) {
        console.error(e);
        JF.Toast.show("Failed to save record.", "danger");
        saveBtn.disabled = false; saveBtn.textContent = "Save Record";
      }
    });
    JF.Modal.open({ title: OPTIONS.find((o) => o.id === id)?.label || id, size: "md", body, footer: [
      JF.Utils.el("button", { type: "button", class: "btn btn--ghost", onclick: openPicker }, "← Back"),
      saveBtn,
    ] });
  };

  const init = () => {
    const btn = document.getElementById("btn-quick-entry");
    if (btn) btn.addEventListener("click", openPicker);
  };

  /**
   * One-tap observe: pre-seeded modal for a single sign (used by animal profile
   * quick chips). Opens the observation form with that sign pre-ticked.
   */
  const openObserve = async (animalId, sign = "Standing Heat") => {
    await openForm("observe");
    await new Promise((r) => setTimeout(r, 120));
    const sel = document.getElementById("qe-animal");
    if (sel) sel.value = animalId;
    const chip = [...document.querySelectorAll(".qe-obs-sign")].find((c) => c.value === sign);
    if (chip) { chip.checked = true; chip.dispatchEvent(new Event("change", { bubbles: true })); }
  };

  return { init, openPicker, openForm, openObserve, OPTIONS };
})();
