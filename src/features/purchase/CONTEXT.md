# Purchase & Suppliers — Context

**Purpose:** Record stock purchases from vendors (jewellery, bullion/sarafa, etc.), manage the supplier master, track what the shop owes each vendor, take vendor payments, and process purchase returns. Ticked purchase lines can be minted directly into live inventory (Item Master).

## Key files
| File | Responsibility |
|------|----------------|
| `PurchasePage.tsx` | Route entry (`/purchase`). Tabbed shell: Purchases (dashboard metrics + search/vendor/type/payment filters + Excel export + table), Suppliers (list with outstanding, opens ledger/edit/pay), Returns (list). Owns dialog open-state and computes per-supplier outstanding. |
| `PurchaseFormDialog.tsx` | The "New Purchase" grid. Editable line rows (description, category, purity, gross/stone wt, rate, making/g, advanced: stone/other/discount/HUID). Live per-row + total math (net wt, pure gold, amount, GST, avg cost/g, est. profit/margin). On save: creates the invoice, then best-effort inserts ticked rows into stock. |
| `SupplierFormDialog.tsx` | Add/edit a Supplier. Basic fields + collapsible advanced (KYC, bank, credit limit, terms, rating, notes). `onSaved` callback returns the created supplier (used by PurchaseFormDialog to auto-select a just-added vendor). |
| `VendorPaymentDialog.tsx` | Record a vendor payment against a specific unpaid bill or "on account". |
| `VendorLedgerDialog.tsx` | Read-only vendor summary: outstanding, total purchases, purchase history + payment history. Has a "Record Payment" button that bubbles up via `onPay`. |
| `ReturnDialog.tsx` | Record a purchase return against a bill; reduces the bill's payable and writes a stock-out ledger entry. |

## Data model & entities
- **Supplier** — vendor master (name, mobile, GSTIN/PAN, bank, `creditLimit`, `paymentTerms`, `rating`, `status` active/inactive, `openingBalance` — positive = shop owes vendor).
- **PurchaseInvoice** — header: `purchaseNo` (PUR-seq), `supplierId`, `billNo?`, `date`, `purchaseType`, `paymentMode`, `goldRate?`, `totalGrossAmount`, `cgst`, `sgst`, `netAmount`, `amountPaid`, `balance`.
- **PurchaseItem** — line: description, type (MetalType), purity, grossWt/stoneWt/netWt, pureGoldWt, rate, makingAmount, stoneCost/otherCharges/discount, costPerGram, huid, amount, `purchaseId` FK.
- **PurchasePayment** — `supplierId`, optional `purchaseId` (absent = on-account), date, amount, mode, notes.
- **PurchaseReturn** — `returnNo` (RET-seq), `purchaseId?`, `supplierId`, date, amount, weight?, reason, notes.
- **Item** (Item Master, cross-feature) — inventory record minted from a ticked purchase line; `tag` auto-minted from the category prefix.
- `PurchaseDraft` (exported from dbService) = `{ invoice, items }` — the shape `purchaseService.create` accepts.

## Services & data flow
All services come from `@/services/dbService` and follow the dual-backend `pick(dexieImpl, sqlite?.impl)` pattern; UI subscribes reactively via `useLiveData`.
- `purchaseService` — `getInvoices()`, `getInvoicesByDate()`, `getLineItems(purchaseId)`, `create(draft)`. `create` is **atomic** (Dexie transaction over `purchase_invoices` + `purchase_items` + `counters`): mints `purchaseNo`, adds header, bulk-adds line items.
- `itemsService.add(...)` — inserts one inventory Item, minting a sequential `tag` from `tagPrefix` (category prefix, fallback "ITM"). Called per ticked row **after** the invoice is committed.
- `suppliersService` — `getAll` (ordered by name), `get`, `add`, `update`, `remove`, `getOutstanding(id)` (opening + unpaid balances − on-account payments).
- `purchasePaymentsService` — `getAll`, `getBySupplier`, `getByPurchase`, `add`. `add` is atomic: writes the payment and, if tied to a bill, updates that invoice's `amountPaid`/`balance`.
- `purchaseReturnsService` — `getAll`, `getBySupplier`, `create`. `create` is atomic: mints `returnNo`, reduces the bill's `netAmount`/`balance`, and writes an inventory-ledger stock-out row.

**Save flow (PurchaseFormDialog):** validate (supplier required, ≥1 item, no negatives, duplicate bill-no per supplier, duplicate HUID) → build `PurchaseDraft` → `purchaseService.create` in a try/catch (failure aborts). The purchase is now committed. Then loop the ticked rows with **independent per-row try/catch** calling `itemsService.add`; failures are collected and surfaced in a toast but never abort the others or masquerade as a purchase-save failure.

## User-facing flows
1. **New Purchase** — grid of item rows, live totals, "Add to stock" checkbox per row (default on), GST + payment + amount-paid → Save. Toast reports purchaseNo and how many items were added to stock (or which failed).
2. **New/Edit Supplier** — form dialog; inline "new supplier" (UserPlus) from inside the purchase form auto-selects the created vendor.
3. **Pay Vendor** — against a specific unpaid bill or on account.
4. **Vendor Ledger** — click a supplier row to view outstanding + purchase/payment history.
5. **Return** — from a purchase row's action menu; reduces payable, logs stock-out.
6. **Dashboard/filters/Excel** — metrics (today/month spend, pending payments, outstanding vendors, bullion count, avg gold rate), text/vendor/type/payment-status filters, Excel export of the filtered set.

## Cross-feature connections
- **Item Master / Inventory** (`itemsService`) — ticked purchase lines mint sellable Items with auto-tags (feeds POS/stock).
- **Inventory ledger** — purchase returns write an `inventory_ledger` stock-out row (shared audit trail with refining, etc.).
- **POS** — imports `NumCell`/`TextCell` from `@/features/pos/GridCells` and `GST_RATES` from `@/features/pos/calc`.
- **Constants** (`@/lib/constants`) — `CATEGORIES`, `categoryByLabel` (category → tag prefix + default metal type), `PURCHASE_TYPES` (type → metal), `purchaseTypeLabel`, `PURCHASE_RETURN_REASONS`.
- **Session** — payments/returns stamp `createdBy` from `useSession().user`.

## Gotchas & notes
- **Two-phase save is deliberate.** Invoice creation and stock insertion are separate; a failing stock insert must not roll back or mislabel the committed purchase. Consequence: a bill can exist with some ticked items NOT in stock (toast warns).
- **Purchase `create` is atomic; the stock-add loop is not** — no transaction wraps the per-row `itemsService.add` calls.
- **Fineness parsing** (`finePct`) handles "22K", "916", and "22K (916)" forms; used for pure-gold weight. Note `costPerGram` on the line = amount/netWt, distinct from the header avg.
- **Outstanding** is computed in the page (opening + invoice balances − on-account payments) AND in `suppliersService.getOutstanding`; keep both in sync if the formula changes.
- **Duplicate guards:** same bill-no for the same supplier is blocked; duplicate HUIDs within one purchase are blocked.
- Rows are kept if description is non-empty OR grossWt > 0; the grid always keeps at least one row.
- Gold-rate change propagates to rows whose rate still equals the old gold rate or 0 (doesn't clobber manually-edited rates).
