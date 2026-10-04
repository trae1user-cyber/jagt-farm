/* Blank entry canvas.
 *
 * Opens empty. Pick a kind of record and the fields come from the very form
 * Quick Entry already renders for it, and saving runs the very handler Quick
 * Entry runs — so there is no second copy of the field list, no second save
 * path, and the record lands in Mongo and fires the same cross-department
 * links as every other entry. A field added to a Quick Entry form is on the
 * canvas the next time this screen opens, with nothing else changed.
 */
JF.Views = JF.Views || {};
JF.Views.Canvas = (function () {
  const $ = () => document.getElementById("view-container");

  const blank = () => {
    JF.Utils.clear($());
    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "✍️ BLANK ENTRY"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, "Add a record"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Nothing is filled in until you choose. Every record here is saved the same way as the ones entered from a department — it appears everywhere at once."),
      ]),
    ]));
    const grid = JF.Utils.el("div", { class: "grid grid--cols-3" });
    JF.QuickEntry.OPTIONS.forEach((o) => {
      grid.appendChild(JF.Utils.el("button", {
        type: "button", class: "card", style: { padding: "var(--space-4)", textAlign: "left", background: "var(--color-bg)", cursor: "pointer" },
        onclick: () => draw(o.id),
      }, [
        JF.Utils.el("div", { class: "stat-icon", style: { marginBottom: "var(--space-2)" }, html: JF.Utils.svgIcon(o.icon, 20, 20) }),
        JF.Utils.el("div", { style: { fontSize: "var(--fs-sm)", fontWeight: 600 } }, `${o.key} ${o.label}`),
      ]));
    });
    page.appendChild(grid);
    $().appendChild(page);
  };

  const draw = async (id) => {
    const label = JF.QuickEntry.OPTIONS.find((o) => o.id === id)?.label || id;
    JF.Utils.clear($());
    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "✍️ BLANK ENTRY"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, label),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Fill only what this record needs. Fields marked * are required."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: blank }, "← Start again"),
      ]),
    ]));

    const body = await JF.QuickEntry.buildForm(id);
    page.appendChild(JF.Utils.el("div", { class: "card", style: { padding: "var(--space-5)", maxWidth: "720px" } }, body));

    const save = JF.Utils.el("button", { type: "button", class: "btn btn--primary" }, "Save Record");
    save.addEventListener("click", async () => {
      save.disabled = true; save.textContent = "Saving...";
      try {
        const res = await JF.QuickEntry.saveForm(id, body);
        if (!res) { save.disabled = false; save.textContent = "Save Record"; return; } // required field missing
        JF.Toast.show(`${res.label} saved successfully!`, {
          type: "success",
          action: { label: "Go to record", href: `#animal/${res.id}`, onClick: () => JF.App.navigate(`#animal/${res.id}`) },
        });
        blank(); // back to empty, ready for the next record
      } catch (e) {
        console.error(e);
        JF.Toast.show("Failed to save record.", "danger");
        save.disabled = false; save.textContent = "Save Record";
      }
    });
    page.appendChild(JF.Utils.el("div", { style: { marginTop: "var(--space-4)" } }, save));
    $().appendChild(page);
  };

  const render = () => { blank(); };

  return { render };
})();