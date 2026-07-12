# Reports — Context

**Purpose:** Accounting & GST reporting derived from live business data — party ledger, daily cash book, sundry debtors, GSTR-1, and HSN summary, with CSV/Excel export and WhatsApp dues reminders.

## Key files
| File | Responsibility |
|------|----------------|
| `ReportsPage.tsx` | Five tabs, each an in-file component: `PartyLedger`, `CashBook`, `Debtors`, `Gstr1`, `HsnSummary` (plus `SummaryCard`/`Placeholder` helpers). |

## Data model & entities
All rows are **derived** (not stored) via `ledgerService` interfaces:
- **LedgerEntry** — `date`,`ref`,`particulars`,`debit`,`credit`,`balance` (Dr positive).
- **CashBookRow** — `ref`,`particulars`,`inflow`,`outflow`.
- **Gstr1Row** — `invoiceNo`,`date`,`party`,`gstin`,`taxable`,`cgst`,`sgst`,`igst`,`total`,`type` (B2B/B2C).
- HSN row — `hsn`,`description`,`qty`,`netWt`,`taxableValue`,`cgst`,`sgst`,`igst`.

## Services & data flow
`ledgerService` (`pick(ledgerServiceDexie, sqlite?.ledgerService)`):
- `customerLedger(customerId)` — opening balance + invoices (net as debit, paid-with-bill as credit) + receipts (credit), chronological running balance → `{opening, rows, closing}`.
- `cashBook(date)` — inflow/outflow across sales receipts, udhari receipts, order advances, and loans for the day.
- `sundryDebtors()` — customers with outstanding > 0 (name, mobile, outstanding, last txn date).
- `gstr1(month)` and `gstHsnSummary(month)` — GST aggregation over sales invoices/items.
- Export: `toCsv`+`downloadText` (CSV) and `xlsx` (`XLSX.writeFile`) for GSTR-1 / HSN / Debtors.

## User-facing flows
1. **Party Ledger** — pick customer → full Dr/Cr ledger with closing balance.
2. **Cash Book** — pick date → in/out/net totals + rows.
3. **Sundry Debtors** — list of who owes, total dues, CSV export, per-row **WhatsApp** reminder (`templateDues`).
4. **GSTR-1** — pick month → summary cards + table, Export CSV / Excel.
5. **HSN Summary** — pick month → per-HSN table with totals row, Export Excel.

## Cross-feature connections
- Reads from **POS** (`sales_invoices`, `sales_items`), **Receipt** (`receipts`), **Orders** (advances), **Girvi** (`loans`), **Customers**.
- **useSession company** + **waTemplates** for the debtors WhatsApp reminder.
- GST rates/HSN originate from **Settings** defaults (applied at billing time).

## Gotchas & notes
- Everything is computed on read (no report tables); large datasets recompute each `useLiveData` run.
- Ledger sign convention: positive balance = Dr (customer owes); closing < 0 shows Cr.
- Cash book aggregates loans by scanning all loans and filtering by date (not an indexed query).
