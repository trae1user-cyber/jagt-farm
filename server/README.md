# Jagt Farm API (server/)

Express + official MongoDB driver. One JSON endpoint that speaks the action
protocol the website's `MongoApiAdapter` already uses — every view, the rule
engine and the cascade layer work unchanged.

## Run locally

1. Install Node.js LTS (nodejs.org) — one time, machine-level.
2. Copy `server/env.example` to `server/.env` and fill in your real
   `MONGO_URI` (from Atlas → Connect → Drivers) and database name.
3. Then:

```bash
cd server
npm install
npm start
```

You should see `Connected to MongoDB: jagt_farm` and the API on
`http://localhost:8787`. Opening that URL in a browser shows a JSON ping.

## Deploy (Render free tier — recommended)

1. Push this repo to GitHub.
2. render.com → **New + → Blueprint** → connect the repo (render.yaml at the
   repo root pre-fills everything below), or New → Web Service and set:
3. Settings: **Root Directory** `server` · Build `npm install` · Start `npm start` · Instance type Free.
4. Environment variables:
   - `MONGO_URI` = your real `mongodb+srv://...` string
   - `MONGO_DB` = `jagt_farm`
   - `MONGO_TOKEN` = a long random string (recommended)
5. Deploy. Your API URL is `https://<service>.onrender.com`.

## Connect the website

Site Settings → Backend → **MongoDB API** → paste the API URL (and the same
token if you set one) → **Test** → **Verify**. Done: every entry now lives in
MongoDB and every device reads from it.

## Atlas side

- Network Access → add `0.0.0.0/0` (Render's outbound IPs vary) or Render's IP list.
- Rotate the database user's password before going live (the one shared in
  chat earlier must be treated as compromised).
