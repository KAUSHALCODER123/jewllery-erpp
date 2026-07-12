# Girvi (Gold Loan) — Context

**Purpose:** Girvi is the pawn / gold-loan module: a customer pledges jewellery as collateral for a cash loan at a monthly (or day-wise) interest rate, and the shop tracks accruing dues, part repayments, renewals (with interest capitalisation), and final closure/redemption — printing a Pavati (pledge receipt) and payment vouchers throughout.

## Key files
| File | Responsibility |
|------|----------------|
| `GirviPage.tsx` | Route page. Open/All tabs, search, loans table (principal, rate, live Due Today, status). Row icon actions: Eye (View Details dialog), Receipt (Pavati), Lock (quick Close & Redeem, open loans only). Hosts `LoanFormDialog`, `LoanDetailsDialog`, `PavatiReceipt`, and the inline `CloseLoanDialog`. |
| `LoanFormDialog.tsx` | "New Loan" creation form: customer combobox, date, pledged-items grid (desc/purity/gross/net/est. value), collateral photo + borrower thumbprint (base64 data-URLs, ≤3 MB), lending rate (₹/g) → auto loan amount, interest %/month, interest mode. Live LTV + interest preview. |
| `LoanDetailsDialog.tsx` | The hub for an existing loan. Shows pledged collateral, photos, live dues cards, payments ledger. Contains Part Payment / Renew / Close action forms and the WhatsApp reminder + Print Pavati buttons. Uses a live `loansService.get` so status updates instantly. |
| `interest.ts` | Pure interest engine. `computeLoanDues(loan, payments, asOf)` walks payments chronologically, accrues interest per interval, allocates interest-then-principal, and compounds capitalised interest. Also `monthsElapsed`/`daysElapsed`/`calculateAccruedInterestForInterval`. No I/O. |
| `PavatiReceipt.tsx` | Printable pledge receipt (Pavati) — shop header, borrower, pledged-item table, loan amount/rate/net wt, terms. Paper-size + accent-colour aware, i18n via `receiptT`. |
| `PaymentReceipt.tsx` | Printable voucher for a single payment (Part Repayment / Renewal / Closure), showing amount received split into interest vs principal. |

## Data model & entities
Types in `src/db/types.ts`:
- **`Loan`** — `loanNo` ("GRV0001"), `customerId`, `date`, `itemsPledged: PledgedItem[]`, `grossWt`, `netWt`, `loanAmount`, `interestRate` (%/month), optional `collateralImage`/`collateralThumbprint` (base64 data-URLs), `interestMode` ("monthly" | "daywise"), `principalOutstanding` (current remaining principal), `isClosed`, `closedDate?`, `amountCollected?`, `createdAt`.
- **`PledgedItem`** — `description`, `grossWt`, `netWt`, `purity`, `estimatedValue`.
- **`LoanPayment`** — `loanId`, `date`, `amount`, `towardsInterest`, `towardsPrincipal`, `capitalisedInterest?` (interest rolled into principal at renewal — not cash), `type` ("part" | "renewal" | "closure"), `notes?`.
- Dexie tables: `loans`, `loan_payments`.

