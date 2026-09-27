JF.Modal = (function () {
  const root = () => document.getElementById("modal-root");

  const open = ({ title = "", body = "", footer = "", size = "md", onMount = null, className = "" } = {}) => {
    const r = root();
    r.classList.add("is-open");
    r.removeAttribute("inert");

    const wrap = JF.Utils.el("div", { class: `modal modal--${size} ${className}` });
    const backdrop = JF.Utils.el("div", { class: "modal-backdrop" });

    const bodyEl = JF.Utils.el("div", { class: "modal__body" });
    if (typeof body === "string") bodyEl.innerHTML = body;
    else if (Array.isArray(body)) body.forEach((n) => n instanceof Node && bodyEl.appendChild(n));
    else if (body instanceof Node) bodyEl.appendChild(body);

    const header = JF.Utils.el("div", { class: "modal__header" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("h2", { class: "modal__title" }, title),
      ]),
      JF.Utils.el("button", {
        class: "modal__close", "aria-label": "Close", type: "button",
        html: JF.Utils.svgIcon("close", 18, 18),
        onclick: close,
      }),
    ]);

    const footerEl = JF.Utils.el("div", { class: "modal__footer" });
    if (typeof footer === "string") footerEl.innerHTML = footer;
    else if (Array.isArray(footer)) footer.forEach((n) => n instanceof Node && footerEl.appendChild(n));
    else if (footer instanceof Node) footerEl.appendChild(footer);

    wrap.appendChild(header);
    wrap.appendChild(bodyEl);
    if (footer) wrap.appendChild(footerEl);

    JF.Utils.clear(r);
    r.appendChild(backdrop);
    r.appendChild(wrap);
    backdrop.addEventListener("click", close);

    const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);

    if (typeof onMount === "function") onMount(wrap);
    setTimeout(() => r.classList.add("is-open"), 10);
    return wrap;
  };

  const close = () => {
    const r = root();
    r.classList.remove("is-open");
    r.setAttribute("inert", "");
    setTimeout(() => JF.Utils.clear(r), 300);
  };

  return { open, close };
})();
