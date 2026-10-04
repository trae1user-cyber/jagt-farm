window.JF = window.JF || {};

/**
 * RuleBook - the default rule engine configuration (the "factory" rulebook).
 *
 * These rows are what gets installed into the farm database (MongoDB collections
 *   Rules | Rule_Parameters | Rule_Overrides
 * by Settings > Rules > "Install default rulebook" (server action `seedRules`).
 * Once installed, the stored rulebook is the source of truth: change an interval, disable a
 * rule or override a parameter for one animal there and the website follows it
 * without any code change. This file is only the fallback used when the rulebook
 * rows are empty (offline / first run) and the seed payload.
 *
 * Column layout matches the farm's rulebook spec, plus ParamID which links a rule
 * to the parameter that overrides its DefaultValue.
 *
 * Layering (most specific wins):
 *   Rule.DefaultValue  <  Rule_Parameters.Value  <  Rule_Overrides (per animal)
 *
 * Biological values are configurable defaults, not medical instructions: every
 * rule carries SourceType/Source and a VetOverride flag, and the engine always
 * labels its output as FACT (recorded), CALCULATION (estimated) or REMINDER.
 * Guideline references: estrous cycle ~21 days (18-24), gestation ~283 days,
 * dry period ~50-60 days, disbudding before 8 weeks, NDDB vaccination ages.
 */