## Services & data flow
`loansService` = `pick(loansServiceDexie, sqlite?.loansService)` (dual backend, exported from `dbService.ts`; SQLite mirror in `sqliteServices.ts`). Exports: `getAll`, `get`, `getOpen`, `getPayments(loanId)`, `getAllPayments`, `add`, `update`, `addPayment`, `close`.
- **`add`** — allocates next `loan` sequence with prefix `GRV`, sets `isClosed:false` and `principalOutstanding = loanAmount`.
- **`addPayment`** (atomic transaction, identical logic in both backends): computes dues via `computeLoanDues` up to payment date → allocates cash **interest first, then principal** (each clamped to what's owed) → on `type: "renewal"` the unpaid interest shortfall is **capitalised** (added to principal, compounds); part/closure never capitalise → recomputes post-payment dues → updates `principalOutstanding`, and only sets `isClosed` when **both** principal and interest reach zero (an underpaying "closure" leaves the loan open — collateral not released).
- UI reads via `useLiveData`; `interest.ts` is the single source of truth for dues in both the page table, the details dialog, and the service.
- `close` exists on the service but the UI closes loans by recording a `closure` payment through `addPayment`, not by calling `close` directly.

## User-facing flows
Entry: sidebar **"Girvi (Loans)"** → `/girvi`.
- **Create loan:** "New Loan" button (header / empty state) → `LoanFormDialog`.
- **Row icon actions** (rightmost table column):
  - **Eye = View Details** → `LoanDetailsDialog` (all loans).
  - **Receipt = View Pavati** → `PavatiReceipt` (all loans).
  - **Lock = Close / Redeem** → inline `CloseLoanDialog` quick-close (amount prefilled to total dues). **Open loans only** (icon hidden when closed).
- **Inside View Details dialog** — the following live ONLY here and ONLY for **open loans** (the whole action panel is gated on `!loan.isClosed`):
  - **Part Payment** (amount must be > 0)
  - **Renew Loan** (amount prefilled to interest outstanding; may be recorded for 0 = full rollover, all unpaid interest capitalised — a warning shows the capitalised amount)
  - **Close Loan** (amount prefilled to total dues; warns if less than dues)
  - **WhatsApp** reminder button (uses `company.templateGirvi` / `defaultWaTemplate`, `openWhatsApp`)
  - Submitting any of the three actions calls `addPayment` and immediately opens the `PaymentReceipt` voucher.
- **Print Pavati** button in the details dialog is available for any loan (open or closed); the ledger's per-row printer icon reprints that payment's voucher.

## Cross-feature connections
- **Customers** — `customersService` for borrower name/mobile/address (combobox on create, lookups in table/receipts).
- **Sequences** — `nextSequence("loan", { prefix: "GRV" })` for loan numbers.
- **Company/session** — `useSession().company` drives receipt shop header, logo, paper size (`A4`/`A5`/`80mm` thermal), accent colour, terms text, `receiptLanguage`, and the WhatsApp Girvi template.
- **WhatsApp** — `@/lib/waTemplates` (`fillTemplate`, `defaultWaTemplate`, `openWhatsApp`).
- **Receipts i18n** — `@/lib/receiptI18n` (`receiptT`).
- **POS grid cells** — reuses `NumCell`/`TextCell` from `@/features/pos/GridCells` in the pledged-items grid.
- **Cash book / reports** — `dbService.ts` day-book aggregates loans as "Loan disbursed (Girvi)" outflow and "Loan redeemed" inflow (`amountCollected`).

## Gotchas & notes
- **Interest allocation is always interest-before-principal**, both clamped; the recorded split lives on each `LoanPayment` (`towardsInterest`/`towardsPrincipal`).
- **Capitalisation** happens only on `renewal`: unpaid interest becomes `capitalisedInterest`, is added to principal, and **compounds** on future intervals. It is not a cash receipt.
- **A loan closes only when principal AND interest are both ≤ 0.** A short "closure" payment keeps it open (collateral stays pledged). The Lock/quick-close and details-dialog Close both go through `addPayment` and are subject to this rule.
- `monthsElapsed` rounds a partial month **up** (min 1); day-wise uses `rate/30 × days`. Both `daysElapsed`/`monthsElapsed` return **min 1** even for same-day.
- `LoanDetailsDialog` re-fetches the loan live (`loansService.get`) because the parent passes a stale list snapshot — needed so badges/action buttons flip after a payment.
- Collateral image + thumbprint are stored inline as base64 data-URLs (offline-first, ≤3 MB each) — can bloat the DB row.
- The Part/Renew/Close action panel and WhatsApp button are all hidden once the loan is closed; a closed loan can still be viewed and its Pavati/vouchers reprinted.
- `principalOutstanding` on the `Loan` is a cached convenience field; the authoritative live figures always come from `computeLoanDues`.
