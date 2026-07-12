# Manual Test & Production-Verification Checklist — Jewel-ERP

A human-driven, release-gate checklist covering **every module** of the app. Run
this before shipping a build to a shop. It complements the automated Playwright
suite (see [TESTING.md](./TESTING.md)) — automation proves the wiring, this
proves the *experience*.

- **Environment:** run against the desktop build (`npm run tauri:build` → install)
  for a true production check, or `npm run dev` (web) for a fast pass. Both ship
  the identical UI + service layer.
- **Default login:** firm **My Jewellery Shop**, user **admin**, password **admin**.
  Change this password before going live (Settings → My Account).
- **Seeding demo data:** Dashboard → **Load Demo Datasets**, or per-page "load
  demo" buttons on Item Master / Customers. Do this on a scratch firm only.
- **Legend:** ☐ = to verify · **Expect:** = the pass condition.

> Last verified against branch `test/playwright-suite` on 2026-07-12:
> 145/145 automated tests green · typecheck clean · all 19 routes render with
> zero console errors. See the [Production-Readiness Assessment](#production-readiness-assessment).

---

## 0. Smoke & session

- ☐ App launches to the **login screen** (not a blank page). **Expect:** firm
  picker + financial-year selector + password field.
- ☐ Wrong password is rejected with a clear message. **Expect:** no login, error toast.
- ☐ `admin` / `admin` logs in and lands on the **Dashboard**. **Expect:** left
  nav with all modules, business date shown top-right.
- ☐ Reload the app mid-session. **Expect:** returns to login (no crash), data intact.
- ☐ **Error recovery:** if a screen ever errors, an "Something went wrong /
  Reload app" panel appears instead of a white screen (safety net added this release).

---

## 1. Dashboard

- ☐ KPI cards populate: **Sales (current month)**, **Gold Savings Pool**,
  **Girvi Loans Book**, **In-Stock Inventory (g)**. **Expect:** numbers match reality
  (₹0 / counts on a fresh firm; real figures after seeding + a sale).
- ☐ **Sales Revenue Trend** chart renders for the last 14 days.
- ☐ **Payment Split (MTD)** shows cash vs digital, or an empty state when no billing.
- ☐ Gold Schemes overview + Recent Billing Transactions panels render.

---

## 2. Sales cycle

### 2.1 Billing / POS  (`/billing`, F2)
- ☐ Add a **blank row**, fill description / net wt / rate/g / making/g. **Expect:**
  line amount = rate×wt + making×wt, live.
- ☐ Scan/enter a **barcode tag** of a seeded item. **Expect:** the item's row auto-fills.
- ☐ Pick / create a **walk-in customer** from the picker.
- ☐ **URD (Old Gold)** tab: add old-gold weight/rate. **Expect:** "Less: Old Gold"
  reduces taxable.
- ☐ GST auto-splits CGST/SGST (or IGST when **Inter-state** ticked). Change rate slab.
- ☐ Apply **Bill Discount** / **Making Discount**; redeem **loyalty** points.
- ☐ Take payment: **full** cash, or split cash/UPI/cheque with references. **Expect:**
  "Settled" when fully paid; a balance raises the customer's outstanding.
- ☐ **Save & Print** (F12). **Expect:** invoice overlay with a minted `INV…` number;
  the sale appears in Day Book and marks stock **sold**.
- ☐ Re-open a saved bill from Day Book, edit a line, re-save. **Expect:** old stock
  restored, new stock re-marked sold, totals recomputed.

### 2.2 Order Booking  (`/orders`)
- ☐ **Book an order** with live price estimate; receive an **advance** payment.
- ☐ Advance the status: confirmed → gold reserved → assign to **Karigar/workshop**
  → production → ready. **Expect:** timeline reflects each step.
- ☐ **Deliver & bill** → lands in POS with the order linked; invoice writes back.
- ☐ Duplicate / cancel an order; WhatsApp notify; Excel export; print detail.

### 2.3 Receipt — Udhari Collection  (`/receipt`)
- ☐ Pick a customer with outstanding → see the balance → **Save & Print Receipt**.
  **Expect:** `RCP…` number; outstanding drops; voucher prints.

### 2.4 Sales Returns / Credit Notes  (`/sales-returns`)
- ☐ Search a sold invoice/customer → record a return. **Expect:** a **credit note**
  in history; the original invoice is unchanged; customer credit reflects it.

### 2.5 Receipt Designer  (`/receipt-designer`)
- ☐ Drag-reorder blocks, toggle sections, set align/size/bold, add custom text,
  upload a logo → **Save**. **Expect:** a real POS print reflects the layout.
- ☐ **Reset to default** restores the standard layout.

---

## 3. Inventory & sourcing

### 3.1 Item Master  (`/inventory`, F3)
- ☐ **New Item**: pick category → tag auto-generates from prefix; net wt auto-derives.
- ☐ Search by tag / name / HUID; filter by category (shows all statuses).
- ☐ **Print barcode labels**; **Excel export**; **load demo stock**.
- ☐ Edit / delete an item. **Expect:** sold/melted items are protected/annotated.

### 3.2 Purchase  (`/purchase`)
- ☐ **New Purchase** grid: add lines, tick **"Add to stock"** per row, set GST, totals.
  **Expect:** ticked rows mint tagged inventory items; unticked rows do **not**.
- ☐ New/Edit **Supplier**; **Pay Vendor**; open **Vendor Ledger**; record a **Return**.
- ☐ Verify **vendor outstanding** = opening + unpaid purchase balances.
- ☐ **Two-phase save:** a bad stock insert must NOT roll back or mislabel the
  committed bill (the header commits atomically; per-row stock inserts are independent).

### 3.3 Refining (Ghalai)  (`/refining`)
- ☐ Create a job (source from stock/scrap, purity, loss %, charges) → **confirm**.
  **Expect:** source consumed, refined **bullion** minted + a sellable item created;
  fineness/loss/recovery computed.
- ☐ **Reverse** a job. **Expect:** allowed only if the bullion is unsold; source restored.
- ☐ Refiner master CRUD; job detail + ledger audit + print; analytics render.

### 3.4 Karigar (Job Work)  (`/karigar`)
- ☐ **New Karigar**; **Issue Metal** (debits balance) → **Receive** finished + wastage
  (credits back). **Expect:** ledger reconciles within allowed wastage.
- ☐ Link a job to an open **order**.

### 3.5 Stock Audit  (`/audit`)
- ☐ Scan tags (Enter) → **Reconcile**. **Expect:** missing flagged red, unknown
  (sold/melted) tags labelled; **Export Missing CSV**; **Reset** clears (nothing persisted).

### 3.6 Counter Operations  (`/operations`)
- ☐ **Metal Rates** board: set Gold 24K/22K/18K, Silver, Old-gold buy → **Save New
  Rate Version**. **Expect:** POS picks up the new rates (a rate change requires a reason — see §6).
- ☐ **Vouchers** and **Close Day** tabs function.

### 3.7 Repairs  (`/repairs`)
- ☐ **New Repair** intake (customer, item/condition, promised date, estimate) →
  track status through to delivery. **Expect:** searchable list, status transitions.

---

## 4. Loans & savings

### 4.1 Girvi — Gold Loans  (`/girvi`)
- ☐ **New Loan**: pledge item(s), loan amount auto-fills from lending rate/gram.
- ☐ Open **View Details** (open loans only) → **Part Payment** (interest-first),
  **Renew** (capitalises unpaid interest), **Close/Redeem**, WhatsApp reminder, print.
- ☐ Row **Pavati** and payment vouchers print in the firm's language.
- ☐ **Expect:** part/renew/WhatsApp actions hidden for closed loans.

### 4.2 Gold Schemes  (`/schemes`)
- ☐ **New Plan** ("pay 11, get 12"); **Enroll** a customer; **Record Instalment**.
  **Expect:** double-paying a slot is blocked; schedule spans the plan.
- ☐ View schedule; **Print Chit**; WhatsApp reminder; **Mark Matured**.

---

## 5. Masters, ledgers & reports

### 5.1 Customers  (`/customers`)
- ☐ New/Edit/Delete; search name/mobile; **Excel export**; **load demo customers**.
- ☐ **Outstanding (Dr/Cr)** column = opening + Σ invoice balances − Σ receipts.
- ☐ Loyalty cap is enforced (no over-award / no negative points).

### 5.2 Day Book  (`/daybook`)
- ☐ Navigate days; KPI cards (sales, URD, GST, cash/UPI, credit, loans) reconcile
  with the day's invoices; **edit a bill** loads it into POS.

### 5.3 Reports & GST  (`/reports`)
- ☐ **Party Ledger** by customer (running balance).
- ☐ **Cash Book** by day (inflows/outflows).
- ☐ **Sundry Debtors** + WhatsApp dues.
- ☐ **GSTR-1** (B2B vs B2C) and **HSN Summary** by month; **CSV/Excel export**.
- ☐ **Metal Stock** tab reconciles on-hand weight.

### 5.4 Settings  (`/settings`)
- ☐ **Shop Profile** (name/address/GSTIN) saves and prints on invoices/Pavati.
- ☐ **Print & Rates**: default rates, GST/HSN, loyalty cap, **discount limits**
  (direct ₹500 / reason ₹2,000) configurable.
- ☐ **Firms**: add / switch firm (reloads the app into that firm's data).
- ☐ **Users** (owner-only): add users, assign role (Staff/Manager/Owner), enable/disable.
- ☐ **My Account**: change password (change `admin/admin` before go-live!).
- ☐ **Backup**: JSON / Excel / Google Drive export; **RESTORE** (typed-confirm) round-trips.
- ☐ **Msg Templates**: edit WhatsApp templates per language.

---

## 6. Permissions & audit (cross-cutting)

Roles: **Staff · Manager · Owner** (legacy `cashier` → `staff`). See
[PERMISSIONS-AND-AUDIT.md](./PERMISSIONS-AND-AUDIT.md).

- ☐ **Staff** can bill, receipt, purchase, order, Girvi, schemes, rates, stock.
- ☐ A **reason** is required (and recorded) for: changing an existing rate, editing
  a previous-day invoice, adjusting an existing stock item, cancelling an invoice,
  and discounts above the direct limit.
- ☐ Discounts above the **high threshold** require a **Manager/Owner**.
- ☐ **Owner-only**: user/role admin, backup restore, reopening closed FYs, permanent delete.
- ☐ Every gated action writes an **audit_log** entry (timestamp, user, action,
  entity/id, reason, before/after) and is included in backups.

---

## 7. Printing, language & WhatsApp

- ☐ Sale receipt, Girvi Pavati, and payment/chit vouchers print in the firm's
  configured **language** (English / Hindi / Marathi …); falls back to English.
- ☐ WhatsApp links (`wa.me`) open on the desktop build (opener scope granted).
- ☐ Barcode labels scan back correctly at the POS.

---

## 8. Data safety & desktop

- ☐ **Backup → Restore** round-trips all business data (verified in automation).
- ☐ On desktop, data persists in **SQLite**; on web it's IndexedDB — same behaviour.
- ☐ First-run bootstrap re-creates the default firm + owner on an empty DB.
- ☐ Kill the app mid-transaction (e.g. during Save & Print) and relaunch.
  **Expect:** no partial/corrupt invoice (writes are transactional).

---

## Production-Readiness Assessment

**Verified this release (2026-07-12, branch `test/playwright-suite`):**

| Check | Result |
|-------|--------|
| Automated suite (logic + api + ui) | ✅ **145/145 pass** |
| TypeScript typecheck (`tsc -b`) | ✅ clean |
| All 19 routes render | ✅ zero console errors |
| Stray `console.log` / `TODO` / `@ts-ignore` in `src/` | ✅ none |
| Every module built out (no stubs) | ✅ confirmed by walkthrough |
| App-wide crash recovery | ✅ **ErrorBoundary added** (was missing) — a page crash or failed post-update chunk load now shows a Reload panel instead of a white screen; covered by `e2e/ui/error-boundary.spec.ts` |
| **Actual desktop build** (`npm run tauri:build`) | ✅ compiles + packages — real `jewel-erp.exe` (14.7 MB) plus **MSI** and **NSIS** installers |
| **Desktop smoke on the real `.exe`** (`npm run test:desktop`) | ✅ **9/9 steps** via `tauri-driver`/WebView2 — login → dashboard → Billing → full sale round-trip (invoice minted, customer read back from a fresh mount) |

**Recommended before go-live (operational, not code blockers):**

1. **Change the default `admin/admin` password** and create real user accounts
   with correct roles.
2. Fill in **Shop Profile** (name, address, GSTIN) and default **rates / GST / HSN**
   so invoices are compliant from bill #1.
3. Configure and **test a Backup** (JSON + Google Drive) and rehearse a **Restore**
   on a spare machine — the single most important disaster-recovery step.
4. Run this checklist by hand on the **actual desktop build**. (The automated
   desktop smoke already passes on the real `.exe` — do a human pass of the
   remaining modules on the installed app before shipping.)

**Known follow-ups (tracked in PERMISSIONS-AND-AUDIT.md, not shipping blockers):**
owner-facing audit viewer/export screen; financial-year close/reopen state;
replace browser `prompt()` reason dialogs with a richer reusable dialog.

### SQLite cutover — transaction-pool bug FOUND & FIXED (re-validated green)

Building with `VITE_SQLITE_CUTOVER=1` and running the desktop smoke against the real
binary originally **failed at the sale round-trip**: login, navigation, and single-row
writes (adding a walk-in customer) succeeded, but `createInvoice` never minted an
invoice.

- **Root cause:** `src/db/sqliteRepo.ts:withTransaction` issues `BEGIN` / `COMMIT`
  as separate `execute()` calls. Stock `tauri-plugin-sql` **2.4.0** backs SQLite
  with a multi-connection SQLx **pool** (`Pool::connect`, default 10), so each call
  borrows a *different* connection and the explicit transaction never holds. Every
  money-sensitive multi-write path (`createInvoice`, `addPayment`, loans, purchases,
  refining…) was affected; plain single-statement writes were fine, which is why
  login/customer-add passed and hid the bug. Unit tests passed because they use an
  in-memory fake executor that doesn't model the pool.
- **Fix (applied):** vendored the plugin at `src-tauri/vendor/tauri-plugin-sql`
  (referenced by `src-tauri/Cargo.toml` as a path dep) with a one-line change — the
  SQLite pool is pinned to a **single connection**
  (`SqlitePoolOptions::new().max_connections(1)`) so every statement, and thus
  `BEGIN…COMMIT`, serialises onto the same handle. SQLite is single-writer, so this
  is the correct pool sizing and loses no concurrency.
- **Re-validated:** `VITE_SQLITE_CUTOVER=1` build + `npm run test:desktop` → **9/9
  steps pass**, including the sale round-trip (invoice minted via SQLite, then the
  customer read back from a fresh mount — proving the transaction committed). The
  desktop-e2e smoke's SQLite round-trip step is the standing regression guard.

**Verdict:** the **shipping desktop build (IndexedDB)** is feature-complete and
stable for pilot/production once the four operational steps above are done — no open
correctness defects. The **SQLite backend now works correctly on the real binary**;
the cutover remains gated OFF in `src/db/persistence.ts` (flipping the default is a
separate product decision requiring a data-migration plan for existing installs),
but it is no longer blocked by a correctness bug.
