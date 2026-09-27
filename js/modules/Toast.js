JF.Toast = (function () {
  const root = () => document.getElementById("toast-root");

  const show = (message, opts = {}) => {
    // Accept either a type string ("success") or an options object.
    if (typeof opts === "string") opts = { type: opts };
    const { type = "default", duration = 3200, action = null } = opts;
    const t = JF.Utils.el("div", {
      class: `toast toast--${type === "default" ? "" : type}`,
      role: "status",
    });

    let iconSvg = JF.Utils.svgIcon("check", 16, 16);
    if (type === "error") iconSvg = JF.Utils.svgIcon("close", 16, 16);
    if (type === "warning") iconSvg = JF.Utils.svgIcon("warning", 16, 16);

    t.appendChild(JF.Utils.el("span", { class: "toast__icon", html: iconSvg }));
    t.appendChild(JF.Utils.el("span", {}, message));
    if (action && action.label) {
      t.appendChild(JF.Utils.el("a", {
        href: action.href || "#", style: { marginLeft: "10px", fontWeight: 700, textDecoration: "underline", whiteSpace: "nowrap" },
        onclick: () => { if (typeof action.onClick === "function") action.onClick(); },
      }, action.label));
    }

    root().appendChild(t);
    requestAnimationFrame(() => t.classList.add("is-shown"));
    setTimeout(() => {
      t.classList.remove("is-shown");
      setTimeout(() => t.remove(), 400);
    }, duration);
    return t;
  };

  const success = (m, opts) => show(m, { ...opts, type: "success" });
  const error = (m, opts) => show(m, { ...opts, type: "error" });
  const warning = (m, opts) => show(m, { ...opts, type: "warning" });

  return { show, success, error, warning };
})();
