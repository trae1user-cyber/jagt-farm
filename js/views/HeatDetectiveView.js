JF.Views = JF.Views || {};

/**
 * Heat Detective — one graph, whole story.
 *
 * Lanes (top → bottom):
 *   OBSERVATIONS  evidence chips with weights
 *   BIOLOGY       estimated onset → ovulation probability cloud (possible/probable/prime)
 *   AI            insemination events + timing coverage verdicts
 *   LOGISTICS     semen availability + technician availability bands
 */
JF.Views.HeatDetective = (function () {
  const $ = () => document.getElementById("view-container");

  /* ---------------- data ---------------- */

  const loadCowData = async () => {
    const [animals, heats, insem, healths, preg] = await Promise.all([
      JF.Store.animals.list(), JF.Store.heat.list(), JF.Store.insemination.list(),
      JF.Store.health.list(), JF.Store.pregnancy.list(),
    ]);
    return { animals, heats, insem, healths, preg };
  };

  const femaleCows = (animals) => animals.filter((a) =>
    a.Gender === "Female" && !["Calf", "Sold", "Deceased"].includes(a.CurrentStatus));

  /* ---------------- SVG timeline builder ---------------- */

  const W = 960, H = 300, PADL = 118, PADR = 26, LANE_H = 46, TOP = 40;
  const LANES = [
    { key: "obs",   label: "OBSERVATIONS", color: "#7a6247" },
    { key: "bio",   label: "BIOLOGY",      color: "#b92473" },
    { key: "ai",    label: "AI",           color: "#27407e" },
    { key: "logi",  label: "LOGISTICS",    color: "#59452f" },
  ];

  const svgEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const buildTimelineSVG = (ep, logs) => {
    const lo = ep.start.getTime() - 18 * 3600e3;
    const hi = Math.max(ep.end.getTime(), ep.ovulation.hi.getTime(), ...ep.aiCoverage.map((c) => c.at.getTime())) + 20 * 3600e3;
    const span = Math.max(1, hi - lo);
    const x = (t) => PADL + ((t - lo) / span) * (W - PADL - PADR);
    const laneY = (i) => TOP + i * LANE_H + 14;
    const height = TOP + LANES.length * LANE_H + 34;
    const parts = [];
    const now = Date.now();
    const fmtT = (t) => JF.Utils.formatDate(new Date(t), "d MMM HH:mm");

    // grid + day ticks with hour-level minor ticks (fertility windows live and
    // die by the hour, so the axis shows both: day boundaries + 6h minor grid)
    const dayMs = 86400e3;
    const hourMs = 3600e3;
    // Snap the tick grid to 6-hour boundaries aligned on local midnight, so every
    // day gets one bold label at 00:00 and three minor hour ticks (06/12/18).
    const firstMidnight = new Date(lo); firstMidnight.setHours(0, 0, 0, 0);
    let t0 = firstMidnight.getTime();
    while (t0 < lo) t0 += 6 * hourMs;
    for (let t = t0; t <= hi; t += 6 * hourMs) {
      const px = x(t);
      const d = new Date(t);
      const isMidnight = d.getHours() === 0;
      parts.push(`<line x1="${px}" y1="${TOP - 12}" x2="${px}" y2="${height - 26}" stroke="#e3d5ba" stroke-width="${isMidnight ? 1.4 : 0.7}" ${isMidnight ? "" : 'stroke-dasharray="2 4"'}/>`);
      if (isMidnight) {
        parts.push(`<text x="${px}" y="${TOP - 28}" font-size="11" font-weight="700" fill="#59452f" text-anchor="middle">${svgEsc(JF.Utils.formatDate(d, "d MMM"))}</text>`);
      } else {
        parts.push(`<text x="${px}" y="${TOP - 28}" font-size="8.5" fill="#a58d6f" text-anchor="middle">${String(d.getHours()).padStart(2, "0")}h</text>`);
      }
    }
    // now marker
    if (now > lo && now < hi) {
      parts.push(`<line x1="${x(now)}" y1="${TOP - 12}" x2="${x(now)}" y2="${height - 26}" stroke="#a33327" stroke-width="2" stroke-dasharray="4 3"/>`);
      parts.push(`<text x="${x(now)}" y="${height - 12}" font-size="10" fill="#a33327" text-anchor="middle">NOW</text>`);
    }

    // lane frames + labels
    LANES.forEach((l, i) => {
      parts.push(`<line x1="${PADL - 8}" y1="${laneY(i) + 16}" x2="${W - PADR}" y2="${laneY(i) + 16}" stroke="#e3d5ba" stroke-width="1"/>`);
      parts.push(`<text x="${PADL - 14}" y="${laneY(i) + 6}" font-size="10" font-weight="700" fill="${l.color}" text-anchor="end" letter-spacing="1">${l.label}</text>`);
    });

    // full-height fertile-window bands (behind all lanes) — biology applies to
    // every row: observations, ovulation, AI coverage and logistics.
    const ov = ep.ovulation;
    if (ov.fertileLo && ov.primeLo) {
      const yTop = TOP - 12, yBot = height - 26;
      const fl = x(ov.fertileLo.getTime()), fh = x(ov.fertileHi.getTime());
      const pl = x(ov.primeLo.getTime()), ph = x(ov.primeHi.getTime());
      parts.push(`<rect x="${fl}" y="${yTop}" width="${Math.max(2, fh - fl)}" height="${yBot - yTop}" fill="#2e8a4f" opacity="0.07"/>`);
      parts.push(`<rect x="${pl}" y="${yTop}" width="${Math.max(2, ph - pl)}" height="${yBot - yTop}" fill="#2e8a4f" opacity="0.14"/>`);
      parts.push(`<text x="${(fl + fh) / 2}" y="${height - 12}" font-size="9" fill="#2e8a4f" text-anchor="middle" letter-spacing="1">FERTILE WINDOW${ep.standingSeen ? "" : " (WIDE)"}</text>`);
      parts.push(`<text x="${(pl + ph) / 2}" y="${yTop + 10}" font-size="9" font-weight="700" fill="#2e8a4f" text-anchor="middle" letter-spacing="1">PRIME</text>`);
    }

    /* --- lane 1: observations --- */
    ep.observations.forEach((o, i) => {
      const px = x(o.at.getTime());
      const main = o.signs[0] || "obs";
      const strong = o.signs.some((s) => /stand/i.test(s));
      parts.push(`<g>
        <circle cx="${px}" cy="${laneY(0) - 2}" r="${strong ? 8 : 6}" fill="${strong ? "#b92473" : "#a58d6f"}"/>
        <text x="${px}" y="${laneY(0) - 18}" font-size="9.5" fill="#59452f" text-anchor="middle">${svgEsc(String(main).slice(0, 14))}</text>
      </g>`);
    });

    /* --- lane 2: biology - estimated onset bar + ovulation cloud --- */
    const ovY = laneY(1);
    const ovLo = x(ep.ovulation.lo), ovHi = x(ep.ovulation.hi);
    const cLo = x(ep.ovulation.coreLo), cHi = x(ep.ovulation.coreHi);
    // possible band
    parts.push(`<rect x="${ovLo}" y="${ovY - 10}" width="${Math.max(2, ovHi - ovLo)}" height="20" rx="10" fill="#b92473" opacity="0.16"/>`);
    // probable band (core ± 1h around 24-32h)
    parts.push(`<rect x="${cLo}" y="${ovY - 7}" width="${Math.max(2, cHi - cLo)}" height="14" rx="7" fill="#b92473" opacity="0.38"/>`);
    // most-likely centre
    const mid = (cLo + cHi) / 2;
    parts.push(`<rect x="${mid - 2}" y="${ovY - 12}" width="4" height="24" rx="2" fill="#b92473" opacity="0.85"/>`);
    parts.push(`<text x="${ovHi + 6}" y="${ovY + 4}" font-size="9.5" fill="#86184f">EST. OVULATION WINDOW${ep.standingSeen ? "" : " (widened: no standing heat observed)"}</text>`);
    // onset marker
    if (ep.onsetEstimate && ep.onsetEstimate.best) {
      const ox = x(ep.onsetEstimate.best.getTime());
      parts.push(`<path d="M${ox} ${ovY - 14} l5 8 h-10 z" fill="#86184f"/>`);
      parts.push(`<text x="${ox}" y="${ovY + 22}" font-size="9" fill="#86184f" text-anchor="middle">ONSET EST.</text>`);
    }

    /* --- lane 3: AI + coverage verdicts --- */
    ep.aiCoverage.forEach((c) => {
      const px = x(c.at.getTime());
      const yA = laneY(2);
      const color = { prime: "#2e8a4f", good: "#4164b5", early: "#cf9110", late: "#a33327" }[c.band] || "#59452f";
      parts.push(`<rect x="${px - 3}" y="${yA - 12}" width="6" height="24" rx="2" fill="${color}"/>`);
      parts.push(`<text x="${px}" y="${yA - 16}" font-size="9.5" font-weight="700" fill="${color}" text-anchor="middle">${svgEsc(c.label)}</text>`);
      parts.push(`<text x="${px}" y="${yA + 26}" font-size="9" fill="${color}" text-anchor="middle">${c.band === "prime" ? "PRIME" : c.band.toUpperCase()}</text>`);
    });

    /* --- lane 4: logistics bands (semen / technician) --- */
    const yL = laneY(3);
    const segs = (logs || []).filter((l) => l.from && l.to);
    if (segs.length) {
      segs.forEach((s) => {
        const f = new Date(s.from).getTime(), t2 = new Date(s.to).getTime();
        if (t2 < lo || f > hi) return;
        const x1 = x(Math.max(f, lo)), x2 = x(Math.min(t2, hi));
        const col = s.type === "semen" ? (s.available ? "#4164b5" : "#1c110a") : (s.available ? "#2e8a4f" : "#cf9110");
        const yB = s.type === "semen" ? yL - 12 : yL + 4;
        parts.push(`<rect x="${x1}" y="${yB}" width="${Math.max(2, x2 - x1)}" height="8" rx="4" fill="${col}" opacity="0.75"/>`);
      });
    } else {
      parts.push(`<text x="${PADL + 8}" y="${yL + 6}" font-size="9.5" fill="#a58d6f" font-style="italic">no semen/technician gaps logged — add them in Settings → Reproduction → Availability</text>`);
    }

    return `<svg viewBox="0 0 ${W} ${height}" class="detective-svg" role="img" aria-label="Heat detective timeline">${parts.join("")}</svg>`;
  };

  /* ---------------- Evidence bars ---------------- */

  const evidenceBars = (ep) => {
    const rows = Object.values(ep.signs).sort((a, b) => b.score - a.score);
    if (!rows.length) return JF.Utils.el("div", { class: "field__hint" }, "No observations recorded for this episode yet.");
    const wrap = JF.Utils.el("div", { class: "evidence-bars" });
    rows.forEach((p) => {
      const pct = Math.round(p.score * 100);
      wrap.appendChild(JF.Utils.el("div", { class: "evidence-row" }, [
        JF.Utils.el("span", { class: "evidence-row__label" }, p.label),
        JF.Utils.el("div", { class: "evidence-row__track" }, [
          JF.Utils.el("div", { class: "evidence-row__fill", style: { width: `${pct}%` } }),
        ]),
        JF.Utils.el("span", { class: "evidence-row__val" }, pct >= 100 ? "STRONG" : pct >= 50 ? "HIGH" : pct >= 30 ? "MEDIUM" : "LOW"),
      ]));
    });
    return wrap;
  };

  /* ---------------- Confidence dial ---------------- */

  const confidenceDial = (ep) => {
    const pct = ep.evidencePct;
    const why = JF.ReproIntel.why(ep);
    const tone = why.confidence === "High" ? "good" : why.confidence === "Medium" ? "mid" : "low";
    return JF.Utils.el("div", { class: "confidence-card" }, [
      JF.Utils.el("div", { class: "confidence-card__pct" }, `${pct}%`),
      JF.Utils.el("div", { class: "confidence-card__label" }, `STANDING-HEAT EVIDENCE${ep.standingSeen ? "" : " · OBSERVATION-BASED"}`),
      JF.Utils.el("div", { class: `confidence-card__tone confidence-card__tone--${tone}` }, `${why.confidence} confidence`),
      JF.Utils.el("div", { class: "confidence-card__note" }, "Observation-based confidence — not a veterinary diagnosis."),
    ]);
  };

  /* ---------------- Why panel ---------------- */

  const whyPanel = (ep) => {
    const w = JF.ReproIntel.why(ep);
    return JF.Utils.el("div", { class: "card why-card" }, [
      JF.Utils.el("div", { class: "card__eyebrow" }, "WHY DOES THE SYSTEM THINK THIS?"),
      JF.Utils.el("ul", { class: "why-list" }, w.basis.map((b) => JF.Utils.el("li", {}, b))),
      JF.Utils.el("div", { class: "why-conf" }, `Confidence: ${w.confidence}`),
    ]);
  };

  /* ---------------- AI coverage list ---------------- */

  const coverageList = (ep) => {
    if (!ep.aiCoverage.length) return JF.Utils.el("div", { class: "field__hint" }, "No AI recorded in this episode.");
    const wrap = JF.Utils.el("div", { class: "coverage-list" });
    ep.aiCoverage.forEach((c) => {
      const cls = { prime: "good", good: "good", early: "mid", late: "late" }[c.band];
      wrap.appendChild(JF.Utils.el("div", { class: "coverage-item" }, [
        JF.Utils.el("div", { class: "coverage-item__time" }, c.label),
        JF.Utils.el("div", { class: "coverage-item__track" }, [
          JF.Utils.el("div", { class: `coverage-item__fill coverage-item__fill--${cls}`, style: { width: "100%" } }),
        ]),
        JF.Utils.el("div", { class: `coverage-item__verdict coverage-item__verdict--${cls}` },
          c.band === "prime" ? "PRIME COVERAGE" : c.band === "good" ? "GOOD COVERAGE" : c.band === "early" ? "EARLY" : "LATE — WATCH RETURN"),
        JF.Utils.el("div", { class: "coverage-item__note" }, c.note),
      ]));
    });
    return wrap;
  };

  /* ---------------- Event journal (photo evidence) ---------------- */

  const eventJournal = (ep) => {
    const wrap = JF.Utils.el("div", { class: "timeline" });
    ep.events.forEach((e) => {
      const isAI = e.kind === "ai";
      const title = isAI ? `💉 AI${e.raw.SemenBullID ? " · " + e.raw.SemenBullID : ""}` : `🔥 ${(e.signs || []).slice(0, 2).join(", ") || "Observation"}`;
      const photos = e.raw && (e.raw.PhotoURL || e.raw.Photos);
      wrap.appendChild(JF.Utils.el("div", { class: "timeline__item" }, [
        JF.Utils.el("div", { class: `timeline__dot ${isAI ? "timeline__dot--finance" : ""}`, html: JF.Utils.svgIcon(isAI ? "syringe" : "fire", 10, 10) }),
        JF.Utils.el("div", { class: "timeline__date" }, JF.Utils.formatDate(e.at, "d MMM · HH:mm")),
        JF.Utils.el("div", { class: "timeline__title" }, title),
        JF.Utils.el("div", { class: "timeline__desc" }, photos ? "📷 photo attached" : ""),
      ]));
    });
    return wrap;
  };

  /* ---------------- Page render ---------------- */

  let selectedCow = null;

  const render = async (path = []) => {
    const root = $();
    JF.Utils.clear(root);
    const data = await loadCowData();
    const cows = femaleCows(data.animals);
    // Default to the cow with the most recent heat story, not just the first row:
    // opening the detective should land on a page that shows a timeline.
    if (!selectedCow || !cows.find((c) => c.AnimalID === selectedCow)) {
      const latestHeat = {};
      data.heats.forEach((h) => { if (!latestHeat[h.AnimalID] || latestHeat[h.AnimalID] < h.HeatDate) latestHeat[h.AnimalID] = h.HeatDate; });
      const ranked = cows.slice().sort((a, b) => String(latestHeat[b.AnimalID] || "").localeCompare(String(latestHeat[a.AnimalID] || "")));
      selectedCow = (ranked.find((c) => latestHeat[c.AnimalID]) || cows[0])?.AnimalID || null;
    }

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "🕵 REPRODUCTION"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, "Heat Detective"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Pick a cow, read the story: observations, estimated onset, ovulation window, AI timing coverage, return-heat alerts and farm logistics — one graph, honest uncertainty."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", { class: "btn btn--accent btn--sm", onclick: () => JF.QuickEntry.openForm("observe") }, "+ Observation"),
      ]),
    ]));

    if (!cows.length) {
      page.appendChild(JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-6)" } },
        "No active female cows yet. Add animals first, then the detective has someone to investigate."));
      root.appendChild(page);
      return;
    }

    // Cow selector
    const sel = JF.Utils.el("select", { class: "select", style: { maxWidth: "340px", marginBottom: "var(--space-5)" }, onchange: (e) => { selectedCow = e.target.value; render(path); } },
      cows.map((c) => JF.Utils.el("option", { value: c.AnimalID, selected: c.AnimalID === selectedCow ? true : null }, `${c.Name} (${c.AnimalID}) · ${c.CurrentStatus || ""}`)));
    page.appendChild(sel);

    const episodes = JF.ReproIntel.episodesFor(selectedCow, { heats: data.heats, inseminations: data.insem, healths: data.healths, animals: data.animals });

    if (!episodes.length) {
      page.appendChild(JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-6)" } },
        "No heat observations or AIs recorded for this cow yet. Tap \"+ Observation\" to start the story."));
      root.appendChild(page);
      return;
    }

    // Latest episode first
    const availLogs = await (async () => {
      try { return JSON.parse(await JF.Store.settings.get("availability_log")?.value || "[]"); } catch (e) { return []; }
    })();
    episodes.slice().reverse().forEach((ep, i) => {
      const logs = availLogs;
      const card = JF.Utils.el("div", { class: "card episode-card", style: { marginBottom: "var(--space-6)" } });
      card.appendChild(JF.Utils.el("div", { class: "card__header" }, [
        JF.Utils.el("div", {}, [
          JF.Utils.el("div", { class: "card__eyebrow" }, `REPRODUCTIVE EPISODE · ${JF.Utils.formatDate(ep.start, "d MMM yyyy")}`),
          JF.Utils.el("h3", { class: "section__title", style: { margin: 0 } },
            `Episode ${episodes.length - i} — ${ep.observations.length} observation(s), ${ep.aiCoverage.length} AI(s)`),
        ]),
        ep.returnHeat && ep.returnHeat.possible
          ? JF.Utils.el("span", { class: "badge badge--danger" }, "POSSIBLE RETURN TO HEAT")
          : JF.Utils.el("span", { class: "badge badge--success" }, `${ep.standingSeen ? "STANDING SEEN" : "PARTIAL EVIDENCE"}`),
      ]));

      // Return heat alert block
      if (ep.returnHeat && ep.returnHeat.possible) {
        card.appendChild(JF.Utils.el("div", { class: "alert alert--danger", style: { margin: "var(--space-3) var(--space-4) 0" } }, [
          JF.Utils.el("strong", {}, "Possible return to heat after AI. "),
          ep.returnHeat.note + ` Interval: ~${ep.returnHeat.intervalDays} days. Review the episode before scheduling the next AI.`,
        ]));
      }

      const body = JF.Utils.el("div", { class: "episode-body", style: { padding: "var(--space-4)" } }, [
        JF.Utils.el("div", { class: "grid grid--cols-2", style: { marginBottom: "var(--space-4)" } }, [
          evidenceBars(ep),
          confidenceDial(ep),
        ]),
        JF.Utils.el("div", { style: { overflowX: "auto", marginBottom: "var(--space-4)" } },
          JF.Utils.el("div", { style: { minWidth: "720px" }, html: buildTimelineSVG(ep, logs) })),
        JF.Utils.el("div", { class: "grid grid--cols-2", style: { marginBottom: "var(--space-4)" } }, [
          coverageList(ep),
          JF.Utils.el("div", {}, [
            whyPanel(ep),
            JF.Utils.el("div", { class: "card", style: { marginTop: "var(--space-4)" } }, [
              JF.Utils.el("div", { class: "card__eyebrow" }, "WHAT HAPPENS NEXT?"),
              JF.Utils.el("ul", { class: "why-list" }, ep.actions.map((a) =>
                JF.Utils.el("li", {}, `${a.text}`))),
            ]),
          ]),
        ]),
        JF.Utils.el("div", { class: "card__eyebrow", style: { marginBottom: "var(--space-2)" } }, "EPISODE JOURNAL"),
        eventJournal(ep),
      ]);
      card.appendChild(body);
      page.appendChild(card);
    });

    root.appendChild(page);
  };

  return { render };
})();
