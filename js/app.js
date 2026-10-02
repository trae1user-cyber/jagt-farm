JF.App = (function () {
  const ROUTES = [
    { id: "dashboard",  title: "Dashboard",  icon: "dashboard", group: "Home",  render: () => JF.Views.Dashboard.render() },
    { id: "animals",    title: "Animals",    icon: "animals",   group: "Herd",
      subs: ["all","add","groups","calves","pregnant","open","heat","dry","sick","sold","deceased"],
      render: (p) => JF.Views.Animals.render(p) },
    { id: "animal",     title: "Animal",     icon: "animals",   group: "Herd", hidden: true, render: (p) => JF.Views.AnimalProfile.render(p) },
    { id: "reproduction",title:"Reproduction",icon:"heart",     group: "Herd",
      subs: ["heat","calendar","insemination","pregnancy","calving","reports"],
      render: (p) => JF.Views.Reproduction.render(p) },
    { id: "detective",  title: "Heat Detective", icon: "search",  group: "Herd", render: (p) => JF.Views.HeatDetective.render(p) },
    { id: "health",     title: "Health",     icon: "health",    group: "Herd",
      subs: ["records","treatments","vaccination","deworming","diseases","reports"],
      render: (p) => JF.Views.Health.render(p) },
    { id: "calves",     title: "Calves",     icon: "baby",      group: "Herd",
      subs: ["births","management","growth","history"],
      render: (p) => JF.Views.Calves.render(p) },
    { id: "finance",    title: "Finance",    icon: "finance",   group: "Operations",
      subs: ["expenses","purchases","sales","journal","ledger","trialbalance","pl","balancesheet","cashbook","bankbook"],
      render: (p) => JF.Views.Finance.render(p) },
    { id: "documents",  title: "Documents",  icon: "docs",      group: "Operations",
      subs: ["animal","veterinary","purchase","sale","invoices","certificates","other"],
      render: (p) => JF.Views.Documents.render(p) },
    { id: "calendar",   title: "Calendar",   icon: "calendar",  group: "Operations", render: () => JF.Views.Calendar.render() },
    { id: "reminders",  title: "Reminders",  icon: "bell",      group: "Operations", render: () => JF.Views.Reminders.render() },
    { id: "rules",      title: "Rules",      icon: "analytics", group: "Operations",
      subs: ["overview","rules","parameters","overrides","quality"],
      render: (p) => JF.Views.Rules.render(p) },
    { id: "reports",    title: "Reports",    icon: "reports",   group: "Insights", render: (p) => JF.Views.Reports.render(p) },
    { id: "analytics",  title: "Analytics",  icon: "analytics", group: "Insights", render: () => JF.Views.Analytics.render() },
    { id: "settings",   title: "Settings",   icon: "settings",  group: "Insights",
      subs: ["reproduction","health","accounting","general"],
      render: (p) => JF.Views.Settings.render(p) },
  ];

  let currentRoute = null;

  const sidebarNav = () => {
    const nav = document.getElementById("nav-main");
    if (!nav) return;
    JF.Utils.clear(nav);

    const groups = {};
    ROUTES.forEach((r) => {
      if (r.hidden) return;
      if (!groups[r.group]) groups[r.group] = [];
      groups[r.group].push(r);
    });

    Object.entries(groups).forEach(([groupName, routes]) => {
      const group = JF.Utils.el("div", { class: "nav-group" });
      group.appendChild(JF.Utils.el("div", { class: "nav-group__title" }, groupName));
      routes.forEach((r) => {
        const item = JF.Utils.el("a", {
          href: `#${r.id}`,
          class: `nav-item ${currentRoute?.id === r.id ? "is-active" : ""}`,
          "data-route": r.id,
          onclick: () => navigate(`#${r.id}`),
        }, [
          JF.Utils.el("span", { class: "nav-item__icon", html: JF.Utils.svgIcon(r.icon, 18, 18) }),
          JF.Utils.el("span", {}, r.title),
          JF.Utils.el("span", { class: "nav-item__count", id: `count-${r.id}`, style: { display: "none" } }, "0"),
        ]);
        group.appendChild(item);
      });
      nav.appendChild(group);
    });
  };

  // Sidebar photo footer (photo cropped from the farm's own banner image)
  const photo = document.getElementById("sidebar-photo");
  if (photo) {
    const img = new Image();
    img.onload = () => { photo.style.backgroundImage = `url('${img.src}')`; };
    img.onerror = () => { photo.style.display = "none"; };
    img.src = "assets/sidebar-cow.jpg";
  }

  const parseHash = () => {
    const raw = (location.hash || "#dashboard").replace(/^#/, "");
    const parts = raw.split("/").filter(Boolean);
    return { id: parts[0] || "dashboard", parts };
  };

  const resolveRoute = (parts) => {
    const id = parts[0] || "dashboard";
    let route = ROUTES.find((r) => r.id === id);
    if (!route) {
      route = ROUTES.find((r) => r.id === "animals") || ROUTES[0];
      if (id.length >= 6 && /^[a-z]+-[0-9]+$/i.test(id)) {
        route = ROUTES.find((r) => r.id === "animal");
        return { route, path: ["animal", id] };
      }
    }
    return { route, path: parts };
  };

  // Serialized renders: navigations queue behind each other, so a slow async
  // render of an old route can never interleave with (or overwrite) a newer
  // one — the "stale screen after quick tap-tap-tap" race is impossible by
  // construction. A token also lets a queued render bail out if an even newer
  // navigation arrives while it waits.
  let renderToken = 0;
  let renderQueue = Promise.resolve();
  const route = async () => {
    const token = ++renderToken;
    const myRun = renderQueue.then(async () => {
      if (token !== renderToken) return; // superseded while queued
      const { route, path } = resolveRoute(parseHash().parts);
      if (!route) return;
      currentRoute = route;

      document.querySelectorAll(".nav-item").forEach((n) => {
        n.classList.toggle("is-active", n.dataset.route === (route.id === "animal" ? "animals" : route.id));
      });
      document.title = `${route.title} — Jagt Farm Cattle Management`;

      try {
        const viewEl = document.getElementById("view-container");
        viewEl.classList.remove("view--fade-in");
        void viewEl.offsetWidth;
        viewEl.classList.add("view--fade-in");
        if (typeof route.render === "function") {
          await route.render(path);
        }
      } catch (e) {
        console.error("Route render error:", e);
        const root = document.getElementById("view-container");
        root.innerHTML = `<div class="page"><div class="card card--danger"><h3>Error loading page</h3><p>${e.message}</p></div></div>`;
      }
    });
    renderQueue = myRun.catch(() => {});
    await myRun;
    if (token === renderToken) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navigate = (hash) => {
    if (!hash.startsWith("#")) hash = `#${hash}`;
    if (location.hash === hash) { route(); return; }
    location.hash = hash;
  };

  const updateBadgeCounts = async () => {
    try {
      const reminders = (await JF.Store?.reminders?.list()) || [];
      const pending = reminders.filter((r) => !["Completed","Dismissed"].includes(r.Status)).length;
      const badge = document.getElementById("notif-count");
      if (badge) {
        if (pending > 0) { badge.style.display = ""; badge.textContent = pending > 99 ? "99+" : String(pending); }
        else badge.style.display = "none";
      }
      // Sub nav counts
      const setCount = (id, n) => {
        const el = document.getElementById(`count-${id}`);
        if (!el) return;
        if (n > 0) { el.style.display = ""; el.textContent = n > 99 ? "99+" : String(n); }
        else el.style.display = "none";
      };
      const animals = (await JF.Store?.animals?.list()) || [];
      const active = animals.filter((a) => a.CurrentStatus !== "Sold" && a.CurrentStatus !== "Deceased");
      setCount("animals", active.length);
      setCount("reminders", reminders.filter((r) => ["Due Today","Overdue"].includes(r.Status)).length);
      setCount("health", animals.filter((a) => ["Under Treatment","Sick"].includes(a.CurrentStatus)).length);
      setCount("reproduction", animals.filter((a) => ["Pregnant","In Heat"].includes(a.CurrentStatus)).length);
    } catch (e) { console.warn("Badge counts:", e); }
  };

  const initSidebarToggle = () => {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.querySelector(".app-backdrop");
    const toggle = document.getElementById("btn-toggle-sidebar");
    if (!sidebar || !toggle) return;
    const openNav = () => { sidebar.classList.add("is-open"); backdrop?.classList.add("is-open"); toggle?.setAttribute("aria-expanded", "true"); };
    const closeNav = () => { sidebar.classList.remove("is-open"); backdrop?.classList.remove("is-open"); toggle?.setAttribute("aria-expanded", "false"); };
    toggle.addEventListener("click", () => {
      if (sidebar.classList.contains("is-open")) closeNav();
      else openNav();
    });
    backdrop?.addEventListener("click", closeNav);
    document.querySelectorAll("[data-sidebar-dismiss]").forEach((n) => n.addEventListener("click", closeNav));
    // Desktop: open by default
    if (window.innerWidth > 1024) { sidebar.classList.remove("is-open"); /* fixed layout */ }
    else { closeNav(); }
    window.addEventListener("resize", () => { if (window.innerWidth > 1024) closeNav(); else if (window.innerWidth <= 768) closeNav(); });
  };

  const onHashChange = () => { route(); };

  const start = async () => {
    // Initialize store if not already
    if (!JF.Store) console.warn("JF.Store missing — data layer did not load.");
    // Force reseed when requested by verification tooling (flag lives in the data layer)
    const force = JF.Store.consumeForceSeed ? JF.Store.consumeForceSeed() : false;
    // Demo data: only when explicitly requested via Settings (or ?demo=1), OR when the
    // verification tooling forces a reseed. A real user starts with a clean farm.
    const wantsDemo = force || new URLSearchParams(location.search).get("demo") === "1"
      || (JF.Store.getConfig("demo_data") === "1");
    try {
      const seeded = wantsDemo ? await JF.Seed.run({ force }) : false;
      if (seeded) console.info("[JF] Demo data seeded.");
    } catch (e) { console.warn("Seed failed:", e); }

    // Init cascade listeners
    try { JF.Cascade.init(); } catch (e) { console.warn(e); }

    // Age-based calf care plan (auto deworming/vaccination reminders)
    try { JF.CareSchedule.init(); } catch (e) { console.warn("CareSchedule init failed:", e); }
    try { JF.LifeCycle.init(); } catch (e) { console.warn("LifeCycle init failed:", e); }

    // Router registration (the first render happens further down, after the
    // sidebar is built — it must exist before the view paints).
    window.addEventListener("hashchange", onHashChange);

    // CRITICAL: bridge adapter data-change events into the CascadeEngine pub/sub so
    // the reminder/accounting/status subscribers actually fire. The engine must only
    // subscribe once (double subscription would duplicate every reminder).
    try {
      if (!JF.Store.isBridged || !JF.Store.isBridged()) {
        JF.Store.on("change", ({ entity, action, record }) => {
          if (action === "create" && record) JF.Cascade.fire(`${entity}:created`, record);
          if (action === "update" && record) JF.Cascade.fire(`${entity}:updated`, record);
        });
        if (JF.Store.markBridged) JF.Store.markBridged();
      }
    } catch (e) { console.warn("Cascade bridge failed:", e); }

    // Database-driven rule engine: loads Rules / Rule_Parameters / Rule_Overrides and
    // recomputes every reminder from the real entries. It supersedes the fixed
    // care plan above, so from here on the stored Rulebook drives behaviour.
    // Runs in the BACKGROUND: boot no longer waits for it.
    (async () => {
      try {
        const stats = await JF.RuleEngine.init();
        console.info(`[JF] Rule engine armed: ${stats.total} rules (${stats.active} active) from ${stats.source}.`);
        updateBadgeCounts();
        // Re-evaluate only the animals touched by a new ENTRY, so saving stays fast.
        // Reminders/rules/audit are excluded: reacting to those would make the engine
        // re-enter itself while it is writing its own output.
        const ENTRY_ENTITIES = new Set(["animals", "heat", "insemination", "pregnancy", "calving",
          "health", "deworming", "vaccination", "dryOff", "death", "purchases", "sales"]);
        // Deleting (or editing) an entry can invalidate reminders that were
        // computed from it — e.g. a heat recorded by mistake, then removed. The
        // server's delete reply carries no AnimalID, so a herd-wide recompute
        // (debounced) supersedes the stale reminders instead of leaving them.
        let resweepTimer = null;
        const scheduleResweep = () => {
          clearTimeout(resweepTimer);
          resweepTimer = setTimeout(() => { JF.RuleEngine.evaluateAll().catch(() => {}); }, 2000);
        };
        JF.Store.on("change", ({ entity, action, record }) => {
          if (!ENTRY_ENTITIES.has(entity)) return;
          if (action === "create" && record) {
            const id = record.AnimalID || (entity === "animals" ? record.id : null);
            if (id) JF.RuleEngine.evaluateAnimal(id).catch(() => {});
          } else if (action === "delete") {
            scheduleResweep();
          } else if (action === "update" && entity !== "animals" && record) {
            const id = record.AnimalID || null;
            if (id) JF.RuleEngine.evaluateAnimal(id).catch(() => {});
          }
        });
        // Persistence: when the tab is refocused, re-read the rule configuration from
        // the store (MongoDB when the farm API is connected) so edits made elsewhere
        // or on another device are picked up without a manual reload. Edits made here
        // are already written through to the database as they happen, so nothing needs
        // flushing on hide.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") JF.RuleEngine.focus().catch(() => {});
        });
      } catch (e) { console.warn("RuleEngine init failed:", e); }
    })();

    // Wire UI helpers
    sidebarNav();
    initSidebarToggle();
    try { JF.Search.init(); } catch (e) {}
    try { JF.QuickEntry.init(); } catch (e) {}
    try {
      const fab = document.getElementById("fab-quick");
      if (fab) fab.addEventListener("click", () => JF.QuickEntry.openPicker());
    } catch (e) {}

    // First render NOW: the shell (sidebar + topbar) exists, so the dashboard
    // paints immediately from the adapter's warm cache while the rule engine
    // (dozens of round trips on a cold Render instance) runs in the background.
    if (!location.hash) location.hash = "#dashboard";
    route();

    // Listen to data changes to update badge counts
    try {
      JF.Store.on("change", () => updateBadgeCounts());
      JF.Store.on("seeded", () => updateBadgeCounts());
    } catch (e) {}

    // First boot against an empty MongoDB: seed one dummy animal + heat entry so
    // the database, API round trip and rule engine are proven end to end. Runs
    // only when the farm has no animals at all, in the background so a slow
    // first connection never blocks the dashboard.
    (async () => {
      try {
        const animals = await JF.Store.animals.list();
        if (!animals.length) {
          const dummy = await JF.Store.animals.create({
            AnimalID: "COW-0001",
            Name: "Lakshmi",
            Gender: "Female",
            Category: "Cow",
            Breed: "HF Cross",
            DateOfBirth: "2022-03-10",
            CurrentStatus: "Lactating",
            Notes: "First entry — connection test (safe to edit or delete).",
          });
          await JF.Store.heat.create({
            HeatID: "HT-0001",
            AnimalID: dummy.AnimalID || dummy.id,
            HeatDate: JF.Utils.todayISO(),
            ObservationMethod: "Visual",
            Notes: "Seeded heat entry for the connection test.",
          });
          console.info("[JF] MongoDB was empty — seeded dummy animal COW-0001 + heat entry.");
          route(); // re-render with the seeded animal visible
        }
      } catch (e) { console.warn("Dummy seed skipped:", e?.message || e); }
    })();

    // Wire quick-entry button fallback if not already
    console.info("%c🐄 Jagt Farm — Cattle Management System",
      "color:#225830; font-size:16px; font-weight:700; letter-spacing:0.02em;");
    const _backend = JF.Store.homeOf && JF.Store.homeOf("animals") === "mongo" ? "mongo"
      : (localStorage.getItem("jf_backend") || "mock");
    console.info(`%cBackend: ${_backend === "mock" ? "local device (mock) - MongoDB API planned" : "MongoDB farm API (" + (JF.Store.getAdapter()?.endpoint || "") + ")"} · Mode: ${_backend === "mock" ? "development - mock data" : "connected"}`,
      "color:#45504a;");

    // Keep-alive: Render's free tier sleeps the API after ~15 idle minutes and
    // the next visit then waits 30-60 s. While the site is open, a tiny ping
    // every 10 minutes keeps the instance warm. (Tab throttling may delay this
    // in background tabs - that is fine; the first visit of the day still pays
    // the cold start.)
    const ad = JF.Store.getAdapter();
    if (ad && typeof ad.warmup === "function" && _backend !== "mock") {
      setInterval(() => { ad.warmup(); }, 10 * 60 * 1000); // also refreshes the entity cache
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  return { navigate, route, ROUTES, start, updateBadgeCounts };
})();
