# Jewel-ERP — Remaining Implementation Plan

Status snapshot (as of this document):

**Done:** Foundation · Item Master · Customers · Unified POS (URD, discounts,
CGST/SGST/IGST, TCS, walk-in, WhatsApp, modify-bill, loyalty) · Receipt/Udhari ·
Purchase + Suppliers (→ live stock) · Gold Schemes · Girvi · Karigar · Order
Booking · Day Book · Reports (party ledger, cash book, GSTR-1) · Auth + multi-firm
+ financial year · Barcode label printing · Backup/restore · **Physical Stock
Audit** · **Metal Refining (Ghalai)**.

**Remaining** (this document): P2 depth items + platform packaging.

Conventions used throughout: all persistence goes through `src/services/dbService.ts`;
Dexie schema versions bump for new tables; types live in `src/db/types.ts`; one
feature folder under `src/features/<name>/`; print views reuse the global
`.print-area / .print-overlay / .no-print` CSS; money in INR, weights in grams.

---

## 1. Gold Scheme — due-date grid + chit receipt

**Why:** The benchmark generates a month-by-month due grid at enrolment and prints
a chit receipt per installment. We currently track installments as a flat count.

**Data model** (`SchemeAccount` / `SchemePayment` already exist):
- Add to `SchemePayment`: `dueDate?: string`, `installmentLabel?: string`.
- Derive the schedule from `account.startDate + scheme.durationMonths` (no new
  table needed) — month *n* due date = startDate + n months.

**Service (`schemesService`):**
- `getSchedule(accountId)` → array of `{ installmentNo, dueDate, amount, paid, paidOn }`
  by joining the scheme's `durationMonths`/`monthlyAmount` with existing payments.
- `addPayment` already exists; extend to accept `installmentNo` + `dueDate`.

**UI (`src/features/schemes/`):**
- Account detail dialog/page showing the **12-row due grid**: each row = month,
  due date, amount, status (Paid ✓ / Due / Overdue by colour).
- "Collect" on a due row → records that installment + opens a **printable chit
  receipt** (reuse print overlay; show shop header, account no, installment n/N,
  amount, next due date).

**Acceptance:** enrol a customer → see N due rows with dates → collect month 1 →
row turns green, chit prints, balance/▢progress updates.

**Effort:** ~M (½–1 day). No migration if we keep schedule derived; small migration
if we persist `dueDate` on payments.

---

## 2. Girvi — partial repayment, renewal & day-wise interest

**Why:** Today a loan can only be closed in full. Pawn-broking needs partial
payments, renewals (roll interest, extend), and day-wise interest accrual.

**Data model:**
- New table `loan_payments` (Dexie v6): `id, loanNo/loanId, date, amount,
  towardsInterest, towardsPrincipal, type: "part"|"renewal"|"closure", notes`.
- `Loan`: add `interestMode?: "monthly" | "daywise"`, `principalOutstanding?`
  (running), keep `isClosed`.

**Service (`loansService`):**
- `getPayments(loanId)`.
- `accrueInterest(loan, asOf)` — extend `computeDues` to support **day-wise**:
  `interest = principal × ratePerMonth/30 × days` (vs current ceil-months).
- `addPayment(loanId, {amount, date, type})` — allocate to interest first then
  principal; update `principalOutstanding`; mark closed when principal hits 0.
- `renew(loanId, date)` — capitalise accrued interest or reset the clock; log a
  `renewal` payment.

**UI (`src/features/girvi/`):**
- Loan detail dialog: dues breakdown (principal, accrued interest, days elapsed),
  payment history, and actions **Part Payment / Renew / Close**.
- Each payment prints a receipt (reuse Pavati layout, "Interest Receipt" variant).
- Loan form: add **interest mode** (monthly vs day-wise) toggle + thumbprint
  capture (second image field, like collateral photo).

**Acceptance:** create a loan → add a ₹X part payment (interest-first allocation) →
outstanding drops → renew → close; day-wise interest matches `principal×rate/30×days`.

**Effort:** ~L (1–2 days) — most complex remaining accounting piece.

---

## 3. GST — HSN summary + Excel export

**Why:** GSTR-1 currently lists invoices and exports CSV; CAs also need an
**HSN-wise summary** and Excel.

**Data model:**
- Add optional `hsn?: string` to `Item` and `SalesItem` (non-indexed, no migration).
- Default jewellery HSN (e.g. `7113`) seeded; editable per item.

**Service (`ledgerService`):**
- `gstHsnSummary(month)` → group sale lines by HSN: `{ hsn, taxableValue, cgst,
  sgst, igst, qty, netWt }`.

**UI (`src/features/reports/`):**
- New tab **"HSN Summary"** under Reports with the grouped table + totals.
- Excel: emit a real `.xlsx` (add `xlsx`/SheetJS — pure JS, no native binding) for
  both GSTR-1 and HSN; keep CSV as fallback.

**Acceptance:** sales in a month roll up per HSN with correct tax splits; Export
produces an `.xlsx` a CA can open.

**Effort:** ~M (½–1 day). Adds one dependency (SheetJS).

