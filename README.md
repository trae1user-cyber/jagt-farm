# Jagt Farm — Cattle Management

A single-page website for running one cattle farm: the herd, its reproduction and
health records, the money those records create, and what should be done next.

Everything lives on one screen and in one database. A calving entered in Quick
Entry, in the Blank Entry canvas or from the Calves department is the same record
— it lands in MongoDB once and every screen that cares about it updates itself.

---

## Running it

The website is static files. There is no build step and no bundler.

Any static file server will do — for example:

```
python -m http.server 8080      # or: npx serve, or Live Server in your editor
```

Then open `http://localhost:8080/`. There is nothing to compile and no
dependency to install for the website itself.

To produce a single self-contained file (all JS and CSS inlined, useful for
sharing or offline use), run on Windows:

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-preview.ps1
```

which writes `build/preview.html`.

### Talking to the database

The farm API endpoint and token are baked into `js/data/MongoApiAdapter.js`. The
app tries MongoDB on every boot and falls back to a device store if the API
cannot be reached, so the site still opens when the farm is offline. Settings
lets you pin the backend to one or the other.

---

## The departments

| Screen | What it records or shows |
| --- | --- |
| **Dashboard** | Herd size, cash position, net profit, milk income, overdue reminders and herd composition. |
| **Animals** | Every animal, filtered by phase (calves, pregnant, open, in heat, dry, sick, sold, deceased). An animal's **profile** holds its whole history on one page. |
| **Reproduction** | Heats, inseminations, pregnancy checks, calvings, plus a reproduction calendar and reports. |
| **Heat Detective** | Heat signs and what evidence there was for each episode. |
| **Pedigree** | Parents and offspring for any animal. |
| **Health** | Treatments, vaccinations, deworming, diseases and their costs. |
| **Calves** | Birth records and calf management, growth and history. |
| **Finance** | Expenses, purchases, cattle sales, the journal, and the ledger, trial balance, profit & loss, balance sheet, cash book and bank book built from it. |
| **Documents** | Certificates, invoices and veterinary papers, filed against an animal. |
| **Calendar** | Every dated record on one calendar: heats, calvings, due dates. |
| **Blank Entry** | An empty page for adding a record of any kind — see below. |
| **Reminders** | What needs doing, and the farmer's decisions about it. |
| **Rules** | The rulebook: 85 rules, their parameters, and per-animal overrides. |
| **Reports** | Printable and exportable reports, including the complete animal register. |
| **Analytics** | Herd trends and reproduction performance. |
| **Settings** | Farm defaults, reproduction and health intervals, backend connection. |

---

## Three ways to put a record in

They are not three different systems. All three end in the same place.

1. **Quick Entry** — the button in the top bar. Pick one of 18 kinds of record
   (animal, heat, insemination, pregnancy check, calving, treatment, vaccination,
   deworming, dry-off, death, expense, milk payment, purchase, sale, photo,
   heat observation, document, custom reminder) and fill the form.
2. **Blank Entry** (`#canvas`) — opens completely empty, shows the same 18 kinds,
   and fills the form for whichever you pick. It does not have its own field
   list: it renders the *same* form Quick Entry renders, through
   `JF.QuickEntry.buildForm()`, and saves through the *same* handler,
   `JF.QuickEntry.saveForm()`. A field added to a Quick Entry form is therefore
   already on the canvas — there is no second copy to keep in step.
3. **Department forms** — Calves, Health, Reproduction and Finance each have
   their own forms for the records they own. Some of them hand off rather than
   duplicate: the **Register Birth** button on the Calves screen opens Quick
   Entry's Calving form, because a birth is a calving and there is only one
   calving form.

Every save calls `JF.Store.<entity>.create()`. The store writes to MongoDB and
emits a change event; the department hub repaints every screen that cares. This
is why a record entered in one place shows up everywhere at once.

---

## Reminders are derived, not stored

There is no table of "reminders the system generated". When you open the
Reminders screen, the dashboard badge, the calendar or an animal's profile, the
app asks the rule engine what *should* be due right now:

```
JF.RuleEngine.live()   →  derive reminders from the farm's records
```

- The engine matches the stored rulebook (85 rules and 42 parameters, in MongoDB)
  against the animals and their records.
- It looks 60 days ahead (`HORIZON_DAYS`), so overdue items stay visible instead
  of vanishing.
- The result is cached for 60 seconds and thrown away the moment any record
  changes.

Because nothing is stored, there is nothing to fall out of date: correct the
heat date, and the derived reminder moves with it.

**What *is* stored** in `reminderState` is your *decision* about a reminder —
Done, Dismissed or Snoozed until a date — keyed `RMN-<rule>-<animal>`. Custom
reminders you write yourself are stored as normal records in `reminders`.

---

## Phase and asset value follow the animal

`js/modules/PhaseEngine.js` is the single owner of an animal's phase and its
value. It watches calving, pregnancy, dry-off and animal records, waits 2.5
seconds for things to settle, and then works out for every animal:

| Phase | When | Asset value |
| --- | --- | --- |
| Calf | female under ~6 months | ₹40,000 |
| Heifer | female 6 months+, never calved, not pregnant | ₹40,000 |
| Preg Heifer | never calved, latest pregnancy check positive | ₹70,000 |
| Cow | has calved (lactating, or Dry after a dry-off) | ₹1,50,000 |
| Bull | male | ₹40,000 |

The phase drives `Category`, `CurrentStatus` and `AssetValue` together, so a
cow's status and her value can never disagree. **You never type a value in** —
it is derived, and it changes by itself when a pregnancy check or a calving goes
in. Sold and deceased animals are left alone.

