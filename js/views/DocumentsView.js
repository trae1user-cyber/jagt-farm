JF.Views = JF.Views || {};
JF.Views.Documents = (function () {
  const $ = () => document.getElementById("view-container");

  const SUB = {
    animal:     { label: "Animal",       icon: "animals" },
    veterinary: { label: "Veterinary",   icon: "health" },
    purchase:   { label: "Purchase",     icon: "purchase" },
    sale:       { label: "Sale",         icon: "sale" },
    invoices:   { label: "Invoices",     icon: "money" },
    certs:      { label: "Certificates", icon: "check" },
    other:      { label: "Other",        icon: "docs" },
  };
  // Settings/chart keys -> sub-route keys
  const CAT_KEY = { Animal: "animal", Veterinary: "veterinary", Purchase: "purchase", Sale: "sale", Invoices: "invoices", Certificates: "certs", Other: "other" };

  const subNav = (active) => {
    const row = JF.Utils.el("div", { class: "tabs", style: { marginBottom: "var(--space-5)" } });
    Object.entries(SUB).forEach(([k, v]) => row.appendChild(JF.Utils.el("a", {
      class: `tab ${active === k ? "is-active" : ""}`,
      href: `#documents/${k}`,
      onclick: () => {},
    }, v.label)));
    return row;
  };

  const docCard = (f) => {
    const thumb = JF.Utils.portraitSVG(f.FileName || f.id, "doc");
    return JF.Utils.el("div", { class: "card doc-card", style: { padding: "var(--space-4)" } }, [
      JF.Utils.el("div", { style: { display: "flex", gap: "12px", alignItems: "center" } }, [
        JF.Utils.el("div", {
          class: "stat-icon", style: { width: "46px", height: "46px", flexShrink: 0 },
          html: `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-md)"/>`,
        }),
        JF.Utils.el("div", { style: { minWidth: 0 } }, [
          JF.Utils.el("div", { style: { fontWeight: 600, fontSize: "var(--fs-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, f.FileName || f.id),
          JF.Utils.el("div", { class: "field__hint" }, [
            f.AnimalID ? `${f.AnimalID} · ` : "",
            f.RecordType ? `${f.RecordType} · ` : "",
            JF.Utils.formatDate(f.UploadDate),
          ].join("")),
        ]),
      ]),
      JF.Utils.el("div", { style: { display: "flex", gap: "6px", marginTop: "var(--space-3)" } }, [
        JF.Utils.el("button", {
          class: "btn btn--ghost btn--sm", onclick: () => JF.Modal.open({
            title: f.FileName || f.id, size: "md",
            body: JF.Utils.el("div", {}, [
              JF.Utils.el("img", { src: thumb, style: { width: "100%", borderRadius: "var(--radius-md)" } }),
              JF.Utils.el("dl", { style: { marginTop: "var(--space-4)", fontSize: "var(--fs-sm)", lineHeight: 1.9 } }, [
                ["File ID", f.FileID || f.id], ["Category", f.Category], ["Linked animal", f.AnimalID || "—"],
                ["Record", f.RecordID ? `${f.RecordType} ${f.RecordID}` : "—"], ["Upload date", JF.Utils.formatDate(f.UploadDate)],
                ["File URL", f.DriveURL || f.url || "stored with the record"],
              ].map(([k, v]) => JF.Utils.el("div", { style: { display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--color-ink-100)" } }, [
                JF.Utils.el("dt", { class: "field__hint" }, k), JF.Utils.el("dd", { style: { margin: 0, fontWeight: 600 } }, String(v ?? "")),
              ]))),
            ]),
          }),
        }, "Preview"),
        JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => JF.Toast.show("Download will be served by the farm API once connected.", "success") }, "Download"),
      ]),
      f.Notes ? JF.Utils.el("div", { class: "field__hint", style: { marginTop: "8px" } }, f.Notes) : null,
    ].filter(Boolean));
  };

  const uploadModal = () => {
    const wrap = JF.Utils.el("div", { class: "form-stack" });
    const mkField = (label, id, opts = {}) => JF.Utils.el("div", { class: "field" }, [
      JF.Utils.el("label", { class: "field__label" }, label),
      opts.options
        ? JF.Utils.el("select", { class: "select", id }, opts.options.map((o) => JF.Utils.el("option", { value: o }, o)))
        : JF.Utils.el("input", { class: "input", type: opts.type || "text", id, placeholder: opts.ph || "" }),
    ]);
    wrap.appendChild(mkField("Category", "up-cat", { options: Object.keys(CAT_KEY) }));
    wrap.appendChild(mkField("File name", "up-name", { ph: "e.g. vaccination-cert-VAC-101.pdf" }));
    wrap.appendChild(mkField("Linked animal (optional)", "up-animal", { ph: "e.g. COW-005" }));
    wrap.appendChild(mkField("Record reference (optional)", "up-ref", { ph: "e.g. VAC-101" }));
    wrap.appendChild(mkField("Notes", "up-notes"));
    const live = JF.PhotoUpload.backendLive();
    const fileInput = JF.Utils.el("input", { class: "input", type: "file", id: "up-file" });
    wrap.appendChild(JF.Utils.el("div", { class: "field" }, [
      JF.Utils.el("label", { class: "field__label" }, live ? "File (uploads straight to the server)" : "File (backend not connected - metadata only)"),
      fileInput,
      JF.Utils.el("div", { class: "field__hint" },
        live
          ? "The file is stored on the server alongside its record and its link is saved here."
          : "Connect the farm API in Settings to store the actual file."),
    ]));
    JF.Modal.open({
      title: "Upload Document", size: "md", body: wrap,
      footer: [
        JF.Utils.el("button", { class: "btn btn--ghost", onclick: () => JF.Modal.close() }, "Cancel"),
        JF.Utils.el("button", {
          class: "btn btn--primary", onclick: async (ev) => {
            const btn = ev.currentTarget;
            const category = document.getElementById("up-cat").value;
            const animalId = document.getElementById("up-animal").value.trim();
            const recordId = document.getElementById("up-ref").value.trim();
            const notes = document.getElementById("up-notes").value.trim();
            const picked = document.getElementById("up-file").files?.[0] || null;
            const name = document.getElementById("up-name").value.trim() || (picked ? picked.name : "");
            if (!name) { JF.Toast.show("Give the document a name or choose a file.", "danger"); return; }

            if (picked && live) {
              btn.disabled = true;
              btn.textContent = "Uploading...";
              try {
                const res = await JF.PhotoUpload.uploadDocument(picked, { category, animalId, recordId, kind: "Document" });
                JF.Toast.show(res.mode === "drive" ? "Document uploaded to the server." : "Upload failed - metadata saved only.", res.mode === "drive" ? "success" : "warning");
              } catch (err) {
                JF.Toast.show(`Upload failed: ${err.message}`, "danger");
              } finally {
                btn.disabled = false;
                btn.textContent = "Upload Document";
              }
            } else {
              await JF.Store.files.create({
                FileID: `FILE-${JF.Utils.uid()}`, FileName: name,
                Category: category,
                AnimalID: animalId || null,
                RecordID: recordId || null,
                RecordType: null, DriveURL: null, UploadDate: JF.Utils.todayISO(),
                Notes: notes,
              });
              JF.Toast.show(picked ? "Document registered. Connect the farm API to store the file itself." : "Document registered.", "success");
            }
            JF.Modal.close();
            render();
          },
        }, "Upload Document"),
      ],
    });
  };

  const render = async (path = []) => {
    const sub = path?.[1] || "animal";
    const root = $();
    JF.Utils.clear(root);

    const files = (await JF.Store.files.list().catch(() => [])) || [];
    const norm = (c) => CAT_KEY[c] || "other";
    const inCat = files.filter((f) => norm(f.Category) === sub);
    const counts = {};
    files.forEach((f) => { const k = norm(f.Category); counts[k] = (counts[k] || 0) + 1; });

    const page = JF.Utils.el("div", { class: "page" });
    page.appendChild(JF.Utils.el("div", { class: "page__head-row" }, [
      JF.Utils.el("div", {}, [
        JF.Utils.el("div", { class: "eyebrow" }, "📄 Documents"),
        JF.Utils.el("h1", { class: "page__title", style: { marginTop: "8px" } }, SUB[sub]?.label || "Animal Documents"),
        JF.Utils.el("p", { class: "page__sub", style: { marginTop: "var(--space-2)" } },
          "Metadata registry: every file carries FileID, URL, animal link, record link, filename and upload date. Physical upload waits for the farm API backend."),
      ]),
      JF.Utils.el("div", { class: "page__actions" }, [
        JF.Utils.el("button", { class: "btn btn--ghost btn--sm", onclick: () => JF.Toast.show("Document search lives in the top search bar.", "success") }, "Search"),
        JF.Utils.el("button", { class: "btn btn--primary btn--icon-label btn--sm", html: `${JF.Utils.svgIcon("plus", 14, 14)} Upload Files`, onclick: uploadModal }),
      ]),
    ]));
    page.appendChild(subNav(sub));

    page.appendChild(JF.Utils.el("div", { class: "grid grid--cols-3" },
      inCat.length ? inCat.map(docCard) : [JF.Utils.el("div", { class: "card search-empty", style: { gridColumn: "1 / -1", padding: "var(--space-7)" } },
        `No documents in ${SUB[sub]?.label || "this"} category yet.`)]));

    root.appendChild(page);
  };

  return { render };
})();
