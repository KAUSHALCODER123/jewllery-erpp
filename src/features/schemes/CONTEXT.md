# Schemes — Context

**Purpose:** Gold saving / instalment plans (classic "pay 11, get 12"). Manage scheme plans, enrol customers into scheme accounts, record monthly instalments, track the due schedule, and print per-payment chit receipts.

## Key files
| File | Responsibility |
|------|----------------|
| `SchemesPage.tsx` | Full feature: two tabs (Accounts / Scheme Plans), plus in-file dialogs `NewSchemeDialog`, `EnrollDialog`, `PayInstallmentDialog`, `AccountDetailsDialog` (schedule + WhatsApp reminder). |
| `ChitReceipt.tsx` | Printable "SCHEME PAYMENT RECEIPT" overlay for a single `SchemePayment` (thermal 80mm / A5 / A4, accent colour, logo from company profile). |

## Data model & entities
- **Scheme** — plan template: `code` (SCH###), `name`, `monthlyAmount`, `durationMonths`, `bonusMonths`. Maturity value = `monthlyAmount * (durationMonths + bonusMonths)`.
- **SchemeAccount** — an enrolled customer: `accountNo` (GSA…), `schemeId`, `customerId`, `startDate`, `status` (`active` | `matured`).
- **SchemePayment** — one instalment: `accountId`, `installmentNo`, `amount`, `date`, `mode` (`PaymentMode`), optional `dueDate`.
- **SchemeScheduleRow** (derived, not stored) — one row per instalment 1..durationMonths, with `dueDate` computed via `addMonths(startDate, n-1)` and `paid`/`paidOn`/`mode` merged from payments.

## Services & data flow
`schemesService` (from `dbService.ts`, `pick(schemesServiceDexie, sqlite?.schemesService)`):
- `getSchemes`, `addScheme`, `getAccounts`, `getAccount`, `enroll(schemeId, customerId, startDate)`, `getPayments(accountId)`, `getAllPayments`, `getSchedule(accountId)`, `addPayment(...)`, `setStatus(accountId, status)`.
- `addPayment` runs in a Dexie transaction and **guards against double-paying** an instalment; with no `installmentNo` it fills the lowest unpaid slot.
- Also uses `customersService.getAll/get`. Account list rows compute `paid`/`count` by aggregating `getPayments` per account inside `useLiveData`.

## User-facing flows
1. **New Plan** (Plans tab) → `NewSchemeDialog` → `addScheme`.
2. **Enroll Customer** (Accounts tab) → `EnrollDialog` (CustomerCombobox + scheme select) → `enroll`.
3. **Record instalment** — rupee icon or "Pay" in the schedule → `PayInstallmentDialog` → `addPayment` → auto-opens `ChitReceipt` to print.
4. **Account details** — click account no / eye icon → `AccountDetailsDialog` shows the full schedule (Paid / Due / Overdue), reprint receipts, and **WhatsApp reminder** for the next unpaid due.
5. **Mark matured** — when payments ≥ durationMonths → `setStatus(..,"matured")`.

## Cross-feature connections
- **Customers** — accounts reference `customerId`; CustomerCombobox for enrolment.
- **useSession company** — print header (name/address/phone/logo/paper size/accent) and `templateScheme` / `receiptLanguage` for WhatsApp.
- **waTemplates** (`fillTemplate`, `defaultWaTemplate("scheme")`, `openWhatsApp`) — instalment reminders.
- **Settings → Msg Templates** edits `templateScheme`; **Settings → Print** drives ChitReceipt styling.
- Distinct from `receipt-designer` (that is a separate visual designer feature).

## Gotchas & notes
- `getSchedule` returns `[]` if the scheme or account is missing — the details dialog then shows no rows.
- Bonus months affect only the displayed maturity value; the payable schedule is `durationMonths` long.
- "matured" is set manually (no auto-maturation job); the button appears only once all instalments are recorded.
- ChitReceipt "Next Due Date" uses `addMonths(startDate, installmentNo)`; shows "SCHEME MATURED" on the final instalment.
