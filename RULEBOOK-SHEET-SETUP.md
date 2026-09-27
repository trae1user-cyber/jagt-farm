# Rulebook Google Sheet — setup (5 minutes, once)

The hybrid split this app runs on:

| Lives in | What |
|---|---|
| **MongoDB** (farm API on Render) | Farm **data**: animals, heat, inseminations, calvings, health, milk sales, expenses, photos, reminders… |
| **Google Sheet** (this setup) | Farm **rules/admin**: the three tabs — `Rules`, `Rule_Parameters`, `Rule_Overrides` — editable like a spreadsheet, live-wired to the app |

Until a sheet is connected, rules simply live with the data (device store or
MongoDB) and the app behaves exactly as before — nothing breaks.

## 1. Create the sheet

1. Go to [sheets.new](https://sheets.new) (any Google account).
2. Name it **Jagt Farm Rulebook**.

## 2. Add the script

1. In the spreadsheet: **Extensions → Apps Script**.
2. Delete the placeholder code, paste the whole contents of
   `google-apps-script/Code.gs` from this repo, save (💾).

## 3. Deploy as a Web app

1. **Deploy → New deployment → Web app**.
2. *Execute as*: **Me** · *Who has access*: **Anyone**.
3. Deploy, authorise when asked, and copy the **/exec** URL
   (`https://script.google.com/macros/s/.../exec`).

## 4. Connect the app

1. Open the website → **Settings → General & Backend**.
2. Scroll to **Rulebook Google Sheet (Rule/Admin Console)** and paste the /exec URL.
3. **⚡ Test Sheet** — should answer with the document name and row counts.
4. **🩺 Verify Sheet** — writes/reads a probe row (an `Admin` tab appears; that is normal).
5. **📥 Install rulebook into sheet** — fills the three tabs with the built-in
   85 rules + parameters (existing rows are kept).
6. **Save Settings**, then open the **Rules** page — the status line should say
   the rules are being read from the Google Sheet rulebook.

## 5. How the two-way sync works

- Change a toggle, lead time, parameter or override **in the app** → written
  into the sheet tab instantly.
- Edit a value **directly in the Sheet** → the app picks it up next time the
  Rules tab loads (or press **🔄 Reload from Sheet/Database** on the Rule
  Engine overview).
- **⬆️ Push rules to the rulebook home** (Rules overview) re-writes this
  device's full configuration into the home — useful after working offline.

## Security notes

- "Anyone" here means *anyone who has the long /exec URL* — there is no login,
  so treat the URL like a password. Do not publish it.
- For a second layer, set the `TOKEN` constant at the top of `Code.gs` to a
  long random string; the app currently sends an empty token. Ask to have the
  app wired to a token field if you want this enabled end-to-end.
- The sheet holds only rules/parameters — no animal data, no photos.