---

## 4. Sundry Debtors report

**Why:** One-screen list of everyone who owes money, with phones for follow-up
(benchmark has it; we only show per-customer balances today).

**Service (`ledgerService`):**
- `sundryDebtors()` → for every customer, compute outstanding (reuse
  `customersService.getOutstanding`), return those `> 0` sorted desc with mobile.

**UI (`src/features/reports/`):**
- New **"Debtors"** tab: table (name, mobile, outstanding, last txn) + total,
  per-row **WhatsApp reminder** button (reuse `wa.me` helper), CSV export.

**Acceptance:** customers with dues appear sorted by amount; WhatsApp opens a
pre-filled reminder; total matches sum.

**Effort:** ~S (½ day).

---

## 5. Regional-language receipts (Hindi / Marathi / Gujarati)

**Why:** Locked decision was *English-first, i18n-ready*; the benchmark prints
receipts in regional languages. Add language to **print output** (UI stays English).

**Approach:**
- Add a tiny i18n map `src/lib/receiptLang.ts`: `{ en, hi, mr, gu }` for the ~20
  receipt labels (Invoice, Date, Net Payable, Balance, Thank you, …).
- Setting on the company/firm: `receiptLanguage`.
- Invoice/Pavati/Receipt/Chit components read labels from the map by the firm's
  language. Numbers/amounts stay as-is.

**Acceptance:** switch firm language to Marathi → printed invoice headers/labels
render in Marathi while the app UI stays English.

**Effort:** ~M (½–1 day), mostly translation strings.

---

## 6. Order → Sale conversion (close the advance loop)

**Why:** Order advances are recorded + shown in cash book but **not yet netted into
customer outstanding**; delivering an order should bill it and consume the advance.

**Service (`ordersService` + `salesService`):**
- `convertToSale(orderId, draft)` — create a sales invoice from the order's items,
  apply `order.advanceReceived` as a prepayment (reduces balance), set order
  status `delivered`, link `invoiceId` on the order.

**UI:** Orders row action **"Deliver & Bill"** → opens POS pre-loaded from the
order (reuse `usePosStore.loadForEdit`-style hydration) with advance applied.

**Acceptance:** delivering an order produces an invoice whose balance already
reflects the advance; customer ledger is consistent (no double counting).

**Effort:** ~M (1 day). Depends on POS hydration already built.

---

## 7. Invoice template / print settings (lightweight Report Builder)

**Why:** Benchmark has a drag-drop Report Builder. We don't need a full designer —
just configurable invoice options.

**Approach:** A Settings → **Print** tab: toggle logo, terms text, bank details,
show/hide HUID column, paper size (A4/A5/thermal 80mm), accent colour. Persist on
the company. Invoice/Pavati read these options.

**Effort:** ~M. Optional / lower priority.

---

## 8. Platform — Tauri + SQLite desktop packaging

**Why:** The Phase-2 platform goal: a true offline **desktop app** with a real DB.

**Plan:**
1. Add Tauri (`@tauri-apps/cli`, Rust toolchain). `npm create tauri-app` shell or
   add to the existing Vite app via `src-tauri/`.
2. **SQLite swap behind `dbService`:** implement a SQLite-backed module with the
   *same function signatures* as the Dexie services (the whole point of the
   `dbService` seam). Options: `tauri-plugin-sql` (SQLite) or `@tauri-apps/plugin-sql`.
   - Map each Dexie table to a SQL table; port queries (most are simple
     `where/equals/orderBy`).
   - Keep `useLiveQuery` semantics via a thin reactive wrapper or switch hot paths
     to React Query with manual invalidation.
3. **Migration/import:** reuse the JSON **backup/restore** to move IndexedDB data
   into the SQLite build on first run.
4. Packaging: `tauri build` → Windows installer (`.msi`/NSIS). App icon, name,
   auto-update later.

**Risks / notes:**
- This machine's Application-Control policy blocks unsigned native `.node` bindings
  (why we're on Vite 7). Tauri ships a Rust binary + WebView2 — validate it runs
  here early; may need code-signing/allowlisting.
- `useLiveQuery` is Dexie-specific — the reactive layer is the main porting effort.

**Effort:** ~XL (multi-day) — schedule as its own phase after P2 features land.

---

## Suggested sequencing

1. **Sundry Debtors** (S) — quick win, high daily value.
2. **GST HSN + Excel** (M) — compliance, adds SheetJS.
3. **Scheme due-grid + chit** (M).
4. **Order → Sale conversion** (M) — closes the advance loop.
5. **Girvi partial/renewal + day-wise** (L) — biggest accounting piece.
6. **Regional-language receipts** (M).
7. **Invoice print settings** (M, optional).
8. **Tauri + SQLite packaging** (XL) — final platform phase.

## Cross-cutting backlog
- Code-split routes (bundle ~930 kB single chunk) via `React.lazy` + `manualChunks`.
- Loyalty/HSN/GST rates → editable Settings instead of constants.
- Per-firm document-number prefixes in Settings.
- Light automated tests for `calc.ts`, `interest.ts`, and `dbService` money math.
