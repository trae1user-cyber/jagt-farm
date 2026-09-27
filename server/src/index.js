/**
 * Jagt Farm API — Express + MongoDB (official driver).
 *
 * One JSON endpoint that speaks the action protocol the website's
 * MongoApiAdapter already uses:
 *
 *   POST /            { action, payload, token }  ->  { success, data | error }
 *
 * Actions: ping | verify | list | get | create | update | delete | seed |
 *          seedRules | clear | uploadFile (GridFS) | file | files | exportBackup
 *
 * One MongoDB collection per farm entity (animals, heat, ai, rules, ...) so
 * every record lives with its kind — easy to browse in Atlas and easy to export.
 *
 * Auth: optional shared token. If MONGO_TOKEN env var is empty, the API is
 * open (fine for a private demo; set a token before real data).
 */

const express = require("express");
const cors = require("cors");
const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");
try { require("dotenv").config(); } catch (_) { /* dotenv is optional (Render sets env vars directly) */ }

const PORT = process.env.PORT || 8787;
const MONGO_URI = process.env.MONGO_URI || ""; // mongodb+srv://user:pass@jagt.xfuqadb.mongodb.net/
const DB_NAME = process.env.MONGO_DB || "jagt_farm";
const MONGO_TOKEN = process.env.MONGO_TOKEN || ""; // shared secret, optional

if (!MONGO_URI) {
  console.error("FATAL: set MONGO_URI in server/.env (mongodb+srv://user:pass@host)");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Entities -> collections. Same names the website's store uses.
// ---------------------------------------------------------------------------
const ENTITIES = new Set([
  "animals", "calves", "heat", "ai", "pregnancy", "calving", "dry", "health",
  "vaccination", "deworming", "treatment", "milk", "milkSales", "expenses",
  "income", "sales", "purchases", "assets", "journal", "reminders", "rules",
  "ruleParameters", "ruleOverrides", "settings", "files", "audit",
]);

const client = new MongoClient(MONGO_URI, { appName: "jagt" });
const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" })); // photo data URLs are big

let db = null;

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, code, error) { res.status(code).json({ success: false, error }); }

function auth(req, res, next) {
  if (!MONGO_TOKEN) return next();
  const { token } = req.body || {};
  if (token !== MONGO_TOKEN) return fail(res, 401, "Invalid farm API token");
  next();
}

function entityOf(payload, res) {
  const e = String(payload?.entity || "");
  if (!ENTITIES.has(e)) { fail(res, 400, `Unknown entity: ${e}`); return null; }
  return db.collection(e);
}

// Absolute URL for a stored file, so photos saved on any device (GitHub Pages
// or localhost) can be embedded by the browser without knowing the API host.
function fileUrl(req, id) {
  const host = req.get("x-forwarded-host") || req.get("host") || `localhost:${PORT}`;
  const proto = req.get("x-forwarded-proto") || "http";
  return `${proto}://${host}/api-file/${id}`;
}

