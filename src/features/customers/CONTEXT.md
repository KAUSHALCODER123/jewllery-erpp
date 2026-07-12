# Customers — Context

**Purpose:** Master list of shop customers/parties. Create, edit, delete, search and Excel-export customer records with KYC (PAN/Aadhaar/GSTIN), contact, marketing dates (birthday/anniversary), opening balance and loyalty points. Displays each customer's live outstanding (Udhari) balance computed from opening balance + unpaid invoices.

## Key files
| File | Responsibility |
|------|----------------|
| `CustomersPage.tsx` | Main page (route `/customers`, title "Customers"). Live-loads customers + invoices, computes outstanding per customer, search by name/mobile, Excel export, empty-state demo-seed, row menu (Edit / Delete). |
| `CustomerFormDialog.tsx` | Create/Edit form (react-hook-form + zod `customerSchema`). Fields: name, mobile, email, city, address, PAN, Aadhaar, GSTIN, birth date, anniversary, opening balance, loyalty points. Enforces company loyalty-points cap. |

## Data model & entities
`Customer` (`src/db/types.ts:51`): `id`, `name`, `mobile`, optional `address`, `city`, `email`, `pan`, `aadhaar`, `gstin`, `birthDate`, `anniversary` (ISO dates for marketing), `openingBalance` (positive = customer owes shop / Udhari; negative = advance held), `loyaltyPoints`, `createdAt`, `updatedAt`.

## Services & data flow
`customersService` = `pick(customersServiceDexie, sqlite?.customersService)` (`dbService.ts:1786`). Dexie impl `dbService.ts:193`:
- `getAll()` — ordered by name.
- `get`, `add` (defaults loyaltyPoints/openingBalance to 0, timestamps), `update` (bumps `updatedAt`), `remove` (hard delete).
- `search(term)` — name or mobile substring.
- `getOutstanding(customerId)` — `openingBalance + Σ invoice.balance − Σ standalone receipts.amount` (positive = owes shop).

Reactivity: page uses `useLiveData` on `customersService.getAll()`, `salesService.getInvoices()`, and `receiptsService.getAll()`. **Outstanding shown in the table is computed in the page** as `openingBalance + Σ invoice.balance − Σ standalone receipts.amount` per customer — the same formula as the service's `getOutstanding`, so the list and per-customer lookups agree. Rendered as "Dr" (owes, red) / "Cr" (advance, green) / "—".

Demo data via `seedCustomersIfEmpty()`; Excel via `exportObjectsToExcel`.

## User-facing flows
1. **Browse/search** — search name or mobile; table shows name, mobile, city, PAN, loyalty, outstanding (Dr/Cr).
2. **Create/Edit** — dialog; positive opening balance = Udhari; loyalty points cannot exceed company `loyaltyMaxPoints` cap (when set) — validated on submit.
3. **Delete** — row menu with confirm.
4. **Export** — filtered rows to `.xlsx` (includes computed Outstanding via service-style `outstandingFor`).

## Cross-feature connections
- **Sales/POS** — `salesService.createInvoice` sets `customerId`, applies loyalty delta (`pointsEarned − pointsRedeemed`, floored at 0) to `customer.loyaltyPoints`; invoice `balance` feeds the outstanding calc.
- **Receipts (Udhari collection)** — `receiptsService` records payments against a customer; the service's `getOutstanding` subtracts these (the page's inline calc does not).
- **Company settings** — `loyaltyMaxPoints` cap enforced in the form.
- Customers are the party master referenced by orders, girvi (pledge), schemes, etc.

## Gotchas & notes
- **Outstanding is computed in two places** — the page's inline `outstandingByCustomer` and `customersService.getOutstanding` — but both now use the same formula (`opening + invoice balances − standalone receipts`). Keep them in sync if either changes.
- Loyalty cap only enforced in the form (`company.loyaltyMaxPoints`); a cap of 0 / unset means no limit.
- `openingBalance` sign convention: positive = owes (Dr), negative = advance (Cr).
- Delete is a hard delete with no referential guard against existing invoices/receipts.
- List sorted by name (service `getAll` orderBy name); search is client-side substring on the live list.
