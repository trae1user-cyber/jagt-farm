JF.Seed = (function () {
  const photoPrompt = (desc) => JF.Utils.photoURL(desc, "square_hd");

  const today = JF.Utils.today();
  const iso = (d) => JF.Utils.formatDate(d, "yyyy-MM-dd");
  const daysAgo = (n) => iso(JF.Utils.addDays(today, -n));
  const daysFromNow = (n) => iso(JF.Utils.addDays(today, n));

  const indianNames = ["Rani","Ganga","Kaveri","Yamuna","Saraswati","Lakshmi","Parvati","Radha","Meera","Padma",
    "Gulab","Moti","Chand","Heera","Sona","Kali","Gauri","Sharda","Uma","Chhaya","Naina","Rajni","Padmini"];
  const bullNames = ["Bajirao","Rana","Shera","Raja","Veer","Karan","Arjun","Bheem"];
  const breeds = ["HF Cross","Jersey Cross","Sahiwal","Gir","Red Sindhi","Tharparkar","Murrah Buffalo","Nili-Ravi Buffalo","Indigenous Cross"];
  const statuses = ["Lactating","Pregnant","Open","In Heat","Heifer","Calf","Under Treatment","Dry","Sold","Deceased"];
  const statusW = [7, 6, 5, 2, 3, 6, 2, 3, 1, 1];

  const pick = (arr, w) => {
    if (!w) return arr[Math.floor(Math.random() * arr.length)];
    const total = w.reduce((a,b)=>a+b,0);
    let r = Math.random() * total;
    for (let i=0;i<arr.length;i++) { r -= w[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length-1];
  };

  const cows = [];
  const generateAnimals = () => {
    for (let i = 1; i <= 14; i++) {
      const id = `COW-${String(i).padStart(3,"0")}`;
      const name = indianNames[i-1] || `Cow ${i}`;
      const breed = pick(breeds);
      const gender = "Female";
      const dob = JF.Utils.addDays(today, - (365 * (2 + Math.floor(Math.random()*6)) + Math.floor(Math.random()*300)));
      const stat = pick(statuses, statusW);
      const cowPhoto = photoPrompt(`professional farm portrait of ${breed.includes("Buffalo") ? "black buffalo" : "dairy cow"} named ${name}, luxury golden hour lighting in a clean modern barn, editorial photography`);
      cows.push({
        id, AnimalID: id, TagNumber: `T${1000+i}`, Name: name,
        Species: breed.includes("Buffalo") ? "Buffalo" : "Cattle",
        Breed: breed, Gender: gender, DateOfBirth: iso(dob),
        Color: pick(["Black","Brown","White","Black & White","Red","Gray"]),
        IdentificationMarks: pick(["White patch on forehead","Horn notch left","Ear tag 34","Branded JF"]),
        MotherID: i > 3 ? `COW-${String(Math.max(1, i-3)).padStart(3,"0")}` : null,
        FatherID: i > 3 ? `BULL-${String(((i-1) % 4) + 1).padStart(3,"0")}` : null,
        PurchaseDate: i > 6 ? iso(JF.Utils.addDays(dob, 30 + Math.floor(Math.random()*100))) : null,
        PurchasePrice: i > 6 ? 60000 + Math.floor(Math.random()*80000) : null,
        CurrentStatus: stat,
        CurrentGroup: pick(["Main Herd","Hospital Pen","Dry Lot","Maternity","Young Stock",null]),
        CurrentLocation: pick(["Barn A","Barn B","Grazing Field 3","Hospital","Maternity Barn"]),
        PhotoURL: cowPhoto,
        Notes: i % 5 === 0 ? "High performer" : "",
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      });
    }
    // Buffaloes
    for (let i = 1; i <= 3; i++) {
      const id = `BUFF-${String(i).padStart(3,"0")}`;
      cows.push({
        id, AnimalID: id, TagNumber: `TB${i}`, Name: ["Meera","Kali","Chand"][i-1],
        Species: "Buffalo", Breed: "Murrah Buffalo", Gender: "Female",
        DateOfBirth: daysAgo(365*3 + i*80),
        CurrentStatus: pick(["Lactating","Pregnant","Open"]),
        MotherID: null, FatherID: null, PurchaseDate: daysAgo(700+i*20),
        PurchasePrice: 100000 + i*15000, PhotoURL: photoPrompt("murrah buffalo cow portrait in rural indian farm afternoon light"),
        CurrentGroup: "Main Herd", CurrentLocation: "Barn A",
      });
    }
    // Bulls
    for (let i = 1; i <= 4; i++) {
      const id = `BULL-${String(i).padStart(3,"0")}`;
      cows.push({
        id, AnimalID: id, TagNumber: `BL${i}`, Name: bullNames[i-1],
        Species: "Cattle", Breed: pick(["HF","Sahiwal","Gir"]), Gender: "Male",
        DateOfBirth: daysAgo(365*4 + i*60), CurrentStatus: "Lactating".replace("Lactating","Active"),
        MotherID: null, FatherID: null, PurchaseDate: daysAgo(900+i*10),
        PurchasePrice: 120000 + i*35000, PhotoURL: photoPrompt(`pedigree bull ${bullNames[i-1]} in a stud farm, editorial portrait`),
        CurrentGroup: "Breeding", CurrentLocation: "Barn C",
      });
    }
    // Calves - CALF-2026-001 DOB must match its calving record CALV-001 (5 days ago)
    for (let i = 1; i <= 2; i++) {
      const id = `CALF-2026-${String(i).padStart(3,"0")}`;
      const dob = i === 1 ? daysAgo(5) : daysAgo(100);
      cows.push({
        id, AnimalID: id, TagNumber: `TC${i}`, Name: pick(["Chhota Raj","Gulab Junior","Baby Rani"]),
        Species: "Cattle", Breed: "HF Cross", Gender: i % 2 === 0 ? "Female" : "Male",
        DateOfBirth: dob, CurrentStatus: "Calf",
        MotherID: `COW-${String(i + 3).padStart(3,"0")}`, FatherID: `BULL-${String(((i-1) % 4) + 1).padStart(3,"0")}`,
        PhotoURL: photoPrompt("newborn calf portrait in straw covered maternity pen, warm sunlight, professional"),
        CurrentGroup: "Maternity", CurrentLocation: "Maternity Barn",
      });
    }
    return cows;
  };

  const heats = [];
  const generateHeats = () => {
    // COW-005 needs 5 heat records giving 4 intervals of 21,23,20,22 days (avg 21.5).
    // First heat sits 112 days before today so the expected next heat (last + 21.5) lands ~10 days ahead.
    const baseDay = 112; // heat 1 was 112 days ago, others going forward
    let cursor = JF.Utils.addDays(today, -baseDay);
    const intervals = [21, 23, 20, 22];
    for (let i = 0; i <= intervals.length; i++) {
      if (i > 0) cursor = JF.Utils.addDays(cursor, intervals[i-1]);
      heats.push({
        id: `HEAT-00${i+1}`, HeatRecordID: `HEAT-00${i+1}`,
        AnimalID: "COW-005", HeatDate: iso(cursor), HeatTime: "08:30",
        DetectionMethod: pick(["Visual","Activity Monitor","Teaser Bull","Chin Ball"]),
        HeatIntensity: pick(["Mild","Moderate","Strong","Standing"]),
        Symptoms: ["Standing Heat","Mounting","Mucus Discharge","Restlessness"].slice(0, 2 + (i%2)),
        PhotoURL: photoPrompt("heat detection observation of dairy cow in farm alley, veterinary records context"),
        Notes: "", CreatedAt: new Date().toISOString(),
      });
    }
    // Additional heats for other cows (COW-005 already has its exact 5-record history)
    for (let i = 0; i < 14; i++) {
      const cow = cows[i];
      if (!cow || cow.Gender !== "Female" || cow.CurrentStatus === "Calf" || cow.AnimalID === "COW-005") continue;
      const day = 3 + Math.floor(Math.random()*60);
      heats.push({
        id: `HEAT-1${i}`, HeatRecordID: `HEAT-1${i}`,
        AnimalID: cow.AnimalID, HeatDate: daysAgo(day), HeatTime: `${6 + Math.floor(Math.random()*6)}:${10 + Math.floor(Math.random()*50)}`,
        DetectionMethod: "Visual", HeatIntensity: "Moderate",
        Symptoms: ["Mounting","Mucus Discharge"], Notes: "",
      });
    }
    return heats;
  };

  const aivecs = [];
  const pregnancies = [];
  const calvings = [];
  const generateRepro = () => {
    const aiCosts = [350, 400, 500, 450, 600];
    // 2 AIs for COW-005: one 280 days ago → preg positive → calving; one more recent 30d ago → preg check
    aivecs.push({
      id: "AI-001", InseminationID: "AI-001", AnimalID: "COW-005",
      HeatRecordID: "HEAT-001", Date: daysAgo(280), Time: "09:00",
      Method: "Artificial Insemination", SemenBullID: "BULL-001", Technician: "Dr. Sharma",
      Cost: aiCosts[0], Notes: "", CreatedAt: new Date().toISOString(),
    });
    pregnancies.push({
      id: "PREG-001", PregnancyCheckID: "PREG-001", AnimalID: "COW-005",
      InseminationID: "AI-001", Date: daysAgo(250), Method: "Rectal Palpation",
      Result: "Positive", Veterinarian: "Dr. Sharma", Notes: "Single calf",
    });
    calvings.push({
      id: "CALV-001", CalvingID: "CALV-001", AnimalID: "COW-005",
      Date: daysAgo(5), Time: "02:15",
      CalvingType: "Normal", AssistanceRequired: false, Complications: "None",
      CalfID: "CALF-2026-001", CalfGender: "Male", CalfWeight: 34, CalfHealth: "Healthy",
      Veterinarian: "Dr. Sharma",
      PhotoURL: photoPrompt("newborn calf with mother in maternity barn straw bedding, editorial lighting"),
      DocumentURL: "", Notes: "Easy calving, cow and calf doing well",
    });
    // Recent AI + pregnancy check due for COW-005 again
    aivecs.push({
      id: "AI-002", InseminationID: "AI-002", AnimalID: "COW-005",
      HeatRecordID: "HEAT-004", Date: daysAgo(30), Time: "10:30",
      Method: "Artificial Insemination", SemenBullID: "BULL-003", Technician: "Dr. Iyer",
      Cost: aiCosts[1], Notes: "",
    });
    // 5 more AIs
    for (let i = 1; i <= 5; i++) {
      const cow = cows[2 + i];
      if (!cow) continue;
      const day = 5 + i * 12;
      aivecs.push({
        id: `AI-10${i}`, InseminationID: `AI-10${i}`, AnimalID: cow.AnimalID,
        HeatRecordID: null, Date: daysAgo(day), Time: "09:30",
        Method: "Artificial Insemination", SemenBullID: `BULL-00${((i-1)%4)+1}`,
        Technician: pick(["Dr. Sharma","Dr. Iyer","Dr. Patel","Senior Tech"]),
        Cost: aiCosts[i%aiCosts.length], Notes: "",
      });
      if (i % 2 === 0) {
        pregnancies.push({
          id: `PREG-10${i}`, PregnancyCheckID: `PREG-10${i}`, AnimalID: cow.AnimalID,
          InseminationID: `AI-10${i}`, Date: daysAgo(Math.max(1, day - 30)),
          Method: i%3 ? "Rectal Palpation" : "Ultrasound",
          Result: i%4 ? "Positive" : "Negative", Veterinarian: "Dr. Sharma",
          Notes: "",
        });
      }
    }
    return { aivecs, pregnancies, calvings };
  };

  const healths = [];
  const dewormings = [];
  const vaccinations = [];
  const generateHealth = () => {
    const meds = ["Ivermectin","Albendazole","Oxytetracycline","Penicillin","Sulphamethazine","Multivitamin","Calcium Borogluconate"];
    for (let i = 0; i < 12; i++) {
      const cow = cows[i % cows.length];
      const cost = 400 + Math.floor(Math.random()*1800);
      const daysBack = 2 + Math.floor(Math.random()*90);
      healths.push({
        id: `HEA-1${i}`, HealthRecordID: `HEA-1${i}`,
        AnimalID: cow.AnimalID, Date: daysAgo(daysBack),
        Problem: pick(["Mild Fever","Mastitis suspect","Lameness","Digestive upset","Respiratory","Eye infection"]),
        Symptoms: ["Reduced appetite","Lethargy"].slice(0, i%2+1),
        Diagnosis: pick(["Bacterial infection","Parasitic","Nutritional","Viral","Unknown"]),
        Treatment: pick(["Antibiotic course","Deworming re-dose","Anti-inflammatory","Fluid therapy"]),
        Medicine: meds[i%meds.length], Dose: `${30 + i*5} ml`,
        Veterinarian: pick(["Dr. Sharma","Dr. Iyer","Dr. Patel"]),
        TreatmentCost: cost,
        FollowUpDate: daysBack >= 3 && i % 3 === 0 ? daysFromNow(2 + (i%4)) : null,
        RecoveryStatus: daysBack > 14 ? "Recovered" : (i % 4 === 0 ? "Under Treatment" : "Follow-up Required"),
        Photo: i%2 ? photoPrompt("veterinary treatment scene of cow in farm hospital pen") : null,
        Prescription: "", Notes: "", CreatedAt: new Date().toISOString(),
      });
    }
    // Dewormings — COW-005 last 25 Aug + 11 more
    dewormings.push({
      id: "DEW-001", DewormingID: "DEW-001", AnimalID: "COW-005",
      Date: daysAgo(14), Medicine: "Albendazole", Dose: "60 ml", Weight: 520,
      Veterinarian: "Dr. Iyer", Cost: 280,
      NextDueDate: daysFromNow(76), // 90d interval
      Notes: "",
    });
    for (let i = 0; i < 11; i++) {
      const cow = cows[i % cows.length];
      const last = 20 + Math.floor(Math.random()*80);
      dewormings.push({
        id: `DEW-1${i}`, DewormingID: `DEW-1${i}`, AnimalID: cow.AnimalID,
        Date: daysAgo(last), Medicine: meds[i%2], Dose: `${30 + i*3} ml`, Weight: 420 + i*10,
        Veterinarian: pick(["Dr. Sharma","Dr. Iyer"]), Cost: 200 + Math.floor(Math.random()*400),
        NextDueDate: daysFromNow(90 - last < 0 ? 10 + i*5 : 90 - last),
        Notes: "",
      });
    }
    // Vaccinations
    const vax = ["FMD (Foot & Mouth Disease)","HS (Haemorrhagic Septicaemia)","BQ (Black Quarter)","Anthrax","Brucellosis","Theileriosis"];
    for (let i = 0; i < 14; i++) {
      const cow = cows[i % cows.length];
      const last = 10 + Math.floor(Math.random()*180);
      vaccinations.push({
        id: `VAC-1${i}`, VaccinationID: `VAC-1${i}`, AnimalID: cow.AnimalID,
        Vaccine: vax[i%vax.length], DateGiven: daysAgo(last),
        NextDueDate: daysFromNow(365 - last < 0 ? 30 + i*10 : 365 - last),
        BatchNumber: `B${2024}${String(i+1).padStart(3,"0")}`,
        Veterinarian: pick(["Dr. Sharma","Dr. Iyer","Dr. Patel"]),
        Cost: 300 + Math.floor(Math.random()*600), Notes: "",
      });
    }
    return { healths, dewormings, vaccinations };
  };

  const deaths = [];
  const purchases = [];
  const sales = [];
  const generateTransactions = () => {
    deaths.push({
      id: "DEATH-001", AnimalID: cows[11]?.AnimalID || "COW-012",
      Date: daysAgo(21), Time: "22:45", Cause: "Severe bloat",
      Veterinarian: "Dr. Patel", EstimatedValue: 85000,
      Photo: photoPrompt("sad veterinary documentation scene on dairy farm with empty stall"),
      Document: "", Notes: "Sudden onset, no previous history",
    });
    purchases.push({
      id: "PUR-001", PurchaseID: "PUR-001",
      Date: daysAgo(180), Seller: "Ramesh Kumar Dairy Farm",
      AnimalID: "COW-001", Breed: "HF Cross", Species: "Cattle", Gender: "Female",
      Age: 3, Weight: 540,
      PurchasePrice: 85000, TransportationCost: 1500, VeterinaryCheckCost: 800, OtherCost: 0,
      TotalCost: 87300, PaymentMethod: "Bank Transfer", Document: "", Photo: "", Notes: "",
    });
    sales.push({
      id: "SALE-001", SaleID: "SALE-001",
      Date: daysAgo(45), AnimalID: cows[9]?.AnimalID || "COW-010",
      Buyer: "Aarav Dairy Ventures", SalePrice: 92000,
      Transportation: 2000, Commission: 2500, OtherCost: 0,
      NetSale: 87500, PaymentMethod: "Cheque",
      Reason: "Low productivity — culled", Document: "", Photo: "", Notes: "",
    });
    return { deaths, purchases, sales };
  };

  // Milk income: two collections a day (morning/evening) for the last ~5 months,
  // mirrored into the journal like every other entry. Demo data only — a fresh
  // farm starts with zero rows and everything on Finance pages computes from
  // whatever the user actually records.
  const milkSales = [];
  const generateMilkSales = () => {
    let n = 0;
    for (let back = 150; back >= 0; back -= 1) {
      const d = daysAgo(back);
      ["Morning", "Evening"].forEach((shift, si) => {
        if (back > 30 && Math.random() < 0.06) return; // occasional missed collection
        n++;
        const litres = Math.round((shift === "Morning" ? 20 + Math.random() * 9 : 15 + Math.random() * 7) * 10) / 10;
        const rate = Math.round((40 + (150 - back) * 0.012 + Math.random() * 1.6) * 10) / 10;
        const amount = Math.round(litres * rate * 100) / 100;
        const pm = pick(["UPI", "UPI", "Bank Transfer", "Cash"]);
        const id = `MILK-${String(n).padStart(4, "0")}`;
        milkSales.push({
          id, MilkSaleID: id, Date: d, Time: shift === "Morning" ? "06:30" : "18:10",
          Shift: shift, Buyer: pick(["Verka Dairy", "Local Vendor", "Punjab Dairy Co-op"]),
          QuantityLitres: litres, FatPercent: Math.round((5.8 + Math.random() * 1.2) * 10) / 10,
          RatePerLitre: rate, Amount: amount, PaymentMethod: pm,
          PaymentStatus: back < 4 && Math.random() < 0.25 ? "Pending" : "Received",
          AnimalNotes: "", Document: "", Notes: "", CreatedAt: new Date().toISOString(),
        });
      });
    }
    return milkSales;
  };
  const milkJournal = () => milkSales.map((m, i) => ({
    id: `JNL-MILK-${i + 1}`, JournalID: `JNL-MILK-${i + 1}`,
    CreatedBy: "system", CreatedAt: new Date().toISOString(),
    Date: m.Date, ReferenceID: m.id, TransactionType: "milk-sale",
    Description: `Milk sale · ${m.Shift} · ${m.QuantityLitres}L · ${m.Buyer}`,
    DebitAccount: m.PaymentMethod === "Cash" ? "Cash" : "Bank",
    CreditAccount: "Milk Sales", Amount: m.Amount,
    AnimalID: null, PaymentMethod: m.PaymentMethod,
  }));

  const expenses = [];
  const journal = [];
  const CATEGORY_ACCOUNT = {
    "Veterinary": "Veterinary Expense", "Medicine": "Medicine Expense", "Vaccination": "Vaccination Expense",
    "Deworming": "Deworming Expense", "Labor": "Labor Expense", "Electricity": "Electricity Expense",
    "Water": "Water Expense", "Fuel": "Fuel Expense", "Transportation": "Transportation Expense",
    "Maintenance": "Maintenance Expense", "Equipment": "Equipment Expense", "Other Farm Expense": "Other Farm Expense",
  };
  const crAccountFor = (pm) =>
    pm === "Bank Transfer" || pm === "Cheque" || pm === "Card" ? "Bank" : "Cash";

  const generateFinance = () => {
    const cats = Object.keys(CATEGORY_ACCOUNT);
    const vendors = ["Sharma Vet Pharma","State Electricity Board","Reliance Petroleum","Daily Labour Group","Green Fields Equipment","Local Water Supply","Farmers Co-op"];
    const mkEntry = (id, e) => journal.push({
      CreatedBy: "system", CreatedAt: new Date().toISOString(),
      AnimalID: null, PaymentMethod: "Cash", ...e, id, JournalID: id,
    });

    // 22 operational expenses, each posted to the journal (Dr category / Cr Cash|Bank)
    for (let i = 0; i < 22; i++) {
      const d = daysAgo(Math.floor(Math.random()*60));
      const cat = cats[i % cats.length];
      const amt = 500 + Math.floor(Math.random()*9000);
      const ven = vendors[i % vendors.length];
      const pm = pick(["Cash","Bank Transfer","UPI","Cheque"]);
      const animal = i % 3 === 0 ? cows[i % cows.length]?.AnimalID : null;
      expenses.push({
        id: `EXP-1${i}`, ExpenseID: `EXP-1${i}`,
        Date: d, Category: cat, Description: `${cat} expense`,
        Amount: amt, PaymentMethod: pm,
        Vendor: ven, AnimalID: animal,
        Reference: "", Document: "", Notes: "",
      });
      mkEntry(`JNL-EX-${i+1}`, {
        Date: d, ReferenceID: `EXP-1${i}`, TransactionType: "expense",
        Description: `${cat} - ${ven}`,
        DebitAccount: CATEGORY_ACCOUNT[cat], CreditAccount: crAccountFor(pm),
        Amount: amt, AnimalID: animal, PaymentMethod: pm,
      });
    }

    // Opening entries (balanced by capital) + opening balances as settings
    mkEntry("JNL-OP-1", { Date: daysAgo(365), ReferenceID: "OPENING", TransactionType: "Opening",
      Description: "Opening cash capital", DebitAccount: "Cash", CreditAccount: "Owner Capital",
      Amount: 50000, PaymentMethod: "Cash" });
    mkEntry("JNL-OP-2", { Date: daysAgo(365), ReferenceID: "OPENING", TransactionType: "Opening",
      Description: "Opening bank capital", DebitAccount: "Bank", CreditAccount: "Owner Capital",
      Amount: 250000, PaymentMethod: "Bank Transfer" });
    mkEntry("JNL-OP-3", { Date: daysAgo(365), ReferenceID: "OPENING", TransactionType: "Opening",
      Description: "Opening livestock herd valuation", DebitAccount: "Livestock", CreditAccount: "Owner Capital",
      Amount: 520000, PaymentMethod: "Bank Transfer" });
    settings.push(
      { id: "sF", key: "OpeningCashBalance", value: 50000 },
      { id: "sG", key: "OpeningBankBalance", value: 250000 },
    );

    // Operational seed records, each mirrored into the journal (every entry balanced)
    mkEntry("JNL-TR-1", { Date: daysAgo(40), ReferenceID: "HEA-100", TransactionType: "health",
      Description: "Veterinary treatment - COW-005", DebitAccount: "Veterinary Expense", CreditAccount: "Cash",
      Amount: 1500, AnimalID: "COW-005" });
    mkEntry("JNL-VC-1", { Date: daysAgo(35), ReferenceID: "VAC-100", TransactionType: "vaccination",
      Description: "Vaccination - COW-006", DebitAccount: "Vaccination Expense", CreditAccount: "Cash",
      Amount: 1200, AnimalID: "COW-006" });
    mkEntry("JNL-DW-1", { Date: daysAgo(30), ReferenceID: "DEW-100", TransactionType: "deworming",
      Description: "Deworming - COW-005", DebitAccount: "Deworming Expense", CreditAccount: "Cash",
      Amount: 800, AnimalID: "COW-005" });
    // AI costs -> Veterinary Expense
    [["AI-001", 350, 280], ["AI-002", 400, 30], ["AI-101", 500, 17], ["AI-102", 450, 29],
     ["AI-103", 600, 41], ["AI-104", 350, 53], ["AI-105", 400, 65]].forEach(([ref, amt, back], i) => {
      mkEntry(`JNL-AI-${i+1}`, { Date: daysAgo(back), ReferenceID: ref, TransactionType: "insemination",
        Description: `Insemination service - ${ref}`, DebitAccount: "Veterinary Expense", CreditAccount: "Cash",
        Amount: amt, AnimalID: ref === "AI-001" || ref === "AI-002" ? "COW-005" : null });
    });
    // Sale: Dr Bank (cheque) / Cr Cattle Sales (net proceeds)
    mkEntry("JNL-SL-1", { Date: daysAgo(45), ReferenceID: "SALE-001", TransactionType: "sale",
      Description: "Cattle sale - Aarav Dairy Ventures", DebitAccount: "Bank", CreditAccount: "Cattle Sales",
      Amount: 87500, AnimalID: cows[9]?.AnimalID || "COW-010", PaymentMethod: "Cheque" });
    // Purchase: Dr Livestock / Cr Bank
    mkEntry("JNL-PU-1", { Date: daysAgo(180), ReferenceID: "PUR-001", TransactionType: "purchase",
      Description: "Cattle purchase - Ramesh Kumar Dairy Farm", DebitAccount: "Livestock", CreditAccount: "Bank",
      Amount: 87300, AnimalID: "COW-001", PaymentMethod: "Bank Transfer" });

    return { expenses, journal };
  };

  const reminders = [];
  const generateReminders = () => {
    // 2 Due Today, 3 Upcoming (1-7d), 2 Overdue
    reminders.push(
      { id: "RM-1", ReminderID: "RM-1", AnimalID: "COW-005",
        ReminderType: "Pregnancy Check", ReferenceID: "AI-002",
        DueDate: JF.Utils.todayISO(), ReminderDate: JF.Utils.todayISO(),
        Priority: "High", Status: "Due Today", Notes: "Day 30 post-AI check",
      },
      { id: "RM-2", ReminderID: "RM-2", AnimalID: "COW-002",
        ReminderType: "Treatment Follow-up", ReferenceID: "HEA-103",
        DueDate: JF.Utils.todayISO(), ReminderDate: JF.Utils.todayISO(),
        Priority: "High", Status: "Due Today", Notes: "Mastitis follow-up",
      },
      { id: "RM-3", ReminderID: "RM-3", AnimalID: "COW-012",
        ReminderType: "Deworming", ReferenceID: "DEW-105",
        DueDate: daysFromNow(3), ReminderDate: daysFromNow(2),
        Priority: "Normal", Status: "Upcoming", Notes: "",
      },
      { id: "RM-4", ReminderID: "RM-4", AnimalID: "BUFF-001",
        ReminderType: "Heat Expected", ReferenceID: "HEAT-110",
        DueDate: daysFromNow(5), ReminderDate: daysFromNow(2),
        Priority: "High", Status: "Upcoming", Notes: "",
      },
      { id: "RM-5", ReminderID: "RM-5", AnimalID: "COW-007",
        ReminderType: "Vaccination", ReferenceID: "VAC-109",
        DueDate: daysFromNow(7), ReminderDate: daysFromNow(4),
        Priority: "Normal", Status: "Upcoming", Notes: "FMD booster",
      },
      { id: "RM-6", ReminderID: "RM-6", AnimalID: "COW-009",
        ReminderType: "Expected Calving", ReferenceID: "AI-102",
        DueDate: daysFromNow(-4), ReminderDate: daysFromNow(-4),
        Priority: "High", Status: "Overdue", Notes: "Expected 4 days ago",
      },
      { id: "RM-7", ReminderID: "RM-7", AnimalID: "COW-013",
        ReminderType: "Treatment Follow-up", ReferenceID: "HEA-107",
        DueDate: daysFromNow(-2), ReminderDate: daysFromNow(-2),
        Priority: "High", Status: "Overdue", Notes: "",
      },
    );
    return reminders;
  };

  const files = [];
  const groups = [];
  const generateFiles = () => {
    const doc = (id, name, cat, animal, recType, recId, notes) => files.push({
      id, FileID: id, FileName: name, Category: cat, AnimalID: animal,
      RecordType: recType, RecordID: recId, DriveURL: null, UploadDate: daysAgo(30),
      Notes: notes || "",
    });
    doc("FILE-001", "purchase-bill-PUR-001.pdf", "Purchase", "COW-001", "purchase", "PUR-001", "Original bill from Ramesh Kumar Dairy Farm");
    doc("FILE-002", "sale-invoice-SALE-001.pdf", "Sale", "COW-010", "sale", "SALE-001", "Sale invoice - Aarav Dairy Ventures");
    doc("FILE-003", "vet-prescription-HEA-100.pdf", "Veterinary", "COW-005", "health", "HEA-100", "Dr. Sharma - antibiotic course");
    doc("FILE-004", "vaccination-cert-VAC-100.pdf", "Certificates", "COW-006", "vaccination", "VAC-100", "FMD vaccination certificate");
    doc("FILE-005", "insurance-policy-2026.pdf", "Other", null, null, null, "Herd insurance policy");
    doc("FILE-006", "electricity-bill-aug.pdf", "Invoices", null, "expense", null, "");
    doc("FILE-007", "pedigree-certificate-COW-005.pdf", "Animal", "COW-005", "animal", "COW-005", "Breed registration papers");
    doc("FILE-008", "lab-report-HEA-103.pdf", "Veterinary", "COW-002", "health", "HEA-103", "");
    return files;
  };
  const settings = [
    { id: "s1", key: "ExpectedCycleLength",    value: 21 },
    { id: "s2", key: "MinimumCycleLength",     value: 18 },
    { id: "s3", key: "MaximumCycleLength",     value: 24 },
    { id: "s4", key: "ReminderDaysBefore",     value: 3 },
    { id: "s5", key: "GestationDays",          value: 283 },
    { id: "s6", key: "AIPregnancyCheckDays",   value: 30 },
    { id: "s7", key: "CalvingAlertDays",       value: [90, 60, 30, 14, 7, 1] },
    { id: "s8", key: "DewormingIntervalDays",  value: 90 },
    { id: "s9", key: "DewormingReminderBefore", value: 7 },
    { id: "sA", key: "VaccinationReminderBefore", value: 7 },
    { id: "sB", key: "CurrencySymbol",         value: "₹" },
    { id: "sC", key: "FarmName",               value: "Jagt Dairy Farm" },
    { id: "sD", key: "DateFormat",             value: "dd MMM yyyy" },
    { id: "sE", key: "ChartOfAccounts",        value: null },
  ];

  const run = async ({ force = false } = {}) => {
    if (!force) {
      const existing = await JF.Store.animals.list();
      if (existing && existing.length >= 5) return false;
    }
    const animals = generateAnimals();
    const h = generateHeats();
    const { aivecs, pregnancies, calvings } = generateRepro();
    const { healths, dewormings, vaccinations } = generateHealth();
    const { deaths, purchases, sales } = generateTransactions();
    const milk = generateMilkSales();
    const { expenses, journal } = generateFinance();
    journal.push(...milkJournal());
    const reminders = generateReminders();
    generateFiles();
    // Reproductive-status consistency: any animal whose latest pregnancy check is
    // Positive is Pregnant (feeds the profile countdown card and dashboard tiles).
    const posPregIds = new Set(pregnancies.filter((p) => p.Result === "Positive").map((p) => p.AnimalID));
    animals.forEach((a) => { if (posPregIds.has(a.AnimalID)) a.CurrentStatus = "Pregnant"; });

    await JF.Store.clearAll();
    // Suppress cascade side effects while bulk-seeding: reminders/journal entries are
    // pre-baked in the seed itself and must not be duplicated by the cascade engine.
    if (JF.Cascade?.suspend) JF.Cascade.suspend();
    const writes = [
      ["animals", animals], ["heat", h], ["insemination", aivecs],
      ["pregnancy", pregnancies], ["calving", calvings], ["health", healths],
      ["deworming", dewormings], ["vaccination", vaccinations],
      ["death", deaths], ["purchases", purchases], ["sales", sales],
      ["milkSales", milk], ["expenses", expenses], ["journal", journal], ["reminders", reminders],
      ["files", files], ["groups", groups], ["settings", settings],
    ];
    for (const [entity, list] of writes) {
      for (const r of list) {
        try {
          const id = r.id || r[`${entity.slice(0,1).toUpperCase()}${entity.slice(1)}ID`] || r.AnimalID;
          if (id) r.id = id;
          const storeKey = entity === "death" ? "death" : entity === "settings" ? "settingsEntity" : entity;
          await JF.Store[storeKey].create(r);
        } catch (e) {
          console.warn(`Seed [${entity}] create failed:`, r, e);
        }
      }
    }
    // Manually ensure Sold/Deceased statuses are set per sale/death records
    for (const s of sales) { if (s.AnimalID) try { await JF.Store.animals.update(s.AnimalID, { CurrentStatus: "Sold" }); } catch (e) {} }
    for (const d of deaths) { if (d.AnimalID) try { await JF.Store.animals.update(d.AnimalID, { CurrentStatus: "Deceased" }); } catch (e) {} }
    if (JF.Cascade?.resume) JF.Cascade.resume();
    return true;
  };

  return { run };
})();
