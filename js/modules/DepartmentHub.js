window.JF = window.JF || {};

/**
 * Cross-department repaint: a write to one entity updates every screen that
 * reads it, without a reload.
 *
 * The store already emits "change" with the real entity name on every
 * create/update/delete, so this only has to decide WHICH route each entity
 * belongs on and re-render it. "animal" is in nearly every list on purpose —
 * the profile header and timeline carry heat/pregnancy state too.
 */
JF.Departments = (function () {
  const MAP = {
    animals: ["animals", "animal", "dashboard", "calves", "pedigree", "analytics", "reports"],
    heat: ["reproduction", "animal", "detective", "calendar", "reminders", "dashboard", "analytics"],
    insemination: ["reproduction", "animal", "detective", "calendar", "reminders", "finance", "dashboard", "analytics", "reports"],
    pregnancy: ["reproduction", "animal", "detective", "calendar", "reminders", "dashboard", "analytics", "reports"],
    calving: ["reproduction", "animal", "calves", "pedigree", "calendar", "reminders", "dashboard", "analytics", "reports"],
    health: ["health", "animal", "reminders", "finance", "dashboard", "analytics", "reports"],
    deworming: ["health", "animal", "reminders", "finance", "dashboard", "analytics", "reports"],
    vaccination: ["health", "animal", "reminders", "finance", "dashboard", "analytics", "reports"],
    dryOff: ["reproduction", "animal", "reminders", "dashboard", "analytics"],
    death: ["animals", "animal", "dashboard", "analytics", "reports"],
    sales: ["animals", "animal", "finance", "dashboard", "analytics", "reports"],
    purchases: ["animals", "animal", "finance", "dashboard", "analytics", "reports"],
    expenses: ["finance", "animal", "dashboard", "analytics", "reports"],
    milkSales: ["finance", "dashboard", "analytics", "reports"],
    journal: ["finance", "animal", "dashboard", "analytics", "reports"],
    reminders: ["reminders", "animal", "dashboard", "calendar"],
    files: ["documents", "animal"],
    groups: ["animals", "dashboard"],
  };

  const dirty = new Set();
  let timer = null;

  const currentRouteId = () => (location.hash || "#dashboard").replace(/^#/, "").split("/")[0] || "dashboard";

  /** A modal mid-entry must not have the page painted out from under it. */
  const modalOpen = () => {
    const r = document.getElementById("modal-root");
    return !!(r && (r.classList.contains("is-open") || r.children.length));
  };

  const refresh = async () => {
    const here = currentRouteId();
    const affectsCurrent = [...dirty].some((e) => (MAP[e] || []).includes(here));
    dirty.clear();
    if (!affectsCurrent || modalOpen() || typeof JF.App?.route !== "function") return;
    try {
      await JF.App.route();
    } catch (e) {
      console.warn(`[Departments] refresh failed: ${e && e.message || e}`);
    }
  };

  const onChange = ({ entity }) => {
    if (!entity) return;
    dirty.add(entity);
    clearTimeout(timer);
    timer = setTimeout(() => { refresh().catch(() => {}); }, 450);
  };

  const init = () => {
    if (typeof JF.Store?.on === "function") JF.Store.on("change", onChange);
  };

  return { init };
})();