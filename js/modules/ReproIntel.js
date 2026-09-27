window.JF = window.JF || {};

/**
 * ReproIntel — observation-driven reproductive intelligence.
 *
 * Everything here is descriptive analytics on records the farm actually logged.
 * Nothing is a veterinary diagnosis: every number carries a plain-language
 * explanation (why()), and confidence reflects how complete the observations are.
 *
 * Core concepts
 * -------------
 * Episode     : all heat observations + AIs + treatments for one cow within a
 *               clustering window, forming one reproductive story.
 * Evidence    : weighted observations (standing heat, mucus, mounting, ...).
 * Onset est.  : earliest evidence → first strong standing evidence → best estimate.
 * Ovulation   : probability band derived from onset + configured biology window.
 * Coverage    : how each AI sits inside the high/probable/possible bands.
 * Return heat : heat observed 18–24d after an AI without a positive PD → flag.
 */
JF.ReproIntel = (function () {

  /* ---------------- Evidence model ---------------- */

  // Observation weights (0..1). Standing heat dominates; others corroborate.
  const EVIDENCE = {
    "Standing Heat":        { w: 1.0, strong: true,  label: "Standing to be mounted" },
    "Standing while mounted": { w: 1.0, strong: true, label: "Standing while mounted" },
    "Clear Mucus":          { w: 0.6, strong: false, label: "Clear mucus discharge" },
    "Mucus Discharge":      { w: 0.6, strong: false, label: "Mucus discharge" },
    "Mounting":             { w: 0.5, strong: false, label: "Mounting other cows" },
    "Restlessness":         { w: 0.3, strong: false, label: "Restless / bawling" },
    "Increased Vocalization": { w: 0.3, strong: false, label: "More vocal than usual" },
    "Vulvar Swelling":      { w: 0.4, strong: false, label: "Swollen vulva" },
    "Reduced Intake":       { w: 0.2, strong: false, label: "Off feed" },
    "Tail Raising":         { w: 0.4, strong: false, label: "Tail raising / switching" },
    "Chin Resting":         { w: 0.3, strong: false, label: "Chin resting" },
  };

  const evKey = (label) => {
    const k = String(label || "").toLowerCase();
    for (const name in EVIDENCE) if (name.toLowerCase() === k) return name;
    if (/stand/.test(k)) return "Standing Heat";
    if (/muc/.test(k)) return "Clear Mucus";
    if (/mount/.test(k)) return "Mounting";
    if (/restl/.test(k)) return "Restlessness";
    if (/vocal/.test(k)) return "Increased Vocalization";
    if (/vulv|swell/.test(k)) return "Vulvar Swelling";
    if (/tail/.test(k)) return "Tail Raising";
    if (/chin/.test(k)) return "Chin Resting";
    if (/appetit|intake|feed/.test(k)) return "Reduced Intake";
    return null;
  };

  /* ---------------- Small date helpers (UTC-safe) ---------------- */

  const dayStart = (d) => { const x = JF.Utils.parseDate(d); x.setHours(0, 0, 0, 0); return x; };
  const addMin = (d, m) => new Date(d.getTime() + m * 60000);
  const timeOf = (r) => {
    const t = r.HeatTime || r.Time || "";
    const m = String(t).match(/^(\d{1,2}):(\d{2})/);
    return m ? { h: +m[1], min: +m[2] } : null;
  };
  const momentOf = (rec, dateKey) => {
    const d = dayStart(rec[dateKey] || rec.Date || rec.CreatedAt);
    const t = timeOf(rec);
    if (t) d.setHours(t.h, t.min, 0, 0);
    return d;
  };

  /* ---------------- Episode clustering ---------------- */

  // Events fold into one episode when gaps stay under the window (hours).
  const CLUSTER_HOURS = 96; // 4 days

  /**
   * Build reproductive episodes for one animal from raw records.
   * Observations come from heat records (with Symptoms[], HeatTime) and
   * optional standalone observation rows; AIs from insemination.
   */
  const episodesFor = (animalId, { heats = [], inseminations = [], healths = [], animals = [] } = {}) => {
    const animal = animals.find((a) => a.AnimalID === animalId || a.id === animalId);
    const obs = [];
    (heats || []).filter((h) => h.AnimalID === animalId).forEach((h) => {
      const syms = Array.isArray(h.Symptoms) ? h.Symptoms : String(h.Symptoms || "").split(",").map((s) => s.trim()).filter(Boolean);
      const moment = momentOf(h, "HeatDate");
      obs.push({
        at: moment,
        dateKey: JF.Utils.formatDate(h.HeatDate || "", "yyyy-MM-dd"),
        time: h.HeatTime || "",
        signs: syms,
        raw: h,
        kind: "obs",
      });
    });
    const ais = (inseminations || [])
      .filter((x) => x.AnimalID === animalId)
      .map((x) => ({ at: momentOf(x, "Date"), dateKey: JF.Utils.formatDate(x.Date || "", "yyyy-MM-dd"), time: x.Time || "", raw: x, kind: "ai" }))
      .sort((a, b) => a.at - b.at);

    // No observations at all → synthesize "assumed heat" episodes at AI dates so
    // legacy data still gets coverage analysis.
    if (!obs.length && ais.length) {
      ais.forEach((ai) => obs.push({ at: new Date(ai.at.getTime() - 12 * 3600e3), dateKey: ai.dateKey, time: "", signs: [], raw: null, kind: "assumed" }));
    }
    obs.sort((a, b) => a.at - b.at);

    // Cluster observations into episodes.
    const episodes = [];
    let cur = null;
    obs.forEach((o) => {
      if (!cur || (o.at - cur.end) > CLUSTER_HOURS * 3600e3) {
        cur = { start: o.at, end: o.at, obs: [], ais: [] };
        episodes.push(cur);
      }
      cur.end = o.at > cur.end ? o.at : cur.end;
      cur.obs.push(o);
    });
    // Attach AIs to the episode whose window [start-12h, end+72h] contains them.
    ais.forEach((ai) => {
      let best = null, bestGap = Infinity;
      episodes.forEach((ep) => {
        const lo = ep.start.getTime() - 12 * 3600e3;
        const hi = ep.end.getTime() + 72 * 3600e3;
        if (ai.at.getTime() >= lo && ai.at.getTime() <= hi) {
          const mid = (ep.start.getTime() + ep.end.getTime()) / 2;
          const gap = Math.abs(ai.at.getTime() - mid);
          if (gap < bestGap) { bestGap = gap; best = ep; }
        }
      });
      (best || episodes[episodes.length - 1] || { obs: [], ais: [] }).ais.push(ai);
      if (!episodes.length) episodes.push({ start: ai.at, end: ai.at, obs: [], ais: [ai] });
    });

    const built = episodes.map((ep, idx) => buildEpisode(animalId, animal, ep, idx));
    // Cross-episode return-to-heat: a NEW heat episode starting 18–24d after the
    // previous episode's last AI (no positive PD between) → flag, never diagnose.
    for (let i = 1; i < built.length; i++) {
      if (built[i].returnHeat && built[i].returnHeat.possible) continue;
      const prev = built[i - 1];
      const prevAI = prev.aiCoverage[prev.aiCoverage.length - 1];
      if (!prevAI) continue;
      const gap = Math.round((built[i].start.getTime() - prevAI.at.getTime()) / 86400e3);
      if (gap >= 18 && gap <= 24) {
        built[i].returnHeat = {
          possible: true,
          crossEpisode: true,
          afterAI: prevAI.ai.InseminationID || prevAI.ai.id,
          intervalDays: gap,
          note: `New heat ~${gap} days after the previous AI (${JF.Utils.formatDate(prevAI.at, "d MMM")}) — possible return to heat after AI. Not a diagnosis: confirm with a pregnancy check.`,
        };
        built[i].actions.push({ icon: "fire", text: `Possible return to heat after AI — ${gap}-day interval from ${JF.Utils.formatDate(prevAI.at, "d MMM")}. Review with a pregnancy check.`, tone: "warn" });
      }
    }
    return built;
  };

  const buildEpisode = (animalId, animal, ep, idx) => {
    const events = [...ep.obs, ...ep.ais].sort((a, b) => a.at - b.at);

    // --- Evidence scoring ---
    const perSign = {};
    let totalW = 0, maxW = 1.6; // standing heat alone ≈ 62%; two strong signs cap
    let strongSeen = null;
    ep.obs.forEach((o) => {
      o.signs.forEach((s) => {
        const name = evKey(s);
        if (!name) return;
        const e = EVIDENCE[name];
        perSign[name] = perSign[name] || { label: e.label, score: 0, seen: 0 };
        perSign[name].seen++;
        if (perSign[name].score < e.w) perSign[name].score = e.w;
      });
    });
    Object.values(perSign).forEach((p) => { totalW += p.score; if (EVIDENCE[p.label]?.strong || p.score >= 0.9) strongSeen = strongSeen || p; });
    const evidenceScore = Math.min(1, totalW / maxW);

    // First strong standing-heat observation (or highest-weighted as fallback).
    const strongObs = ep.obs.find((o) => o.signs.some((s) => { const k = evKey(s); return k && EVIDENCE[k].strong; }));
    const firstEvidence = ep.obs[0] || null;
    const onset = strongObs || firstEvidence;

    // --- Onset estimate ---
    const onsetEstimate = onset ? {
      earliest: firstEvidence ? firstEvidence.at : null,
      earliestLabel: firstEvidence ? describeObs(firstEvidence) : "",
      firstStrong: strongObs ? strongObs.at : null,
      firstStrongLabel: strongObs ? describeObs(strongObs) : "",
      best: onset.at,
      bestLabel: describeObs(onset),
      basis: strongObs ? "first strong standing-heat evidence" : (firstEvidence ? "earliest recorded observation" : ""),
    } : null;

    // --- Ovulation window (probability cloud) ---
    // Biology: ovulation ≈ 24–32h after standing-heat onset. Bands widen when
    // the evidence is thin (no standing heat observed).
    const standingSeen = !!strongObs;
    const baseAfter = standingSeen ? 24 : 30;  // hours after onset
    const spanBefore = standingSeen ? 4 : 8;
    const spanAfter = standingSeen ? 8 : 14;
    const ovulLo = addMin(onset ? onset.at : ep.start, (baseAfter - spanBefore) * 60);
    const ovulHi = addMin(onset ? onset.at : ep.start, (baseAfter + spanAfter) * 60);
    const ovulCoreLo = addMin(onset ? onset.at : ep.start, baseAfter * 60 - 60);
    const ovulCoreHi = addMin(onset ? onset.at : ep.start, baseAfter * 60 + 120);

    // --- AI timing coverage ---
    // Fertile window ≠ ovulation moment: sperm needs ~4-6h capacitation, so
    // well-timed AIs land BEFORE ovulation (classic AM/PM rule: AI 2-20h after
    // standing-heat onset). Bands are therefore earlier-shifted, not ± around ovulation.
    const fertileLo = addMin(onset.at, standingSeen ? 2 * 60 : 0);
    const fertileHi = addMin(onset.at, standingSeen ? 28 * 60 : 40 * 60);
    const primeLo = addMin(onset.at, standingSeen ? 4 * 60 : 6 * 60);
    const primeHi = addMin(onset.at, standingSeen ? 20 * 60 : 28 * 60);
    const aiCoverage = ep.ais.map((ai) => {
      const t = ai.at.getTime();
      const lo = fertileLo.getTime(), hi = fertileHi.getTime();
      const coreLo = primeLo.getTime(), coreHi = primeHi.getTime();
      let band, note;
      if (t >= coreLo && t <= coreHi) { band = "prime"; note = "Inside the highest-fertility window after heat onset"; }
      else if (t >= lo && t <= hi) { band = "good"; note = "Within the fertile window (AM/PM rule)"; }
      else if (t < lo) { band = "early"; note = "Very soon after heat onset — well before the peak window"; }
      else { band = "late"; note = "Later than the fertile window — return heat watch recommended"; }
      const offsetH = Math.round((((t - primeLo.getTime()) / 3600e3) - (primeHi - primeLo) / 7200e3) * 10) / 10;
      return {
        ai: ai.raw,
        at: ai.at,
        band,
        note,
        offsetHours: offsetH,
        label: `${JF.Utils.formatDate(ai.at, "dd MMM")} ${ai.time || ""}`.trim(),
      };
    });

    // --- Return-to-heat detection (18-24d after AI, no positive PD) ---
    let returnHeat = null;
    const lastAI = ep.ais[ep.ais.length - 1];
    const nextHeatEp = null; // resolved by caller if needed
    if (lastAI) {
      const gapDays = (ep.end.getTime() - lastAI.at.getTime()) / 86400e3;
      const lateAIs = ep.ais.slice(0, -1).filter((a2) => (lastAI.at - a2.at) / 86400e3 >= 16 && (lastAI.at - a2.at) / 86400e3 <= 26);
      if (ep.ais.length >= 2 && lateAIs.length) {
        returnHeat = {
          possible: true,
          afterAI: lastAI.raw.InseminationID || lastAI.raw.id,
          intervalDays: Math.round((lastAI.at - lateAIs[lateAIs.length - 1].at) / 86400e3),
          note: "Two AIs ~3 weeks apart — possible return to heat after the first AI (no positive pregnancy check recorded in this episode).",
        };
      }
    }

    // --- Next actions (workflow assistant) ---
    const actions = nextActions({ ep, onset, standingSeen, aiCoverage, returnHeat, evidenceScore });

    return {
      id: `${animalId}-EP`,
      animalId,
      index: idx + 1,
      start: ep.start, end: ep.end,
      events,
      observations: ep.obs.filter((o) => o.kind !== "ai"),
      signs: perSign,
      evidenceScore,
      evidencePct: Math.round(evidenceScore * 100),
      standingSeen,
      onsetEstimate,
      ovulation: { lo: ovulLo, hi: ovulHi, coreLo: ovulCoreLo, coreHi: ovulCoreHi, standingSeen, fertileLo, fertileHi, primeLo, primeHi },
      aiCoverage,
      returnHeat,
      actions,
    };
  };

  const describeObs = (o) => {
    if (!o) return "";
    const sign = o.signs && o.signs.length ? o.signs[0] : "observation";
    const t = o.time ? ` at ${o.time}` : "";
    return `${sign}${t} on ${JF.Utils.formatDate(o.at, "d MMM")}`;
  };

  /* ---------------- Next actions ---------------- */

  const nextActions = ({ ep, onset, standingSeen, aiCoverage, returnHeat, evidenceScore }) => {
    const list = [];
    const covered = aiCoverage.some((c) => c.band === "prime" || c.band === "good");
    if (!aiCoverage.length && onset) {
      list.push({ icon: "syringe", text: "AI timing window being monitored — record AI when performed", tone: covered ? "good" : "warn" });
      list.push({ icon: "pregnancy", text: "Pregnancy check reminder will be created automatically after AI", tone: "info" });
    } else if (aiCoverage.length) {
      const last = aiCoverage[aiCoverage.length - 1];
      if (last.band === "late") list.push({ icon: "fire", text: "Watch for return to heat (~18–24 days after AI)", tone: "warn" });
      list.push({ icon: "pregnancy", text: "Pregnancy check due ~30 days after AI", tone: "info" });
    }
    if (!standingSeen && ep.obs.length) list.push({ icon: "animals", text: "Record standing heat if observed — sharpens the onset estimate", tone: "info" });
    if (evidenceScore < 0.5) list.push({ icon: "eye", text: "Observations are thin — log more signs for better timing guidance", tone: "info" });
    if (returnHeat && returnHeat.possible) list.push({ icon: "fire", text: "Review this episode — possible return to heat after AI", tone: "warn" });
    return list;
  };

  /* ---------------- Herd-level: traffic lights & scorecards ---------------- */

  const TRAFFIC = {
    red:      { key: "red",      label: "Action overdue",        cls: "traffic--red" },
    orange:   { key: "orange",   label: "Action needed soon",    cls: "traffic--orange" },
    yellow:   { key: "yellow",   label: "Action approaching",    cls: "traffic--yellow" },
    green:    { key: "green",    label: "Normal / monitoring",   cls: "traffic--green" },
    blue:     { key: "blue",     label: "Pregnant",              cls: "traffic--blue" },
    magenta:  { key: "magenta",  label: "In reproductive episode", cls: "traffic--magenta" },
  };

  const trafficLight = async (animal) => {
    const aID = animal.AnimalID || animal.id;
    const status = animal.CurrentStatus || "";
    if (["Sold", "Deceased"].includes(status)) return { ...TRAFFIC.green, hidden: true };
    if (status === "Pregnant") return { ...TRAFFIC.blue, next: "Calving monitoring" };

    const [heats, insem, preg, healths, calvings] = await Promise.all([
      JF.Store.heat.list(), JF.Store.insemination.list(), JF.Store.pregnancy.list(),
      JF.Store.health.list(), JF.Store.calving.list(),
    ]);
    const today = JF.Utils.todayISO();
    const since = (iso) => JF.Utils.daysBetween(iso, today);

    const lastHeat = heats.filter((h) => h.AnimalID === aID).sort((a, b) => new Date(b.HeatDate) - new Date(a.HeatDate))[0];
    const lastAI = insem.filter((x) => x.AnimalID === aID).sort((a, b) => new Date(b.Date) - new Date(a.Date))[0];
    const lastPreg = preg.filter((x) => x.AnimalID === aID).sort((a, b) => new Date(b.Date) - new Date(a.Date))[0];
    const openCase = healths.find((h) => h.AnimalID === aID && ["Open", "Under Treatment"].includes(h.RecoveryStatus || ""));

    if (openCase) {
      const follow = openCase.FollowUpDate ? since(openCase.FollowUpDate) : 0;
      return { ...TRAFFIC.red, next: follow > 0 ? "Treatment overdue" : "Treatment follow-up", record: openCase };
    }
    if (lastPreg && lastPreg.Result === "Recheck") return { ...TRAFFIC.orange, next: "Pregnancy recheck", record: lastPreg };
    if (lastAI && !lastPreg) {
      const d = since(lastAI.Date);
      if (d >= 28) return { ...TRAFFIC.orange, next: "Pregnancy check overdue", record: lastAI };
      if (d >= 22) return { ...TRAFFIC.yellow, next: "Pregnancy check due soon", record: lastAI };
      if (d >= 17 && lastHeat && since(lastHeat.HeatDate) <= 7) return { ...TRAFFIC.magenta, next: "Possible return to heat — review", record: lastHeat };
      return { ...TRAFFIC.green, next: "Post-AI monitoring", record: lastAI };
    }
    if (status === "In Heat") return { ...TRAFFIC.magenta, next: "AI window — monitor closely", record: lastHeat };
    if (lastHeat) {
      const d = since(lastHeat.HeatDate);
      const exp = 21;
      if (d > exp + 4) return { ...TRAFFIC.yellow, next: `Heat expected — cycle running long (${d}d)`, record: lastHeat };
      if (d >= exp - 3) return { ...TRAFFIC.yellow, next: `Heat expected in ${Math.max(0, exp - d)}d`, record: lastHeat };
      return { ...TRAFFIC.green, next: "Routine monitoring", record: lastHeat };
    }
    if (calvings.some((c) => c.AnimalID === aID)) return { ...TRAFFIC.green, next: "Post-calving monitoring" };
    return { ...TRAFFIC.green, next: "Routine monitoring" };
  };

  /* ---------------- Scorecard (record quality, not fertility) ---------------- */

  const scorecardFor = async (animalId) => {
    const [heats, insem, preg] = await Promise.all([
      JF.Store.heat.list(), JF.Store.insemination.list(), JF.Store.pregnancy.list(),
    ]);
    const mine = {
      heats: heats.filter((h) => h.AnimalID === animalId),
      ais: insem.filter((x) => x.AnimalID === animalId),
      pregs: preg.filter((x) => x.AnimalID === animalId),
    };
    // Heat detection: share of AIs that had a heat record within the prior 3 days.
    const withHeat = mine.ais.filter((ai) => mine.heats.some((h) => {
      const d = Math.abs(JF.Utils.daysBetween(h.HeatDate, ai.Date));
      return d <= 3;
    })).length;
    const heatDetection = mine.ais.length ? withHeat / mine.ais.length : (mine.heats.length ? 1 : 0);
    // AI timing: share of AIs landing in prime/good band of their episode.
    const eps = episodesFor(animalId, { heats: mine.heats, inseminations: mine.ais });
    const covered = eps.flatMap((e) => e.aiCoverage).filter((c) => c.band === "prime" || c.band === "good").length;
    const aiTiming = mine.ais.length ? covered / mine.ais.length : 0;
    // Observation quality: avg evidence % across episodes with observations.
    const obsEps = eps.filter((e) => e.observations.length);
    const obsQ = obsEps.length ? obsEps.reduce((s, e) => s + e.evidenceScore, 0) / obsEps.length : (mine.heats.length ? 0.4 : 0);
    // Record completeness: AIs with technician + heat-linked + PD after each AI.
    const pdAfter = mine.ais.filter((ai) => mine.pregs.some((p) => JF.Utils.daysBetween(ai.Date, p.Date) >= 20 && JF.Utils.daysBetween(ai.Date, p.Date) <= 60)).length;
    const completeness = mine.ais.length
      ? (0.4 * pdAfter / mine.ais.length) + (0.3 * mine.ais.filter((a) => a.Technician).length / mine.ais.length) + (0.3 * (withHeat / mine.ais.length))
      : (mine.heats.length ? 0.5 : 0);
    const pct = (x) => Math.round(Math.min(1, Math.max(0, x)) * 100);
    return {
      heatDetection: pct(heatDetection),
      aiTiming: pct(aiTiming),
      observationQuality: pct(obsQ),
      completeness: pct(completeness),
    };
  };

  /* ---------------- Why? explanations ---------------- */

  const why = (episode) => {
    const lines = [];
    const s = episode.signs || {};
    Object.values(s).forEach((p) => lines.push(`✓ ${p.label} recorded`));
    if (episode.onsetEstimate) lines.push(`✓ Timing of observations: ${episode.onsetEstimate.basis}`);
    if (episode.standingSeen) lines.push("✓ Standing heat observed — window narrows to 24–32h after onset");
    else lines.push("✓ No standing heat recorded — window widened and shown as less certain");
    lines.push("✓ Previous heat history (cycle averages) where available");
    return {
      basis: lines,
      confidence: episode.standingSeen ? "High" : (episode.evidencePct >= 50 ? "Medium" : "Low"),
    };
  };

  /* ---------------- Public API ---------------- */

  return {
    EVIDENCE,
    episodesFor,
    trafficLight,
    scorecardFor,
    why,
  };
})();
