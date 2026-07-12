# Receipt — Context

**Purpose:** "Udhari Collection" — record a payment received against a customer's outstanding (credit) balance, then print a payment voucher. This is a standalone cash-receipt, separate from POS invoice payments.

## Key files
| File | Responsibility |
|------|----------------|
| `ReceiptPage.tsx` | Whole feature: left form (customer + amount + mode + date + notes), right "Recent Receipts" searchable table, and the in-file `ReceiptVoucher` print overlay (120mm). |

## Data model & entities
- **Receipt** — `receiptNo` (RCP…), `customerId`, `amount`, `mode` (`PaymentMode`: cash/upi/card/cheque), `date`, optional `notes`, `createdAt`.

## Services & data flow
`receiptsService` (`pick(receiptsServiceDexie, sqlite?.receiptsService)`):
- `getAll` (id desc), `getByCustomer`, `getByDate`, `add(input)` — mints `receiptNo` via `nextSequence("receipt", {prefix:"RCP"})` in a Dexie transaction.
- `customersService.getOutstanding(customerId)` drives the live "Current Outstanding" figure and the projected balance-after.
- On save: `add(...)` → toast → open `ReceiptVoucher` with `balanceAfter = outstanding − amount`.

## User-facing flows
1. Pick customer (CustomerCombobox) → outstanding shown (Dr / "No dues").
2. Enter amount, mode, date (max today), optional notes → **Save & Print Receipt**.
3. Voucher overlay prints (company header from session); recent receipts list refreshes live and is searchable by receipt no / customer name.

## Cross-feature connections
- **Customers** — `getOutstanding` is derived from invoices/receipts; receipts feed back into that balance.
- **Reports** — receipts appear in `ledgerService.customerLedger` (as credits) and `cashBook` ("Udhari collection" inflow).
- **useSession company** — voucher print header (name/address/city).
- Note: this feature does **not** use the receipt-designer or the schemes ChitReceipt.

## Gotchas & notes
- `balanceAfter` is a display value computed in the page (`outstanding − amount`), not re-read from the DB.
- The voucher is a fixed 120mm layout and does **not** honour company `printPaperSize`/accent (unlike ChitReceipt / POS invoice).
- No edit/delete of receipts from this page — add-only.