Each change in value also posts one row to the ledger (see below). Those rows
are keyed to the animal and are idempotent: one sweep posts at most one row per
change.

---

## How money reaches the ledger

The journal is double-entry — every row has a debit account, a credit account
and one amount. `js/modules/CascadeEngine.js` is the only thing that writes to
it, through one function, `post(kind, record)`:

| Record | Debit | Credit |
| --- | --- | --- |
| Milk payment | Cash or Bank | Milk Sales |
| Animal purchase | Livestock | Cash or Bank |
| Animal sale | Cash or Bank | Cattle Sales |
| Expense | the category's expense account | Cash or Bank |
| Treatment / deworming / vaccination / AI | the matching expense account | Cash or Bank |
| Phase change | Livestock or Owner Capital | the other one |

The cash side follows the payment method, so UPI, card and cheque move the Bank
and never the Cash book.

**A record can never be booked twice.** Each row's reference is derived from the
record's id (`JE-<kind>-<record id>`). If the same event arrives again — a
re-fired cascade, an edit, a re-sync — the engine finds its own row and corrects
the amount instead of adding a mirror.

**Older records are caught up on boot.** `JF.Cascade.syncLedger()` runs once at
start-up and books anything that earned or spent money before its record reached
the ledger. It is idempotent, so it converges: on the second run it books
nothing.

`js/modules/FinanceCalc.js` turns the journal into the trial balance, ledgers,
profit & loss and balance sheet. The balance sheet balances exactly when every
journal row is balanced.

---

## What is stored in MongoDB, and what is computed

**Stored — the farm's own facts.** Every collection below holds only what
somebody actually entered:

`animals` · `heat` · `insemination` · `pregnancy` · `calving` · `dryOff` ·
`health` · `deworming` · `vaccination` · `death` · `milkSales` · `expenses` ·
`purchases` · `sales` · `journal` · `files` · `rules` · `ruleParameters` ·
`ruleOverrides` · `settings` · `reminders` (your own) · `reminderState` (your
decisions) · `audit`

**Computed on read — never stored, never able to go stale:**

- Reminders, from the rulebook and the records.
- Every animal's phase, group-independent status and asset value.
- The lactation and life-cycle model: parity, days in milk, dry period,
  expected calving, medical cost to date.
- Reproductive episodes, the traffic-light "next action" and the record-quality
  scorecard.
- The animal timeline, assembled live from every collection.
- Every financial statement: trial balance, ledger, cash and bank books, profit
  & loss, balance sheet.
- Pedigree links, repaired from the records when a calf was born without
  parents named.

**Derived values that are written back** (only these two): an animal's
`Category` / `CurrentStatus` / `AssetValue`, and the journal rows those value
changes post. Both are written by their owning module alone, so no two parts of
the app can write the same value.

---

## Repository layout

```
index.html              the page; loads everything below
css/                    tokens, base, components, layout, theme
js/app.js               router and sidebar
js/data/                Store (the one door to the database), adapters, demo seed
js/modules/             the engines: rules, phases, life cycle, cascades, money,
                        search, photos, quick entry
js/views/               one file per screen
server/src/index.js     the farm API (Express + MongoDB)
scripts/build-preview.ps1   inlines everything into build/preview.html
```

---

## Deployment status — please read

The API on Render is **still running the old build (`1.0.0`)**. Render has not
redeployed it automatically, and it must be redeployed by hand from the Render
dashboard. Until that happens:

- `reminderState` and `death` writes are **rejected** by the server. The website
  says so — *"Could not save that decision — the farm API does not accept it
  yet"* — and nothing is silently lost.
- Everything else works against the deployed API as it stands. The code in this
  repository already knows about the newer entities; only the server has not
  been rebuilt.

So: do not treat a reminder decision as saved until the API has been
redeployed. `render.yaml` describes the service (Node, `server/` root, `MONGO_URI`
and `MONGO_TOKEN` as dashboard secrets); deploying it from the dashboard is a
manual step that has not been performed.

---

## Conventions worth knowing before you change something

### Who owns what

Three concerns, three files. Open the one that owns the thing you are changing.

| Concern | Owner | Entry point |
| --- | --- | --- |
| Reminders — what is due, and when | `js/modules/RuleEngine.js` | `live()` derives them; nothing is written |
| An animal's **phase** and its **value** | `js/modules/PhaseEngine.js` | `phaseOf()` (pure), `syncAll()` (the sweep) |
| The **ledger** — every journal row | `js/modules/CascadeEngine.js` | `post()` for records, `bookValuation()` / `forgetValuation()` for phase values |

The rule that makes this hold: **a module that decides something must not be the
module that books it.** PhaseEngine works out that an animal is worth ₹1,50,000;
it then asks `CascadeEngine.bookValuation()` to book it, because the ledger
already has one owner for every row it writes — `post()` for operational
records, `bookValuation()` for asset values. Dependence runs one way:
PhaseEngine → CascadeEngine → Store. Nothing in the ledger reads a phase.

- **One place per value.** Phase and asset value belong to `PhaseEngine`; the
  rows that record them belong to `CascadeEngine`. Animal tags belong to
  `JF.Utils.nextAnimalId()`. Form shapes and their save handlers belong to
  `JF.QuickEntry`, which the Blank Entry canvas calls rather than copies. If you
  find yourself writing the same number or the same field list in two files, one
  of them is wrong.
- **No generated reminder rows.** If you add a feature that needs to "remember"
  a reminder, store the decision, not the reminder.
- **Deletes are real.** `Store.delete()` takes the record **id**, not a
  business reference.