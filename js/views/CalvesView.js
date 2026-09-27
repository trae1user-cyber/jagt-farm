JF.Views = JF.Views || {};
JF.Views.Calves = (function () {
  const $ = () => document.getElementById("view-container");
  const SUB = {
    births:   { label: "Birth Records",   icon: "baby2" },
    manage:   { label: "Calf Management", icon: "calf" },
    growth:   { label: "Growth",          icon: "analytics" },
    history:  { label: "Calf History",    icon: "timeline" },
  };

  const subNav = (active) => {
    const row = JF.Utils.el("div", { class: "tabs", style: { marginBottom: "var(--space-5)" } });
    Object.entries(SUB).forEach(([k, v]) => row.appendChild(JF.Utils.el("a", {
      class: `tab ${active === k ? "is-active" : ""}`, href: `#calves/${k}`,
    }, v.label)));
    return row;
  };

  const stat = (label, value, sub) => JF.Utils.el("div", { class: "card card--stat" }, [
    JF.Utils.el("div", { class: "stat-number" }, String(value ?? "—")),
    JF.Utils.el("div", { class: "card__eyebrow", style: { marginTop: "6px" } }, label),
    sub ? JF.Utils.el("div", { class: "field__hint" }, sub) : null,
  ].filter(Boolean));

  const dataTable = (headers, rows, emptyMsg) => {
    if (!rows.length) return JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-7)" } }, emptyMsg);
    return JF.Utils.el("div", { class: "table-container card" }, JF.Utils.el("table", { class: "table" }, [
      JF.Utils.el("thead", {}, JF.Utils.el("tr", {}, headers.map((h) => JF.Utils.el("th", {}, h)))),
      JF.Utils.el("tbody", {}, rows),
    ]));
  };

  const ageLabel = (dob) => JF.Utils.ageLabel(dob);

  /* ---------- Birth Records ---------- */
  const birthsPage = (calvings, animals) => {
    const name = (id) => animals.find((a) => a.AnimalID === id)?.Name || id || "—";
    return dataTable(["Date", "Mother", "Calf", "Gender", "Weight", "Health", "Type", "Vet"],
      calvings.map((c) => {
        const td = (h) => JF.Utils.el("td", {}, h);
        const th = (h) => JF.Utils.el("td", { html: h });
        const _ = null; // (kept for readability)
        return JF.Utils.el("tr", {}, [
          th(`<strong>${JF.Utils.formatDate(c.Date)}</strong>`),
          td(`${name(c.AnimalID)} (${c.AnimalID || "—"})`),
          c.CalfID ? JF.Utils.el("td", {}, JF.Utils.el("a", { href: `#animal/${c.CalfID}`, style: { fontWeight: 600, color: "var(--color-accent-700)" } }, c.CalfID)) : td("—"),
          td(c.CalfGender || "—"),
          td(c.CalfWeight ? `${c.CalfWeight} kg` : "—"),
          td(c.CalfHealth || "—"),
          td(c.CalvingType || "—"),
          td(c.Veterinarian || "—"),
        ]);
      }),
      "No births recorded yet. Register a calving to create the first birth record.");
  };

  /* ---------- Calf Management ---------- */
  const managePage = (calves, calvings) => {
    const rows = calves.map((c) => {
      const rawAge = JF.Utils.daysBetween(c.DateOfBirth, JF.Utils.today());
      // A calf can legitimately have no birth date yet; show "—" instead of crashing.
      const ageDays = Number.isFinite(rawAge) ? rawAge : null;
      const birth = calvings.find((x) => x.CalfID === c.AnimalID);
      const wean = 180; // days
      const pct = ageDays === null ? 0 : Math.min(100, Math.round((ageDays / wean) * 100));
      return JF.Utils.el("tr", {}, [
        JF.Utils.el("td", { html: `<strong>${c.AnimalID}</strong><br><span class="field__hint">${c.Name || ""}</span>` }),
        JF.Utils.el("td", { html: `${c.Gender || "—"}<br><span class="field__hint">${c.Breed || ""}</span>` }),
        JF.Utils.el("td", { html: `${JF.Utils.ageLabel(c.DateOfBirth)}<br><span class="field__hint">${JF.Utils.formatDate(c.DateOfBirth)}</span>` }),
        JF.Utils.el("td", { html: birth ? `${birth.CalfWeight || "?"} kg<br><span class="field__hint">birth wt</span>` : "—" }),
        JF.Utils.el("td", {}, JF.Utils.el("div", {}, [
          JF.Utils.el("div", { class: "progress", style: { height: "6px", borderRadius: "3px", background: "var(--color-ink-100)", overflow: "hidden", marginBottom: "4px" } },
            JF.Utils.el("div", { style: { width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--color-success-500)" : "var(--color-accent-500)" } })),
          JF.Utils.el("span", { class: "field__hint" }, ageDays === null
            ? "birth date missing"
            : (ageDays >= wean ? "weaning age reached" : `${wean - ageDays}d to weaning`)),
        ])),
        JF.Utils.el("td", {}, JF.Utils.el("span", { class: `badge ${ageDays !== null && ageDays >= wean ? "badge--success" : "badge--info"}` },
          ageDays === null ? "Age unknown" : (ageDays >= wean ? "Wean now" : "Suckling"))),
      ]);
    });
    return dataTable(["Calf", "Sex / Breed", "Age", "Birth weight", "Weaning progress", "Status"],
      rows, "No active calves. Births appear here automatically.");
  };

  /* ---------- Growth (SVG line chart) ---------- */
  const growthPage = (calves, calvings) => {
    if (!calves.length) return JF.Utils.el("div", { class: "card search-empty", style: { padding: "var(--space-7)" } }, "No calves to chart yet.");
    const W = 640, H = 260, PAD = 44;
    const byId = {};
    calves.forEach((c) => { byId[c.AnimalID] = []; });
    calvings.forEach((cv) => { if (byId[cv.CalfID]) byId[cv.CalfID].push({ d: new Date(cv.Date), w: Number(cv.CalfWeight || 0), label: "Birth" }); });
    // Synthetic weigh-in points: birth weight doubling by 60d, tripling by 180d (typical curve)
    const series = calves.map((c, idx) => {
      const pts = byId[c.AnimalID] || [];
      const birth = pts[0]?.w || 35;
      const dobAge = JF.Utils.daysBetween(c.DateOfBirth, JF.Utils.today());
      const age = Number.isFinite(dobAge) ? Math.max(0, dobAge) : 0;
      const w = (ageDays) => Math.round(birth * (1 + (ageDays / 60) * 0.9 + Math.pow(ageDays / 180, 1.6) * 0.6));
      const marks = [0, Math.min(age, 30), Math.min(age, 60), Math.min(age, 120), age].filter((v, i, a) => v === a[i]);
      return {
        id: c.AnimalID,
        color: ["#225830", "#8a3324", "#b58a3c", "#3d5a80"][idx % 4],
        points: marks.map((m) => ({ x: m, y: w(m) })),
      };
    });
    const maxX = Math.max(90, ...series.flatMap((s) => s.points.map((p) => p.x)));
    const maxY = Math.max(80, ...series.flatMap((s) => s.points.map((p) => p.y)));
    const X = (v) => PAD + (v / maxX) * (W - PAD - 12);
    const Y = (v) => H - PAD - (v / maxY) * (H - PAD - 16);
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const y = Y(maxY * f);
      return `<line x1="${PAD}" y1="${y}" x2="${W - 12}" y2="${y}" stroke="var(--color-ink-100)" stroke-width="1"/><text x="8" y="${y + 4}" font-size="10" fill="var(--color-ink-400)">${Math.round(maxY * f)}</text>`;
    }).join("");
    const xTicks = [0, 30, 60, 90, 120, 150, 180].filter((t) => t <= maxX).map((t) =>
      `<text x="${X(t)}" y="${H - PAD + 16}" font-size="10" text-anchor="middle" fill="var(--color-ink-400)">${t}d</text>`).join("");
    const lines = series.map((s) => {
      const path = s.points.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
      const dots = s.points.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.5" fill="${s.color}"/>`).join("");
      return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round"/><circle cx="${X(s.points[0].x).toFixed(1)}" cy="${Y(s.points[0].y).toFixed(1)}" r="2" fill="${s.color}" opacity=".5"/>${dots}`;
    }).join("");
    const legend = series.map((s) =>
      `<span class="chip" style="gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block"></span>${s.id}</span>`).join(" ");

    const svg = JF.Utils.el("div", { class: "card", style: { padding: "var(--space-5)" } }, [
      JF.Utils.el("div", { class: "card__eyebrow" }, "WEIGHT FOR AGE"),
      JF.Utils.el("div", { style: { margin: "10px 0" }, html: legend }),
      JF.Utils.el("div", { html: `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Calf growth chart">${grid}${lines}${xTicks}<line x1="${PAD}" y1="${H - PAD}" x2="${W - 12}" y2="${H - PAD}" stroke="var(--color-ink-400)" stroke-width="1"/><line x1="${PAD}" y1="12" x2="${PAD}" y2="${H - PAD}" stroke="var(--color-ink-400)" stroke-width="1"/></svg>` }),
      JF.Utils.el("div", { class: "field__hint", style: { marginTop: "8px" } }, "Age in days (x) vs weight in kg (y). Points interpolate a standard growth curve between birth weight and today."),
    ]);
    return svg;
  };

  /* ---------- Calf History ---------- */
  const historyPage = async (calves) => {
    const wrap = JF.Utils.el("div", { class: "card", style: { padding: "var(--space-5)" } }, [
      JF.Utils.el("div", { class: "card__eyebrow" }, "LIFECYCLE TIMELINE"),
    ]);
    let added = 0;
    for (const c of calves) {
      const evts = await JF.Timeline.animalFor(c.AnimalID);
      if (!evts.length) continue;
      added++;
      const block = JF.Utils.el("div", { style: { marginTop: "var(--space-4)" } }, [
        JF.Utils.el("a", { class: "chip", href: `#animal/${c.AnimalID}/overview`, style: { marginBottom: "8px" } }, `${c.AnimalID} · ${c.Name || ""}`),
        JF.Utils.el("div", { class: "timeline", style: { marginTop: "8px" } }, evts.slice(0, 8).map((ev) =>
          JF.Utils.el("div", { class: "timeline__item" }, [
            JF.Utils.el("div", { class: `timeline__dot ${ev.DotClass || ""}`, html: JF.Utils.svgIcon(ev.Icon, 10, 10) }),
            JF.Utils.el("div", { class: "timeline__date" }, JF.Utils.formatDate(ev.Date)),
            JF.Utils.el("div", { class: "timeline__title" }, ev.Title),
            JF.Utils.el("div", { class: "timeline__desc" }, ev.Subtitle || ""),
          ]))),
      ]);
      wrap.appendChild(block);
    }
    if (!added) wrap.appendChild(JF.Utils.el("div", { class: "search-empty", style: { padding: "var(--space-4)" } }, "No calf events recorded yet."));
    return wrap;
  };

  /* ---------- Render ---------- */
  const render = async (path = []) => {
    const sub = path?.[1] || "births";
    const root = $();
    JF.Utils.clear(root);
    const [animals, calvings] = await Promise.all([JF.Store.animals.list(), JF.Store.calving.list()]);
    const calves = animals.filter((a) => a.CurrentStatus === "Calf" || (a.DateOfBirth && JF.Utils.ageInYears(a.DateOfBirth) < 1));
    const name = { births: "Birth Records", manage: "Calf Management", growth: "Growth Tracking", history: "Calf History" }[sub] || "Birth Records";

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "👶 Calves"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, name),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Births, colostrum, weaning progress and growth tracking for the youngest members of the herd."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", { class: "btn btn--primary btn--icon-label btn--sm", html: `${JF.Utils.svgIcon("plus", 14, 14)} Register Birth`, onclick: () => JF.QuickEntry?.openPicker() }),
      ]),
    ]));
    page.appendChild(subNav(sub));
    page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-4", style: { marginBottom: "var(--space-5)" } }, [
      stat("ACTIVE CALVES", calves.length),
      stat("BIRTHS RECORDED", calvings.length),
      stat("WEANING AGE (d)", 180),
      stat("YOUNGEST", (() => {
        const ages = calves.map((c) => JF.Utils.daysBetween(c.DateOfBirth, JF.Utils.today())).filter(Number.isFinite);
        return ages.length ? Math.min(...ages) + "d" : "—";
      })()),
    ]));

    if (sub === "births") page.appendChild(birthsPage(calvings, animals));
    else if (sub === "manage") page.appendChild(managePage(calves, calvings));
    else if (sub === "growth") page.appendChild(growthPage(calves, calvings));
    else page.appendChild(await historyPage(calves));

    root.appendChild(page);
  };

  return { render };
})();
