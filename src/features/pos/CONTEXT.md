# POS (Point of Sale) — Context

**Purpose:** Keyboard-first billing screen where a jewellery shop rings up a sale — new items (scanned by barcode tag or entered by hand), old-gold taken in part-exchange (URD), discounts, GST/TCS, loyalty redemption, and payments — then saves the invoice and prints/WhatsApps a receipt. It is the largest feature and doubles as the invoice *editor*.

## Key files
| File | Responsibility |
|------|----------------|
| `PosPage.tsx` | Layout shell: top bar + `Sales`/`URD` tabs (left) + checkout (right); hosts the print overlay; shows the "editing invoice" banner; seeds the firm's default GST rate onto a fresh empty bill. |
| `usePosStore.ts` | Zustand store holding the whole working bill (customer, sales lines, URD lines, GST/TCS/discounts, payments, loyalty, order link, edit state). Actions: add/update/remove lines, `addFromItem`, `loadForEdit`, `reset`. |
| `calc.ts` | Pure, side-effect-free billing math (`lineAmount`, `urdAmount`, `computeTotals`) + `GST_RATES` list. Single source of truth for numbers shown in grid, checkout, receipt, and saved invoice. |
| `SalesGrid.tsx` | New-item ledger: barcode scan bar (Enter/F10), blank-row add, editable dense table, per-line & footer totals. |
| `UrdGrid.tsx` | Old-gold/scrap ledger: gross wt, less %, net wt, rate → credited amount deducted from bill. |
| `GridCells.tsx` | `NumCell`/`TextCell` — compact borderless table inputs, select-all on focus, clamp to `min` (default 0), never emit NaN. |
| `PosTopBar.tsx` | Customer picker (searchable combobox), quick "walk-in" add (F8 to open), new-customer dialog, live "Past Pending" (Udhari) badge. |
| `CheckoutPane.tsx` | Right rail: discounts, totals breakdown, GST (intra/inter-state), TCS, loyalty redeem/earn, advance, payments, balance; `handleSave` builds the `SaleDraft` and calls create/update; F12 = Save & Print, F9 = toggle interstate. |
| `InvoiceReceipt.tsx` | Full-screen printable receipt overlay rendered in the Receipt-Designer-defined block order; Print + WhatsApp + Close; multi-paper-size (A4/A5/80mm thermal), accent color, i18n, HUID/barcode. |

## Data model & entities
Reads/writes three tables (types in `src/db/types.ts`):
- **sales_invoices** (`SalesInvoice`): `invoiceNo` (minted "INV####"), `customerId`, `date`, `totalGrossAmount`, `totalUrdAmount`, `billDiscount`, `makingDiscount`, `taxableAmount`, `cgst`/`sgst`/`igst`, `tcs`, `interState`, `salesman`, `loyaltyDiscount`, `pointsEarned`/`pointsRedeemed`, `netAmount`, `cashPaid`, `upiPaid`, `balance`, `notes`, `orderId`, `advanceApplied`, `createdAt`.
- **sales_items** (`SalesItem`): per new-jewellery line — `invoiceId`, optional `itemId` (link to stock), `description` snapshot, `netWt`, `rate`, `makingAmount`, `hsn` (default "7113"), `finalAmount`.
- **urd_items** (`UrdItem`): per old-gold line — `invoiceId`, `description`, `type` (MetalType, hard-coded "gold" here), `purity` ("—"), `grossWt`, `deductionWt`, `netWt`, `rate`, `amount`.

Also reads **customers** (loyalty balance, outstanding) and **items** (stock lookup by tag, HUID for receipt); writes `items.status` (sold/in_stock), `customers.loyaltyPoints`, and `orders.status`.

The in-memory store lines (`SalesLine`/`UrdLine` in `calc.ts`) differ from the DB rows: they use a local `id` (crypto.randomUUID), and store `makingPerGm` / `lessPct` rather than the DB's `makingAmount` / `deductionWt` — converted at save time in `CheckoutPane.handleSave` and back in `usePosStore.loadForEdit`.

## Services & data flow
- **`salesService`** (`dbService.ts:282`, `SaleDraft` at :276): `createInvoice` (`:302`) persists the whole sale in one transaction — mints invoice no via `nextSequence("invoice",{prefix:"INV"})`, bulk-adds items/URD, marks tagged stock `sold`, applies loyalty delta (`pointsEarned − pointsRedeemed`, clamped ≥0), and marks a linked order `delivered`. `updateInvoice` (`:369`) restores old lines' stock to `in_stock`, deletes old lines/URD, rewrites header (keeps original `invoiceNo`/`date`/`createdAt`), re-marks new stock sold. `getFull` (`:350`) loads header+lines+URD for editing.
- **`customersService`**: `get`, `getAll`, `add` (walk-in), `getOutstanding` (`:229`, opening balance + Σ invoice balances − Σ receipts).
- **`itemsService`**: `getByTag` (barcode scan, `:125`), `getByIds` (resolve HUID for receipt, `:128`).
- **Reactivity via `useLiveData`**: customer record + loyalty balance (`CheckoutPane`), customer list + live outstanding (`PosTopBar`), receipt customer + item HUIDs (`InvoiceReceipt`). The bill itself is *not* live — it lives in the Zustand store.
- **Web vs desktop**: services are selected by `pick(dexieImpl, sqlite?.impl)` — `salesService` = `pick(salesServiceDexie, sqlite?.salesService)` (`dbService.ts:1787`). The SQLite port (`sqliteServices.ts:317`) mirrors the same atomic create/update/getFull/getOutstanding behavior. The POS UI is backend-agnostic.

