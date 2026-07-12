# Daybook — Context

**Purpose:** Daily transactions ledger — a per-day dashboard of sales KPIs (sales, old-gold/URD, GST, cash/UPI collected, credit given, loans disbursed) plus the day's sales-invoice list, with quick edit-in-POS.

## Key files
| File | Responsibility |
|------|----------------|
| `DayBookPage.tsx` | Whole feature: date navigator (prev/next/today), 8 KPI cards, and the sales-invoice table. `shiftDay` helper shifts an ISO date by N days. |

## Data model & entities
- **DayBookSummary** (derived) — `date`, `invoiceCount`, `totalSales`, `totalUrdPurchase`, `totalTax`, `cashCollected`, `upiCollected`, `outstandingCreated`.
- Reads **SalesInvoice** rows (`invoiceNo`,`customerId`,`totalGrossAmount`,`totalUrdAmount`,`netAmount`,`cashPaid`,`upiPaid`,`balance`) and **Loan** rows for disbursements.

## Services & data flow
- `reportsService.getDayBook(date)` — aggregates all invoices with `date === date` into the summary (sums gross/URD/tax/cash/UPI/balance).
- `salesService.getInvoicesByDate(date)` — the day's invoice list; `salesService.getFull(id)` to load one for editing.
- `customersService.getAll` — id→name map.
- `loansService.getAll` — filtered client-side to `l.date === date` for "Loans Disbursed".
- "Net Collected" = cash + UPI (computed in-page).

## User-facing flows
1. Navigate days (◀ / date input / ▶ / Today); future days disabled.
2. Review KPI cards for the selected day.
3. **Edit a bill** — pencil icon → `salesService.getFull` → `usePosStore.loadForEdit(full)` → `navigate("/billing")`.

## Cross-feature connections
- **POS** — shares `usePosStore` (`loadForEdit`) and navigates to `/billing` to modify an invoice; consumes POS invoice data.
- **Girvi** — loans disbursed count/total via `loansService`.
- **Customers** — name lookup.

## Gotchas & notes
- Loans are fetched in full then filtered by date in-memory (no indexed by-date query here).
- All figures are read-only aggregations; the only mutation path is editing an invoice, which happens in POS.
- `shiftDay` normalises around timezone offset to keep ISO `YYYY-MM-DD` stable.