async function main() {
  await client.connect();
  db = client.db(DB_NAME);
  console.log(`Connected to MongoDB: ${DB_NAME}`);

  // ------------------------------------------------------------ endpoints --
  app.post("/", auth, async (req, res) => {
    const { action, payload = {} } = req.body || {};
    try {
      switch (action) {
        // ---------------------------------------------------------- ping --
        case "ping": {
          const counts = {};
          for (const e of ENTITIES) counts[e] = await db.collection(e).countDocuments();
          return ok(res, {
            status: "online",
            backend: "MongoDB",
            database: DB_NAME,
            collections: counts,
            time: new Date().toISOString(),
          });
        }

        // ------------------------------------------- write/read roundtrip --
        case "verify": {
          const c = db.collection("settings");
          const probe = { id: "verify_probe", at: new Date().toISOString(), n: Math.random() };
          await c.replaceOne({ id: "verify_probe" }, probe, { upsert: true });
          const back = await c.findOne({ id: "verify_probe" });
          const match = back && back.n === probe.n;
          return ok(res, {
            ok: match, write: true, read: !!back,
            database: DB_NAME,
            at: probe.at,
            message: match ? "MongoDB write/read verified" : "MongoDB round-trip mismatch",
          });
        }

        // ------------------------------------------------------------ CRUD --
        case "list": {
          const col = entityOf(payload, res); if (!col) return;
          return ok(res, await col.find({}).toArray());
        }
        case "get": {
          const col = entityOf(payload, res); if (!col) return;
          return ok(res, await col.findOne({ id: String(payload.id) }));
        }
        case "create": {
          const col = entityOf(payload, res); if (!col) return;
          const rec = { ...payload.data, _serverAt: new Date().toISOString() };
          if (!rec.id) rec.id = `${payload.entity}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          await col.replaceOne({ id: rec.id }, rec, { upsert: true });
          return ok(res, rec);
        }
        case "update": {
          const col = entityOf(payload, res); if (!col) return;
          const cur = await col.findOne({ id: String(payload.id) });
          if (!cur) return fail(res, 404, "Record not found");
          const next = { ...cur, ...payload.patch, id: cur.id, _serverAt: new Date().toISOString() };
          await col.replaceOne({ id: cur.id }, next);
          return ok(res, next);
        }
        case "delete": {
          const col = entityOf(payload, res); if (!col) return;
          const r = await col.deleteOne({ id: String(payload.id) });
          return ok(res, r.deletedCount > 0);
        }

        // ----------------------------------------------------------- seed --
        case "seed": {
          const data = payload.data || {};
          const out = {};
          for (const [entity, rows] of Object.entries(data)) {
            if (!ENTITIES.has(entity) || !Array.isArray(rows)) continue;
            const col = db.collection(entity);
            let added = 0;
            for (const row of rows) {
              if (!row || !row.id) continue;
              const exists = await col.findOne({ id: row.id });
              if (!exists) { await col.insertOne(row); added++; }
            }
            out[entity] = { added };
          }
          return ok(res, out);
        }

        // ---------------------------------------------- rulebook install --
        case "seedRules": {
          const { rules = [], params = [], overrides = [], upsert = false } = payload;
          const resOut = { rules: { added: 0, updated: 0 }, parameters: { added: 0, updated: 0 }, overrides: { added: 0, updated: 0 } };
          const put = async (entity, rows, key) => {
            for (const row of rows || []) {
              if (!row || !row.id) continue;
              const exists = await db.collection(entity).findOne({ id: row.id });
              if (!exists) { await db.collection(entity).insertOne(row); resOut[key].added++; }
              else if (upsert) {
                await db.collection(entity).replaceOne({ id: row.id }, { ...row, id: exists.id });
                resOut[key].updated++;
              }
            }
          };
          await put("rules", rules, "rules");
          await put("ruleParameters", params, "parameters");
          await put("ruleOverrides", overrides, "overrides");
          return ok(res, resOut);
        }

        // --------------------------------------------------------- photos --
        case "uploadFile": {
          const { mimeType, base64, animalId, kind, category, recordId, fileName } = payload;
          const bucket = new GridFSBucket(db, { bucketName: "farmfiles" });
          const buf = Buffer.from(String(base64), "base64");
          const uploadId = new ObjectId();
          await new Promise((resolve, reject) => {
            const stream = bucket.openUploadStreamWithId(uploadId, fileName || "file", {
              metadata: { animalId, kind, category, recordId, mimeType, uploadedAt: new Date().toISOString() },
            });
            stream.on("finish", resolve); stream.on("error", reject);
            stream.end(buf);
          });
          const fileDoc = {
            id: `file_${uploadId.toString()}`,
            objectId: uploadId.toString(),
            fileName: fileName || "file",
            mimeType,
            animalId, kind, category, recordId,
            size: buf.length,
            uploadedAt: new Date().toISOString(),
          };
          await db.collection("files").replaceOne({ id: fileDoc.id }, fileDoc, { upsert: true });
          return ok(res, { ...fileDoc, url: fileUrl(req, uploadId) });
        }
        case "file": {
          const bucket = new GridFSBucket(db, { bucketName: "farmfiles" });
          const parts = [];
          await new Promise((resolve, reject) => {
            const dl = bucket.openDownloadStreamByName(String(payload.name));
            dl.on("data", (c) => parts.push(c)); dl.on("end", resolve); dl.on("error", reject);
          });
          res.setHeader("Content-Type", payload.mimeType || "image/jpeg");
          return res.end(Buffer.concat(parts));
        }
        case "files": {
          const col = entityOf(payload, res); if (!col) return;
          return ok(res, await col.find({}).toArray());
        }

        // -------------------------------------------------------- backups --
        case "exportBackup": {
          const dump = {};
          for (const e of ENTITIES) dump[e] = await db.collection(e).find({}).toArray();
          return ok(res, { database: DB_NAME, exportedAt: new Date().toISOString(), data: dump });
        }
        case "clear": {
          if (String(payload.confirm) !== "DELETE ALL FARM DATA") {
            return fail(res, 400, "clear requires payload.confirm === 'DELETE ALL FARM DATA'");
          }
          for (const e of ENTITIES) await db.collection(e).deleteMany({});
          const b = db.collection("fs.files"); await b.deleteMany({});
          return ok(res, { cleared: true });
        }

        default:
          return fail(res, 400, `Unknown action: ${action}`);
      }
    } catch (err) {
      console.error(`[${action}]`, err);
      return fail(res, 500, err.message);
    }
  });

  // Friendly GET so the URL can be checked in a browser (like the old doGet ping).
  app.get("/", (_req, res) => {
    res.json({ success: true, data: { status: "online", backend: "MongoDB", database: db ? db.databaseName : DB_NAME, version: "1.0.0" } });
  });

  // Serve a GridFS file by id (used by photo <img> tags saved on any device).
  app.get("/api-file/:id", async (req, res) => {
    try {
      const bucket = new GridFSBucket(db, { bucketName: "farmfiles" });
      let contentType = "application/octet-stream";
      const parts = [];
      await new Promise((resolve, reject) => {
        const dl = bucket.openDownloadStream(new ObjectId(String(req.params.id)));
        dl.on("file", (f) => { if (f.contentType) contentType = f.contentType; });
        dl.on("data", (c) => parts.push(c)); dl.on("end", resolve); dl.on("error", reject);
      });
      if (!parts.length) return fail(res, 404, "File not found");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.end(Buffer.concat(parts));
    } catch (err) {
      return fail(res, 404, "File not found");
    }
  });

  app.listen(PORT, () => console.log(`Jagt Farm API listening on http://localhost:${PORT}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