## User-facing flows
1. **Pick / add customer** — search combobox in `PosTopBar` (F8), or type a name and "Add as walk-in" (creates a minimal customer on the fly), or full New-customer dialog. Past-pending (Udhari) shows live.
2. **Add sale items** — scan/type a barcode tag + Enter (F10 refocuses) → `itemsService.getByTag` → `addFromItem` (dedupes same tag+itemId; warns if already sold); or "Blank row" for untagged items; edit cells inline.
3. **Add old gold (URD)** — switch to the URD tab, add rows (gross wt, less %, rate); value is deducted from the bill.
4. **Set discounts / GST / TCS** — bill & making discounts, GST rate dropdown, inter-state IGST checkbox (F9), TCS %.
5. **Loyalty** — redeem available points (₹ per point) and see points earned (capped by firm max); only on *new* bills, not edits.
6. **Take payment** — cash + UPI ("full" button); balance shows Due / Change / Settled.
7. **Save & Print (F12)** — validates customer + ≥1 item, builds `SaleDraft`, calls create or update, toasts the invoice no + amount, opens the receipt overlay, resets the bill.
8. **Print / WhatsApp receipt** — from the overlay: browser print (respects paper size & designed layout) or WhatsApp using the firm's invoice template.

## Cross-feature connections
- **Items / Inventory** — barcode lookup by tag; saving flips `item.status` to `sold` (and back to `in_stock` when an invoice is edited/re-saved).
- **Customers** — customer selection, walk-in creation, loyalty balance, outstanding/Udhari.
- **Loyalty (Settings)** — reads firm's `loyaltyRupeesPerPoint`, `loyaltyEarnPerGram`, `loyaltyMaxPoints`; writes earned/redeemed points to the customer.
- **Orders** — `OrdersPage` calls `posStore.setOrderLink` + `addSalesLine` and navigates to `/billing`; saving the sale marks the order `delivered` and adjusts the advance.
- **Day Book / Invoices** — `DayBookPage` calls `salesService.getFull` → `loadForEdit` → navigates to `/billing` to edit an invoice.
- **Receipt Designer** — `InvoiceReceipt` renders blocks in the order/enabled-set from `company.receiptLayout` via `parseReceiptLayout` (`features/receipt-designer/layout.ts`); honors paper size, accent color, logo, bank details, HUID, terms.
- **WhatsApp** — receipt "WhatsApp" button uses `lib/waTemplates` (`fillTemplate`, `openWhatsApp`) + `company.templateInvoice`.
- **Shared by other features** — `calc.ts` `GST_RATES` and `GridCells` (`NumCell`/`TextCell`) are reused by Orders, Purchase, and Girvi forms.

## Gotchas & notes
- **Store snapshots GST at module load** (`usePosStore.ts:92`, before login). `PosPage` re-applies the firm's `defaultGstRate` to a fresh empty bill in a `useEffect`; `reset()` re-reads it for subsequent bills.
- **Edit mode preserves loyalty**: when `editingInvoiceId` is set, the original `loyaltyDiscount`/`pointsRedeemed` are kept and `pointsEarned` is forced to 0, so re-saving an edit never re-charges/re-awards points or inflates the total (`CheckoutPane.tsx:74-101`).
- **`loadForEdit` reverse-derives** `gstRate` and `tcsPct` from the stored amounts (`gst/taxable`, `tcs/taxable`) and `makingPerGm`/`lessPct` from stored amounts — small rounding is possible on re-open.
- **`computeTotals` never goes negative**: taxable is clamped ≥0; discounts, URD, and loyalty all subtract before tax. Rounding is 2-dp for money, 3-dp for weights.
- **Save guard**: `canSave` needs a customer *and* ≥1 sales line; URD-only bills can't be saved. `handleSave` also toasts on missing customer/items.
- **HSN defaults to "7113"** and URD `type`/`purity` are hard-coded ("gold"/"—") at save — the URD grid doesn't capture metal type or purity.
- **`addFromItem` dedupes** only when both `tag` and `itemId` match; a sold item can still be added (warns, doesn't block).
- **Receipt is a print overlay** (`fixed inset-0`), driven by CSS `no-print`/`print-area` classes and `window.print()`; thermal (80mm) hides HSN column and shrinks fonts.
- **Both create & update run in a single DB transaction** across invoices/items/urd/items/customers/orders, so a mid-failure rolls the whole sale back.
