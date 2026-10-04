window.JF = window.JF || {};

/**
 * PhotoUpload - animal photos stored with the farm's backend, offline fallback.
 *
 * Live mode (farm API configured): the photo is compressed in-browser to a
 * data URL and sent to the Node.js API ("uploadFile" action), which stores it
 * in MongoDB GridFS and returns an embed-safe URL. That URL is saved with the
 * record, so every device shows the real photo.
 *
 * Offline mode (no backend yet): a deterministic SVG portrait is generated
 * locally so the UI still works; it is swapped for the real photo once the
 * backend is configured.
 */
JF.PhotoUpload = (function () {

  const MAX_DIM = 1024;   // px - longest edge after downscale
  const JPEG_QUALITY = 0.82;

  const isDataUrl = (u) => typeof u === "string" && u.startsWith("data:image");
  const isStoredLink = isDataUrl; // legacy alias - now means "any stored/remote link"

  /**
   * A base64 data URL can be large, so when the backend is live we only persist
   * real server links; the device-local copy stays in the local store so the UI
   * still shows it offline.
   */
  const remoteSafeUrl = (u) => (backendLive() && isDataUrl(u) ? null : u || null);

  /** True when a real backend adapter with upload support is connected. */
  const backendLive = () => {
    try {
      const ad = JF.Store && JF.Store.getAdapter ? JF.Store.getAdapter() : null;
      return !!(ad && typeof ad.uploadFile === "function" && !ad.isPlaceholder);
    } catch (e) { return false; }
  };

  /** Read + compress an image file to a JPEG data URL (longest edge MAX_DIM). */
  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error("Not an image file")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

  /**
   * Push a data URL to the farm API. Returns the file descriptor:
   * { url (embed-safe), pageUrl, fileId, folder }.
   */
  const uploadToServer = async (dataUrl, meta = {}) => {
    const adapter = JF.Store.getAdapter();
    if (!adapter || typeof adapter.uploadFile !== "function") throw new Error("Backend does not support file uploads");
    const res = await adapter.uploadFile({ dataUrl, ...meta });
    const url = res && (res.url || res.thumbUrl || res.FileURL);
    if (!url) throw new Error("Backend returned no file URL");
    return { url, pageUrl: res.pageUrl || null, fileId: res.fileId || null, folder: res.folder || null };
  };

  /**
   * Full pipeline: file -> compress -> (server | local fallback).
   * Returns { url, pageUrl, fileId, folder, mode: "drive" | "local" }.
   */
  const processFile = async (file, meta = {}) => {
    const dataUrl = await fileToDataUrl(file);
    if (backendLive()) {
      try {
        const up = await uploadToServer(dataUrl, meta);
        return { ...up, mode: "drive" };
      } catch (e) {
        console.warn("Server upload failed, keeping local copy:", e);
        JF.Toast && JF.Toast.show("Server upload failed - file saved on this device only.", "warning");
      }
    }
    return { url: dataUrl, pageUrl: null, fileId: null, folder: null, mode: "local" };
  };

  /** Record the file in the Files index and (optionally) on the animal master. */
  const attachToAnimal = async ({ animalId, url, pageUrl = null, kind = "Profile", fileName = "photo.jpg", category = "Animal" }) => {
    await JF.Store.files.create({
      FileID: `FILE-${JF.Utils.uid()}`,
      FileName: fileName,
      Category: category,
      FileType: /^data:image/.test(url) || /\.(jpg|jpeg|png|webp)$/i.test(fileName) ? "image" : "document",
      AnimalID: animalId || null,
      RecordType: kind,
      RecordID: animalId || null,
      DriveURL: pageUrl || (isStoredLink(url) ? url : null), // legacy field name kept for old records
      LocalURL: remoteSafeUrl(url),
      UploadDate: JF.Utils.todayISO(),        Notes: isStoredLink(url) ? "Stored on the farm server" : "Stored on this device (backend not connected)",
    });
    if (animalId && kind === "Profile") {
      const safe = remoteSafeUrl(url);
      if (!safe) {
        // Server upload failed while a live backend is configured - keep the local
        // copy visible but never push base64 into the farm record.
        JF.Toast && JF.Toast.show("Photo kept on this device only - retry the upload when online.", "warning");
        return;
      }
      const animals = await JF.Store.animals.list();
      const a = animals.find((x) => x.AnimalID === animalId || x.id === animalId);
      if (a) await JF.Store.animals.update(a.id, { PhotoURL: safe });
    }
  };

  /**
   * Upload a DOCUMENT (bill, certificate, vet paper) to the farm server and index it.
   * Documents are not compressed - any file type is accepted as-is.
   */
  const uploadDocument = async (file, { category = "Other", animalId = "", kind = "Document", recordId = "" } = {}) => {
    if (!file) throw new Error("No file selected");
    const dataUrl = await fileToDataUrlAny(file);
    let res;
    if (backendLive()) {
      try {
        res = { ...(await uploadToServer(dataUrl, { animalId, kind, category, fileName: file.name, recordId })), mode: "drive" };
      } catch (e) {
        console.warn("Server document upload failed:", e);
      }
    }
    if (!res) res = { url: dataUrl, pageUrl: null, mode: "local" };
    await JF.Store.files.create({
      FileID: `FILE-${JF.Utils.uid()}`,
      FileName: file.name,
      Category: category,
      FileType: /^image\//.test(file.type) ? "image" : "document",
      AnimalID: animalId || null,
      RecordType: kind,
      RecordID: recordId || animalId || null,
      DriveURL: res.pageUrl || null,
      LocalURL: remoteSafeUrl(res.url),
      UploadDate: JF.Utils.todayISO(),
      Notes: res.mode === "drive" ? "Stored on the farm server" : "Stored on this device (backend not connected)",
    });
    return res;
  };

  /** Read any file (image or document) as a data URL - no canvas downscale. */
  const fileToDataUrlAny = (file) => new Promise((resolve, reject) => {
    if (!file) { reject(new Error("No file")); return; }
    if (file.size > 8 * 1024 * 1024) { reject(new Error("File is larger than 8MB")); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

  /* ---------- Reusable form widget ---------- */

  const photoField = (opts = {}) => {
    const state = { file: null, previewUrl: opts.currentUrl || "" };
    const wrap = JF.Utils.el("div", { class: "field" });
    wrap.appendChild(JF.Utils.el("label", { class: "field__label" }, opts.label || "Animal photo"));

    const preview = JF.Utils.el("img", {
      class: "photo-picker__preview",
      src: opts.currentUrl || JF.Utils.portraitSVG(opts.animalId || "new-animal", opts.species || "cattle"),
      alt: "Photo preview",
    });
    const input = JF.Utils.el("input", { type: "file", accept: "image/*", class: "photo-picker__input", id: opts.inputId || "photo-input" });
    const hint = JF.Utils.el("div", { class: "field__hint", id: (opts.inputId || "photo-input") + "-hint" },
      backendLive() ? "Uploads to the farm server." : "Backend not connected yet - photo will be stored on this device only.");

    input.addEventListener("change", async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      hint.textContent = "Processing photo...";
      try {
        const previewUrl = await fileToDataUrl(f);
        preview.src = previewUrl;
        state.file = f;
        state.previewUrl = previewUrl;
        hint.textContent = backendLive()
          ? "Ready - will upload to the server on save."
          : "Ready - will be stored on this device only (farm API not connected).";
      } catch (e) {
        hint.textContent = "Could not read that image - try a JPG or PNG.";
        state.file = null;
      }
    });

    const row = JF.Utils.el("div", { class: "photo-picker" }, [preview, input]);
    wrap.appendChild(row);
    wrap.appendChild(hint);
    wrap._state = state;
    return wrap;
  };

  /** Consume the widget's chosen file after Save is pressed. Returns final URL or "". */
  const consume = async (photoFieldEl, meta = {}) => {
    const st = photoFieldEl && photoFieldEl._state;
    if (!st || !st.file) return "";
    const res = await processFile(st.file, meta);
    return res.url;
  };

  const init = () => { /* no global wiring needed; widgets are per-form */ };

  return { processFile, attachToAnimal, uploadDocument, photoField, consume, backendLive, fileToDataUrl, fileToDataUrlAny, isDriveLink: isStoredLink, uploadToDrive: uploadToServer };
})();