JF.RuleBook = (function () {

  const RULES_COLUMNS = [
    "RuleID", "Active", "Category", "RuleName", "AppliesTo", "TriggerEvent", "Condition",
    "StartAfter", "EndAfter", "Interval", "ReminderBefore", "ActionType", "Action",
    "Priority", "DataRequired", "DefaultValue", "Unit", "ParamID", "SourceType", "Source",
    "Configurable", "VetOverride", "Notes",
  ];
  const PARAM_COLUMNS = ["ParameterID", "Parameter", "Value", "Unit", "Active", "Notes"];
  const OVERRIDE_COLUMNS = [
    "OverrideID", "RuleID", "AnimalID", "Value", "Unit", "StartDate", "EndDate",
    "Reason", "ApprovedBy", "Active",
  ];

  /** Compact row builder so the rulebook below stays readable. */
  const r = (RuleID, Category, RuleName, AppliesTo, TriggerEvent, StartAfter, Interval, ReminderBefore,
             ActionType, Action, Priority, o = {}) => ({
    RuleID, Active: true, Category, RuleName, AppliesTo, TriggerEvent,
    Condition: o.cond || "",
    StartAfter, EndAfter: o.end ?? "",
    Interval, ReminderBefore,
    ActionType, Action, Priority,
    DataRequired: o.data || "",
    DefaultValue: StartAfter,
    Unit: o.unit || "Days",
    ParamID: o.param || "",
    SourceType: o.source || "FarmProtocol",
    Source: o.ref || "Farm protocol",
    Configurable: true,
    VetOverride: o.vet !== false,
    Notes: o.notes || "",
  });

  /** Parameterised rule: the value always comes from Rule_Parameters. */
  const p = (RuleID, Category, RuleName, AppliesTo, TriggerEvent, ParamID, ReminderBefore,
             ActionType, Action, Priority, o = {}) => r(RuleID, Category, RuleName, AppliesTo,
    TriggerEvent, o.start != null ? o.start : 0, o.interval || 0, ReminderBefore, ActionType, Action, Priority,
    { ...o, param: ParamID, unit: o.unit || "Days", source: o.source || "Guideline" });

  /* ------------------------------------------------------------------ */
  /* Rule_Parameters                                                     */
  /* ------------------------------------------------------------------ */
  const PARAMS = [
    ["PARAM-001", "Estrous minimum", 18, "Days", true, "Bovine cycle lower bound (guideline 18-24 days)"],
    ["PARAM-002", "Estrous average", 21, "Days", true, "Next-heat calculation base"],
    ["PARAM-003", "Estrous maximum", 24, "Days", true, "Upper bound of the expected heat window"],
    ["PARAM-004", "Gestation", 283, "Days", true, "Expected calving = AI/positive pregnancy + this"],
    ["PARAM-005", "Dry period minimum", 40, "Days", true, "Below this the dry period is flagged short"],
    ["PARAM-006", "Dry period target", 50, "Days", true, "When dry-off should happen before calving"],
    ["PARAM-007", "Dry period maximum", 60, "Days", true, "Above this the dry period is flagged long"],
    ["PARAM-008", "Deworming interval", 90, "Days", true, "Farm protocol: deworming review interval"],
    ["PARAM-009", "Deworming reminder lead", 7, "Days", true, "How early the deworming review appears"],
    ["PARAM-010", "Disbudding review age", 7, "Age", true, "Calf age when disbudding is reviewed"],
    ["PARAM-011", "Disbudding limit age", 56, "Age", true, "Review before 8 weeks; later = veterinary procedure"],
    ["PARAM-012", "FMD first dose age", 120, "Age", true, "NDDB: FMD from ~4 months"],
    ["PARAM-013", "FMD booster interval", 30, "Days", true, "Booster one month after the first dose"],
    ["PARAM-014", "FMD revaccination interval", 180, "Days", true, "Six-monthly thereafter"],
    ["PARAM-015", "Brucellosis minimum age", 120, "Age", true, "Female calves 4-8 months, once in a lifetime"],
    ["PARAM-016", "Brucellosis maximum age", 240, "Age", true, "Upper age limit for brucellosis vaccination"],
    ["PARAM-017", "HS first dose age", 180, "Age", true, "NDDB: HS from ~6 months, annual in endemic areas"],
    ["PARAM-018", "BQ first dose age", 180, "Age", true, "NDDB: BQ from ~6 months, annual in endemic areas"],
    ["PARAM-019", "HS/BQ revaccination interval", 365, "Days", true, "Annual where endemic"],
    ["PARAM-020", "Theileriosis age", 90, "Age", true, "Only where the disease is relevant - vet decides"],
    ["PARAM-021", "Anthrax first dose age", 120, "Age", true, "Annual in endemic areas only"],
    ["PARAM-022", "Vaccination reminder lead", 14, "Days", true, "How early vaccine reminders appear"],
    ["PARAM-023", "Pregnancy check after AI", 30, "Days", true, "Configurable vet protocol"],
    ["PARAM-024", "Pregnancy check lead", 3, "Days", true, "Reminder lead for the pregnancy check"],
    ["PARAM-025", "Calving alert offsets", "90,60,30,14,7,1", "Days", true, "Comma-separated days before expected calving"],
    ["PARAM-026", "Colostrum window", 6, "Hours", true, "Time-sensitive newborn task"],
    ["PARAM-027", "Calf first dewormer age", 14, "Age", true, "Calf parasite review"],
    ["PARAM-028", "Calf second dewormer age", 45, "Age", true, "Second calf dewormer review"],
    ["PARAM-029", "Calf care reminder lead", 7, "Days", true, "Lead time for calf care tasks"],
    ["PARAM-030", "Weaning review age", 60, "Age", true, "Weaning readiness review"],
    ["PARAM-031", "Growth review interval", 30, "Days", true, "Repeat growth/weight review"],
    ["PARAM-032", "Heifer breeding review age", 450, "Age", true, "Breeding-readiness review (age OR weight protocol)"],
    ["PARAM-033", "Heifer delayed breeding age", 540, "Age", true, "Flag if still not bred"],
    ["PARAM-034", "First calving target age", 660, "Age", true, "~22 months farm target"],
    ["PARAM-035", "Quarantine period", 30, "Days", true, "Purchased animals, farm configurable"],
    ["PARAM-036", "Post-calving health check", 3, "Days", true, "Days after calving"],
    ["PARAM-037", "Post-calving repro review", 45, "Days", true, "Postpartum reproductive review"],
    ["PARAM-038", "Service period review", 90, "Days", true, "Flag cows not re-bred by then"],
    ["PARAM-039", "Dry-off review lead", 7, "Days", true, "Remind this early before the dry-off date"],
    ["PARAM-040", "Animal photo reminder", 7, "Days", true, "Days allowed to add an identification photo"],
    ["PARAM-041", "Withdrawal default", 0, "Days", true, "0 = must be taken from product label / vet"],
    ["PARAM-042", "Heat reminder lead", 2, "Days", true, "Reminder lead for expected heat"],
  ].map(([ParameterID, Parameter, Value, Unit, Active, Notes]) => ({ ParameterID, Parameter, Value, Unit, Active, Notes }));

  /* ------------------------------------------------------------------ */
  /* Rules                                                               */
  /* ------------------------------------------------------------------ */
  const RULES = [
    /* ---- Animal master / lifecycle ---- */
    r("AN-006", "Animal", "Identification photo", "Animal", "ANIMAL_CREATED", 0, 0, 0, "REMINDER", "Upload an identification photo", "Low", { param: "PARAM-040", unit: "Days", data: "PhotoURL", end: 45 }),
    r("AN-019", "Animal", "Critical data missing", "Animal", "ANIMAL_CREATED", 0, 0, 0, "CHECK", "Flag missing TagNumber / DateOfBirth / Gender / Species", "High", { data: "TagNumber,DateOfBirth,Gender,Species" }),
    r("AN-010", "Animal", "Heifer age promotion", "Calf", "ANIMAL_CREATED", 365, 0, 0, "STATUS", "Promote Calf to Heifer at one year", "Normal", { unit: "Age" }),

    /* ---- Calf / newborn ---- */
    r("CF-007", "Calf", "Colostrum task", "Calf", "BIRTH", 0, 0, 0, "REMINDER", "Colostrum within the first hours", "Critical", { param: "PARAM-026", unit: "Hours", end: 2, notes: "Passive immunity transfer is time sensitive" }),
    r("CF-009", "Calf", "Navel care", "Calf", "BIRTH", 0, 0, 0, "REMINDER", "Navel disinfection", "High", { end: 3 }),
    r("CF-010", "Calf", "Newborn health check", "Calf", "BIRTH", 1, 0, 0, "REMINDER", "Newborn health check within 24h", "High", { end: 7 }),
    r("CF-012", "Calf", "Calf photo", "Calf", "BIRTH", 1, 0, 0, "REMINDER", "Identification photo of the calf", "Low", { end: 30 }),
    r("CF-013", "Calf", "Birth record complete", "Calf", "BIRTH", 1, 0, 0, "CHECK", "Flag missing CalfGender / CalfWeight", "Normal", { data: "CalfGender,CalfWeight", end: 7 }),
    r("CF-017", "Calf", "Weaning review", "Calf", "BIRTH", 60, 0, 0, "REMINDER", "Weaning readiness review", "Normal", { param: "PARAM-030", unit: "Age" }),
    r("CF-018", "Calf", "Growth review", "Calf", "BIRTH", 30, 30, 0, "REMINDER", "Monthly weight / growth review", "Normal", { param: "PARAM-031", unit: "Age" }),
    r("CF-019", "Calf", "Weight missing", "Calf", "BIRTH", 30, 0, 0, "CHECK", "No weight recorded for this calf", "Low", { data: "Weight" }),

    /* ---- Disbudding ---- */
    r("DH-002", "Disbudding", "Disbudding review", "Calf", "BIRTH", 7, 0, 3, "REMINDER", "Disbudding review (pain management protocol)", "Normal", { param: "PARAM-010", unit: "Age", end: 49, ref: "Welfare guidance: disbud before 8 weeks", notes: "Confirm the farm/vet pain-management protocol" }),
    r("DH-003", "Disbudding", "Disbudding deadline", "Calf", "BIRTH", 56, 0, 7, "ALERT", "Review before 8 weeks - later removal is a veterinary procedure", "High", { param: "PARAM-011", unit: "Age" }),
    r("DH-006", "Disbudding", "Post-procedure check", "Calf", "DISBUDDING", 3, 0, 0, "REMINDER", "Check the disbudding site", "Normal", { end: 21 }),

    /* ---- Vaccination ---- */
    p("VAC-001", "Vaccination", "FMD first dose", "Calf", "BIRTH", "PARAM-012", 14, "REMINDER", "FMD vaccination review (first dose)", "High", { ref: "NDDB schedule", unit: "Age" }),
    p("VAC-002", "Vaccination", "FMD booster", "Calf", "VACCINATION", "PARAM-013", 7, "REMINDER", "FMD booster one month after the first dose", "High", { cond: "Vaccine~FMD" }),
    p("VAC-003", "Vaccination", "FMD revaccination", "Animal", "VACCINATION", "PARAM-014", 14, "REMINDER", "Six-monthly FMD revaccination", "High", { cond: "Vaccine~FMD" }),
    p("VAC-005", "Vaccination", "BQ vaccination", "Calf", "BIRTH", "PARAM-018", 14, "REMINDER", "BQ vaccination review", "High", { ref: "NDDB schedule", unit: "Age" }),
    p("VAC-004", "Vaccination", "HS vaccination", "Calf", "BIRTH", "PARAM-017", 14, "REMINDER", "HS vaccination review", "High", { ref: "NDDB schedule", unit: "Age" }),
    p("VAC-006", "Vaccination", "Brucellosis vaccination", "Calf", "BIRTH", "PARAM-015", 14, "REMINDER", "Brucellosis (female calves 4-8 months, once)", "High", { unit: "Age", cond: "FemaleOnly", vet: false }),
    r("VAC-012", "Vaccination", "Vaccination overdue", "Animal", "VACCINATION", 0, 0, 0, "ALERT", "Vaccination date passed without a record", "High", {}),
    r("VAC-020", "Vaccination", "Missing vaccination history", "Calf", "BIRTH", 200, 0, 0, "CHECK", "No vaccination recorded for this animal", "Normal", { unit: "Age" }),

    /* ---- Deworming ---- */
    p("DW-001", "Deworming", "Deworming review", "Animal", "DEWORMING", "PARAM-008", 7, "REMINDER", "Routine deworming review", "Normal", { notes: "Wording is a review, never a drug instruction" }),
    p("DW-013", "Deworming", "Calf parasite review", "Calf", "BIRTH", "PARAM-027", 7, "REMINDER", "First calf deworming review", "Normal", { unit: "Age" }),
    p("DW-017B", "Deworming", "Calf second dewormer", "Calf", "BIRTH", "PARAM-028", 7, "REMINDER", "Second calf deworming review", "Normal", { unit: "Age" }),
    r("DW-007", "Deworming", "Dewormer rotation", "Animal", "DEWORMING", 0, 0, 0, "ALERT", "Same drug class used twice in a row - review rotation", "Normal", { data: "DrugClass" }),
    r("DW-012", "Deworming", "Withdrawal period missing", "Animal", "DEWORMING", 0, 0, 0, "CHECK", "No withdrawal period captured for this treatment", "High", { data: "WithdrawalDays" }),
    r("DW-014", "Deworming", "New animal parasite review", "Animal", "PURCHASE", 0, 0, 0, "REMINDER", "Parasite-control review for a purchased animal", "Normal", {}),

    /* ---- Heat / estrus ---- */
    p("HE-005", "Reproduction", "Expected heat", "Cow", "HEAT", "PARAM-002", 2, "REMINDER", "Expected next heat window", "normal", { start: 0, notes: "Window uses PARAM-001..003" }),
    p("HE-004", "Reproduction", "Heat window open", "Cow", "HEAT", "PARAM-001", 0, "CALCULATION", "Earliest expected heat day", "Normal", {}),
    p("HE-025", "Reproduction", "Heat without AI", "Cow", "HEAT", 2, 0, 0, "REMINDER", "Heat recorded but no insemination", "High", {}),
    p("HE-022", "Reproduction", "Return to heat after AI", "Cow", "HEAT", "PARAM-001", 0, "ALERT", "Possible return to heat (18-24 days after AI)", "High", { unit: "Days", notes: "Never worded as failed conception" }),
    p("HE-023", "Reproduction", "Abnormal cycle length", "Cow", "HEAT", 0, 0, 0, "ALERT", "Heat interval outside the normal range - review", "Normal", {}),
    r("HE-029", "Reproduction", "Animal cycle average", "Cow", "HEAT", 0, 0, 0, "CALCULATION", "Animal-specific average cycle from history", "Low", {}),
    r("HE-030", "Reproduction", "Farm cycle statistics", "Farm", "DAILY", 0, 0, 0, "CALCULATION", "Herd-level heat/cycle statistics", "Low", {}),

    /* ---- AI / insemination ---- */
    p("AI-019", "Reproduction", "Pregnancy check after AI", "Cow", "AI", "PARAM-023", 3, "REMINDER", "Pregnancy check due", "High", {}),
    r("AI-011", "Reproduction", "AI timing coverage", "Cow", "AI", 0, 0, 0, "CALCULATION", "Timing coverage of the insemination vs the fertile window", "Normal", { notes: "Coverage, never a conception guarantee" }),
    r("AI-018", "Reproduction", "AI cost to accounting", "Cow", "AI", 0, 0, 0, "CREATE_EVENT", "Post the insemination cost to expenses/journal", "Low", { data: "Cost" }),
    r("AI-020", "Reproduction", "Close AI episode", "Cow", "PREGNANCY_POSITIVE", 0, 0, 0, "STATUS", "Close the AI episode when the outcome is known", "Low", {}),

    /* ---- Pregnancy ---- */
    r("PG-003", "Pregnancy", "Positive pregnancy", "Cow", "PREGNANCY_POSITIVE", 0, 0, 0, "STATUS", "Set animal status to Pregnant", "High", {}),
    r("PG-004", "Pregnancy", "Negative pregnancy", "Cow", "PREGNANCY_NEGATIVE", 0, 0, 0, "STATUS", "Set animal status to Open and plan the next heat", "High", {}),
    p("PG-008", "Pregnancy", "Expected calving", "PregnantCow", "PREGNANCY_POSITIVE", "PARAM-004", 0, "CALCULATION", "Calculate the expected calving date", "High", {}),
    p("PG-011", "Pregnancy", "Calving approaching", "PregnantCow", "PREGNANCY_POSITIVE", "PARAM-025", 0, "REMINDER", "Pre-calving preparation alerts", "High", {}),
    p("PG-012", "Pregnancy", "Pregnancy overdue", "PregnantCow", "PREGNANCY_POSITIVE", "PARAM-004", 0, "ALERT", "Expected calving date passed - veterinary review", "Critical", {}),
    r("PG-005", "Pregnancy", "Recheck", "Cow", "PREGNANCY_RECHECK", 14, 0, 3, "REMINDER", "Pregnancy recheck", "High", {}),

    /* ---- Calving ---- */
    r("CL-002", "Calving", "Pre-calving reminder", "PregnantCow", "CALVING_APPROACHING", 0, 0, 0, "REMINDER", "Prepare the calving area and observation", "High", {}),
    r("CL-012", "Calving", "Mother status after calving", "Cow", "CALVING", 0, 0, 0, "STATUS", "Set the mother to Lactating", "High", {}),
    r("CL-013", "Calving", "Close pregnancy", "Cow", "CALVING", 0, 0, 0, "STATUS", "Close the open pregnancy record", "Normal", {}),
    r("CL-011", "Calving", "Create calf record", "Cow", "CALVING", 0, 0, 0, "CREATE_EVENT", "Create the calf master record with parents", "High", {}),
    p("CL-015", "Calving", "Post-calving health check", "Cow", "CALVING", "PARAM-036", 0, "REMINDER", "Post-calving health check", "High", {}),
    p("PC-010", "Calving", "Postpartum repro review", "Cow", "CALVING", "PARAM-037", 3, "REMINDER", "Postpartum reproductive review", "Normal", {}),
    p("HF-011B", "Calving", "Service period review", "Cow", "CALVING", "PARAM-038", 7, "ALERT", "Cow not re-bred within the service period", "Normal", {}),
    r("CL-018", "Calving", "Calving interval", "Cow", "CALVING", 0, 0, 0, "CALCULATION", "Recalculate calving interval and lactation number", "Low", {}),
    r("CL-020", "Calving", "Difficult calving history", "Cow", "CALVING", 0, 0, 0, "ALERT", "Previous calving complication - observe closely", "Normal", {}),

    /* ---- Dry period / transition ---- */
    p("DR-001", "DryPeriod", "Dry-off review", "PregnantCow", "PREGNANCY_POSITIVE", "PARAM-006", 7, "REMINDER", "Dry-off review before calving", "Normal", { notes: "Target dry period from PARAM-006" }),
    p("DR-003", "DryPeriod", "Dry period too short", "Cow", "DRY_OFF", "PARAM-005", 0, "ALERT", "Dry period shorter than the farm minimum", "Normal", {}),
    p("DR-004", "DryPeriod", "Dry period too long", "Cow", "DRY_OFF", "PARAM-007", 0, "ALERT", "Dry period longer than the farm maximum", "Low", {}),
    r("DR-007", "DryPeriod", "Transition review", "Cow", "DRY_OFF", 0, 0, 0, "REMINDER", "Transition-period review before calving", "Normal", {}),

    /* ---- Heifer ---- */
    p("HF-004", "Heifer", "Breeding eligibility", "Heifer", "ANIMAL_CREATED", "PARAM-032", 14, "REMINDER", "Breeding-readiness review (age and weight)", "Normal", { unit: "Age" }),
    p("HF-010", "Heifer", "Delayed breeding", "Heifer", "ANIMAL_CREATED", "PARAM-033", 7, "ALERT", "Heifer not bred by the target age", "Normal", { unit: "Age" }),
    p("HF-011", "Heifer", "First calving target", "Heifer", "ANIMAL_CREATED", "PARAM-034", 30, "REMINDER", "First-calving target age review", "Low", { unit: "Age" }),

    /* ---- Health / treatment ---- */
    r("HL-009", "Health", "Treatment follow-up", "Animal", "HEALTH", 0, 0, 0, "REMINDER", "Follow-up on the treatment", "High", { data: "FollowUpDate" }),
    r("HL-012", "Health", "Treatment overdue", "Animal", "HEALTH", 0, 0, 0, "ALERT", "Treatment still open past the follow-up date", "High", {}),
    r("HL-013", "Health", "Repeated disease", "Animal", "HEALTH", 0, 0, 0, "ALERT", "Same problem recorded more than once", "Normal", {}),
    r("HL-019", "Health", "Veterinary review", "Animal", "HEALTH", 0, 0, 0, "ALERT", "Serious or chronic condition - veterinary review", "Critical", { cond: "Chronic" }),
    r("HL-020", "Health", "Health cost to accounting", "Animal", "HEALTH", 0, 0, 0, "CREATE_EVENT", "Post the treatment cost to expenses/journal", "Low", { data: "TreatmentCost" }),
    r("MD-005", "Health", "Withdrawal period", "Animal", "HEALTH", 0, 0, 0, "REMINDER", "Milk/meat withdrawal period ends", "High", { data: "WithdrawalDays", vet: false, notes: "Read from the product label or vet protocol - never invented" }),
    r("MD-009", "Health", "Withdrawal info missing", "Animal", "HEALTH", 0, 0, 0, "CHECK", "Active ingredient / withdrawal period not recorded", "High", { data: "ActiveIngredient,WithdrawalDays" }),

    /* ---- Purchase / quarantine ---- */
    r("PU-009", "Purchase", "Quarantine", "Animal", "PURCHASE", 30, 0, 2, "REMINDER", "Quarantine period for a purchased animal", "High", { param: "PARAM-035", unit: "Days" }),
    r("PU-005", "Purchase", "Veterinary check", "Animal", "PURCHASE", 0, 0, 0, "REMINDER", "Veterinary check on arrival", "High", { end: 14 }),
    r("PU-011", "Purchase", "Vaccination history", "Animal", "PURCHASE", 0, 0, 0, "CHECK", "Vaccination history unknown for a purchased animal", "Normal", { data: "VaccinationHistory" }),
    r("PU-013", "Purchase", "Reproductive history", "Animal", "PURCHASE", 0, 0, 0, "CHECK", "Reproductive history unknown for a purchased animal", "Low", { data: "ReproductiveHistory" }),

    /* ---- Sale / death ---- */
    r("SL-012", "Sale", "Sale accounting entry", "Animal", "SALE", 0, 0, 0, "CREATE_EVENT", "Create the sale journal entry", "Normal", { data: "NetSale" }),
    r("RM-010", "Reminders", "Close reminders on sale", "Animal", "SALE", 0, 0, 0, "STATUS", "Close open reminders for a sold animal", "Normal", {}),
    r("DT-005", "Death", "Close records on death", "Animal", "DEATH", 0, 0, 0, "STATUS", "Close reminders, pregnancy and open treatments", "High", {}),

    /* ---- Data quality (CHECK rules) ---- */
    r("DQ-003", "DataQuality", "Missing date of birth", "Animal", "ANIMAL_CREATED", 0, 0, 0, "CHECK", "Age-based rules cannot run without a DOB", "High", { data: "DateOfBirth" }),
    r("DQ-005", "DataQuality", "Pregnancy without AI", "Cow", "PREGNANCY_POSITIVE", 0, 0, 0, "CHECK", "Positive pregnancy with no linked insemination", "Normal", { data: "InseminationID" }),
    r("DQ-006", "DataQuality", "Calving without pregnancy", "Cow", "CALVING", 0, 0, 0, "CHECK", "Calving recorded with no pregnancy on file", "Normal", {}),
    r("DQ-007", "DataQuality", "Calf without mother", "Calf", "BIRTH", 0, 0, 0, "CHECK", "Calf has no MotherID link", "Normal", { data: "MotherID" }),
    r("DQ-008", "DataQuality", "AI without heat episode", "Cow", "AI", 0, 0, 0, "CHECK", "Insemination with no heat record or episode", "Low", { data: "HeatRecordID" }),
    r("DQ-014", "DataQuality", "Future event date", "Animal", "DAILY", 0, 0, 0, "CHECK", "Event dated in the future", "High", {}),
    r("DQ-015", "DataQuality", "Impossible date of birth", "Animal", "ANIMAL_CREATED", 0, 0, 0, "CHECK", "Date of birth is in the future", "Critical", { data: "DateOfBirth" }),
    r("DQ-019", "DataQuality", "Deceased animal new event", "Animal", "DAILY", 0, 0, 0, "CHECK", "New record for a deceased animal", "High", {}),
    r("DQ-020", "DataQuality", "Sold animal repro event", "Animal", "DAILY", 0, 0, 0, "CHECK", "Reproductive event on a sold animal", "Normal", {}),
    r("DQ-024", "DataQuality", "Missing expense amount", "Farm", "EXPENSE", 0, 0, 0, "CHECK", "Expense recorded without an amount", "High", { data: "Amount" }),
  ];

  /* ------------------------------------------------------------------ */
  /* Which entry completes which reminder (RM-019)                        */
  /* ------------------------------------------------------------------ */
  /** ruleCategory/key -> { store, match(record) } */
  const COMPLETION = {
    Deworming: { store: "deworming" },
    Vaccination: { store: "vaccination", byName: true },
    Reproduction: { store: "insemination", only: ["HE-025"] },
    Health: { store: "health" },
    Pregnancy: { store: "pregnancy", only: ["PG-005"] },
    DryPeriod: { store: "dryOff" },
    Disbudding: { store: "health", match: (rec) => /disbud|dehorn/i.test(String(rec.Problem || "") + String(rec.Treatment || "")) },
  };
  /** Trigger events that retire a whole reminder family. */
  const CLOSING_EVENTS = { SALE: ["Sale"], DEATH: ["Death", "Health", "Reproduction", "Calf", "DryPeriod"], PREGNANCY_POSITIVE: ["Reproduction"], CALVING: ["Pregnancy", "Calving"] };

  const paramMap = () => Object.fromEntries(PARAMS.map((x) => [x.ParameterID, x]));

  const seedPayload = () => ({
    rules: RULES.map((x) => ({ ...x, id: x.RuleID })),
    ruleParameters: PARAMS.map((x) => ({ ...x, id: x.ParameterID })),
    ruleOverrides: [],
  });

  return {
    RULES, PARAMS, COMPLETION, CLOSING_EVENTS,
    RULES_COLUMNS, PARAM_COLUMNS, OVERRIDE_COLUMNS,
    paramMap, seedPayload,
    DEFAULT_VERSION: "1.0.0",
  };
})();
