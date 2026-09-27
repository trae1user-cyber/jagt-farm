window.JF = window.JF || {};

JF.Utils = (function () {
  const uid = (prefix = "") => {
    const s = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    return prefix ? `${prefix}-${s.toUpperCase()}` : s;
  };

  const uidSeq = (storeKey, prefix, pad = 3) => {
    // In-memory sequence counter (UI stays adapter-agnostic; persistence lives in the data layer).
    if (!uidSeq._counters) uidSeq._counters = {};
    const n = (uidSeq._counters[storeKey] || 0) + 1;
    uidSeq._counters[storeKey] = n;
    return `${prefix}${String(n).padStart(pad, "0")}`;
  };

  const money = (n, symbol = "₹") => {
    if (n === null || n === undefined) return `${symbol}0`;
    const v = Number(n);
    return `${symbol}${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  // Date-only strings ("YYYY-MM-DD") are calendar dates; parse them as local
  // midnights so formatDate/addDays never shift a day across timezones
  // (new Date("YYYY-MM-DD") parses as UTC midnight and renders one day early
  // in any timezone west of UTC).
  const parseDate = (date) => {
    if (!date) return null;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, d] = date.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return typeof date === "string" ? new Date(date) : date;
  };

  /** True when the value can actually be read as a date. */
  const isDate = (v) => {
    const d = parseDate(v);
    return !!d && !Number.isNaN(d.getTime && d.getTime());
  };

  const formatDate = (date, fmt = "dd MMM yyyy") => {
    if (!date) return "";
    const d = parseDate(date);
    if (isNaN(d)) return "";
    const pad = (n) => String(n).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const map = {
      dd: pad(d.getDate()),
      d: String(d.getDate()),
      MM: pad(d.getMonth() + 1),
      yyyy: d.getFullYear(),
      MMM: months[d.getMonth()],
      HH: pad(d.getHours()),
      mm: pad(d.getMinutes()),
      hh: pad(((d.getHours() + 11) % 12) + 1),
      a: d.getHours() < 12 ? "AM" : "PM",
    };
    return fmt.replace(/dd|d|MMM|MM|yyyy|HH|mm|hh|a/g, (m) => map[m]);
  };

  const addDays = (date, days) => {
    const parsed = parseDate(date);
    if (!(parsed instanceof Date) || isNaN(parsed)) return parsed;
    const d = new Date(parsed.getTime()); // clone: callers may pass the same Date to several addDays calls
    d.setDate(d.getDate() + days);
    return d;
  };

  // Missing or invalid dates are a real data state (a calf recorded without a
  // birth date, for example), so this returns NaN instead of throwing - every
  // caller can then show "—" rather than taking the whole page down.
  const daysBetween = (a, b) => {
    const d1 = parseDate(a); const d2 = parseDate(b);
    if (!d1 || !d2 || Number.isNaN(d1.getTime && d1.getTime()) || Number.isNaN(d2.getTime && d2.getTime())) return NaN;
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  };

  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const todayISO = () => formatDate(today(), "yyyy-MM-dd");

  const ageInYears = (dob) => {
    if (!isDate(dob)) return NaN;
    const d = new Date(dob);
    const diffMs = Date.now() - d.getTime();
    return (diffMs / (365.25 * 24 * 60 * 60 * 1000));
  };

  const ageLabel = (dob) => {
    if (!isDate(dob)) return "—";
    const d = new Date(dob);
    const now = new Date();
    let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (now.getDate() < d.getDate()) months -= 1;
    if (months < 12) return `${months} mo`;
    const y = Math.floor(months / 12);
    const rem = months % 12;
    return rem === 0 ? `${y} yr` : `${y} yr ${rem} mo`;
  };

  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") n.innerHTML = v;
      else if (v === true) n.setAttribute(k, "");
      else if (v !== false && v != null) n.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return n;
  };

  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

  const debounce = (fn, ms = 300) => {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  const svgIcon = (name, w = 18, h = 18) => {
    const paths = {
      dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
      animals: '<path d="M4 9c0-2.5 2.5-5 6-5s6 2.5 6 5c0 2-1 3.5-3 4.5V17a1 1 0 01-1 1H8a1 1 0 01-1-1v-3.5C5.1 12.5 4 11 4 9z"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="13" cy="9" r="1" fill="currentColor"/>',
      heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
      health: '<path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
      baby: '<circle cx="12" cy="8" r="4"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
      finance: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 11h18M7 15h4"/>',
      docs: '<path d="M6 3h8l6 6v12a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v6h6"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
      bell: '<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/>',
      reports: '<path d="M4 4h12v16H4zM16 8h4v12h-4zM8 8h4M8 12h4M8 16h3"/>',
      analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.65 1.65 0 00-1.8-.3 1.65 1.65 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.65 1.65 0 00-1-1.5 1.65 1.65 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.65 1.65 0 00.3-1.8 1.65 1.65 0 00-1.5-1H3a2 2 0 110-4h.1a1.65 1.65 0 001.5-1 1.65 1.65 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.65 1.65 0 001.8.3h.1a1.65 1.65 0 001-1.5V3a2 2 0 114 0v.1a1.65 1.65 0 001 1.5 1.65 1.65 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.65 1.65 0 00-.3 1.8v.1a1.65 1.65 0 001.5 1H21a2 2 0 110 4h-.1a1.65 1.65 0 00-1.5 1z"/>',
      fire: '<path d="M12 2s3 3.5 3 7a3 3 0 01-6 0c0-1 .5-2 1-3 0 2 1 3 2 3 0-4-2-6-2-9 2 0 2 2 2 2z"/>',
      drop: '<path d="M12 2s6 7 6 12a6 6 0 01-12 0c0-5 6-12 6-12z"/>',
      syringe: '<path d="M18 2l4 4-3 3-2-2-7 7-2 2-2 2 2 2 3 3 2-2 2-2 7-7-2-2zM8 14l-4 4-1 1 2 2 1-1 4-4z"/>',
      plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
      search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>',
      close: '<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>',
      check: '<polyline points="4 12 10 18 20 6"/>',
      warning: '<path d="M12 2L2 22h20L12 2z"/><line x1="12" y1="10" x2="12" y2="16"/><circle cx="12" cy="19" r="0.5" fill="currentColor"/>',
      arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
      photo: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><polyline points="21 15 16 10 5 21"/>',
      money: '<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="12" cy="12" r="3"/>',
      purchase: '<path d="M6 2h12l1 5H5zM3 7h18v13a1 1 0 01-1 1H4a1 1 0 01-1-1V7zM9 11v6M15 11v6"/>',
      sale: '<path d="M3 3h18v4H3zM3 9h18l-2 11H5L3 9z"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/>',
      death: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20zM9 9h6M9 15h6"/>',
      treatment: '<path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="5"/>',
      document: '<path d="M6 3h8l6 6v12a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/>',
      eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
      download: '<path d="M12 3v12M6 11l6 6 6-6M4 21h16"/>',
      pregnancy: '<path d="M12 4a4 4 0 00-4 4v3a4 4 0 003 3.9V16a3 3 0 003 3h0a3 3 0 003-3v-1.1A4 4 0 0016 11V8a4 4 0 00-4-4z"/><line x1="8" y1="21" x2="16" y2="21"/>',
      baby2: '<path d="M10 5a2 2 0 114 0M8 13c-1-2 1-4 4-4s5 2 4 4c-3 2-5 2-4 0zM6 14h12l-2 8H8z"/>',
      calf: '<path d="M2 17c0-1.5 1.5-3 4-3h12c2.5 0 4 1.5 4 3v2H2zM6 14c0-3 2-6 6-6s6 3 6 6"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/>',
      hamburger: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
      timeline: '<circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/>',
      clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
    };
    const d = paths[name] || paths.dashboard;
    return `<svg width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  };

  // Deterministic pastel gradient + species silhouette + initial, as an inline SVG data URI.
  // Stable per seedKey so every animal/document keeps the same portrait across reloads.
  const portraitSVG = (seedKey, species = "cattle", shape = "square") => {
    let h = 0;
    const s = String(seedKey || "farm");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    const c1 = `hsl(${hue},32%,72%)`, c2 = `hsl(${(hue + 40) % 360},30%,52%)`;
    const initial = (s.replace(/^[A-Z]+-?/, "").trim() || s).charAt(0).toUpperCase();
    const silhouettes = {
      cattle: '<path d="M30 46c0-7 6-12 14-12h4c-2-4-1-9 3-11 5-2 11-1 13 3 6 1 10 5 10 11l-2 9h-6l-1 5h-8l-1-5h-8l-1 5h-8l-1-5c-5-1-8-5-8-10z"/><circle cx="52" cy="30" r="2.4" fill="#fff" opacity=".85"/><circle cx="60" cy="30" r="2.4" fill="#fff" opacity=".85"/>',
      buffalo: '<path d="M28 48c0-9 8-15 18-15s18 6 18 15l-2 8h-9l-1-5h-12l-1 5h-9zM46 33c-3-4-2-9 2-11M54 33c3-4 2-9-2-11"/>',
      bull: '<path d="M30 46c0-7 6-12 14-12h4c-2-4-1-9 3-11 5-2 11-1 13 3 6 1 10 5 10 11l-2 9h-6l-1 5h-8l-1-5h-8l-1 5h-8l-1-5c-5-1-8-5-8-10z"/><path d="M46 22c-4-4-10-5-14-2M62 22c4-4 10-5 14-2" stroke-width="3"/>',
      calf: '<path d="M38 50c0-6 5-10 11-10s11 4 11 10l-1 6h-6l-1-4h-6l-1 4h-6z"/><circle cx="45" cy="35" r="2" fill="#fff" opacity=".85"/><circle cx="53" cy="35" r="2" fill="#fff" opacity=".85"/>',
      doc: '<path d="M30 20h20l12 12v28a3 3 0 01-3 3H30a3 3 0 01-3-3V23a3 3 0 013-3z"/><path d="M50 20v12h12"/><path d="M35 42h22M35 49h22M35 56h14"/>',
    };
    const sil = silhouettes[species] || silhouettes.cattle;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 84" preserveAspectRatio="xMidYMid slice">`
      + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
      + `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`
      + `<rect width="92" height="84" fill="url(#g)"/>`
      + `<g fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${sil}</g>`
      + `<text x="10" y="76" font-family="'Space Grotesk',sans-serif" font-size="20" font-weight="700" fill="#ffffff" fill-opacity="0.92">${initial}</text>`
      + `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };

  // Back-compat: photoURL(prompt) previously called a remote generator; now returns a
  // deterministic local portrait. The prompt string is used as the seed.
  const photoURL = (prompt, size = "square_hd") => portraitSVG(prompt || "farm", "cattle");

  return {
    uid, uidSeq, money, formatDate, parseDate, isDate, addDays, daysBetween, today, todayISO,
    ageInYears, ageLabel, el, clear, debounce, svgIcon, photoURL, portraitSVG,
  };
})();
