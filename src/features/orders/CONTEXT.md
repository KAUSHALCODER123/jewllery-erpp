# Orders — Context

**Purpose:** Books and tracks customer jewellery orders (custom, repair, bridal, exchange, etc.) from initial booking through a multi-stage production workflow to delivery/billing. Handles pricing estimates, advance payments, workshop assignment, and a visual status timeline.

## Key files
| File | Responsibility |
|------|----------------|
| `OrdersPage.tsx` | Main screen: dashboard metrics, search/filter toolbar, orders table, row status dropdown, per-row action menu (details, timeline, notify, advance, reserve gold, assign workshop, deliver, duplicate, cancel), Excel export. Route `/orders`. |
| `OrderFormDialog.tsx` | "New Order" dialog. Customer + type, item grid, live pricing (gold value, making, GST, balance, profit/margin), advanced options; saves via `ordersService.add` as `draft` or `confirmed`. |
| `OrderDetailDialog.tsx` | Read-only detail view: customer, items, pricing breakdown, advance-payment ledger, linked workshop (karigar) jobs, remarks. Printable (`window.print()`). |
| `OrderTimelineDialog.tsx` | Vertical stepper of `ORDER_WORKFLOW` stages showing which are reached (from `statusHistory`), with timestamps/actor/remarks; special cancelled banner. |
| `ReceiveAdvanceDialog.tsx` | Records an advance payment against an order via `ordersService.addPayment`. |
| `AssignWorkshopDialog.tsx` | Issues metal to a karigar (`karigarsService.issueJob`) and moves order to `assigned_workshop`, linking job to order via `orderId`. |

## Data model & entities
Defined in `src/db/types.ts`:
- **`Order`** (`types.ts:447`) — `orderNo` (ORD-prefixed sequence), `customerId`, `date`, `deliveryDate?`, `orderType?`, `priority?` (`normal`/`urgent`), `items: OrderItem[]`, `estimatedAmount` (headline total incl. GST), optional pricing breakdown (`goldRate`, `goldValue`, `makingCharges`, `stoneCharges`, `otherCharges`, `discount`, `gstRate`, `gstAmount`, `goldCostRate`, `estimatedProfit`), `advanceReceived`, `advanceMode`, `status`, `statusHistory?`, `notes?`, `invoiceId?` (set on delivery), `createdBy`, `createdAt`.
- **`OrderItem`** (`types.ts:394`) — `description`, `purity`, `grossWt`, `netWt`, `makingPerGm`, plus optional `size`/`length`/`stoneDetails`/`engraving`.
- **`OrderPayment`** (`types.ts:482`) — advance ledger row: `orderId`, `date`, `amount`, `mode`, `notes?`. Many per order.
- **`OrderType`** (`types.ts:409`) — `custom | ready_stock | repair | alteration | bridal | exchange | consignment`.
- **`OrderStatus`** (`types.ts:422`) — workflow `draft → confirmed → advance_received → gold_reserved → assigned_workshop → in_production → stone_setting → polishing → quality_check → ready → invoiced → delivered`, plus `cancelled` and legacy `booked` (alias for `confirmed`).

Constants in `src/lib/constants.ts`: `ORDER_TYPES` (114), `orderTypeLabel` (124), `ORDER_WORKFLOW` (128), `ORDER_STATUS_META` label+chip tone (144), `orderStatusIndex` normalizes `booked`→`confirmed` (162).

DB tables: `orders`, `order_payments` (Dexie stores / SQLite repos).

## Services & data flow
`ordersService` = `pick(ordersServiceDexie, sqlite?.ordersService)` (`dbService.ts:1790`), exported also under `db.orders` (1809). Dual backend — Dexie impl at `dbService.ts:1057`, SQLite impl at `sqliteServices.ts:930`.

Methods:
- `getAll()` / `get(id)` / `getOpen()` — `getOpen` excludes delivered+cancelled (used to link karigar jobs).
- `add(input, {status})` — allocates `orderNo` via `nextSequence("order", {prefix:"ORD"})`, defaults status `confirmed`, seeds `statusHistory` (`dbService.ts:1069`).
- `setStatus(id, status, {by, remarks})` — appends a `statusHistory` entry (`1084`).
- `getPayments(orderId)` — advance ledger for an order.
- `addPayment(orderId, {...})` — **atomic transaction** (`1100`): inserts `OrderPayment`, recomputes `advanceReceived` from the sum of all payments, and on the first advance auto-advances status `draft|confirmed|booked → advance_received`.
- `update(id, patch)`.

Reactivity: components read through `useLiveData(() => ordersService.getAll(), ...)` so the table/dialogs refresh on any write.

Cashbook: `dbService.ts:1393` includes each order's `advanceReceived` as an "Order advance" inflow on its `date`.

## User-facing flows
1. **Book order** — New Order dialog: pick customer/type, add item rows, enter rates; pricing computed live; Save as Draft or Book Order (`confirmed`).
2. **Receive advance** — row menu → dialog; recomputes total advance, auto-bumps status to `advance_received`.
3. **Reserve gold** — row menu action; sets status `gold_reserved` with reserved net-weight remark.
4. **Assign to workshop** — dialog issues metal to a karigar (creates linked job) and sets `assigned_workshop`.
5. **Advance production** — inline status dropdown on each row cycles through workflow stages (in_production, stone_setting, polishing, quality_check, ready, …).
6. **Deliver & Bill** — `handleDeliver` (`OrdersPage.tsx:172`) resets POS, sets customer, calls `posStore.setOrderLink(orderId, advance)`, loads order items as sales lines, navigates to `/billing`. On invoice save, POS marks the order `delivered` and stamps `invoiceId`.
7. **Timeline / Detail / Notify (WhatsApp) / Duplicate / Cancel / Excel export** — supporting actions from the row menu / header.

## Cross-feature connections
- **POS / Billing** (`src/features/pos/`) — `usePosStore.setOrderLink` (`usePosStore.ts:110`) carries `orderId` + applied advance. On sale save, `dbService.ts:337` / `sqliteServices.ts:387` set the linked order to `delivered` and write back `invoiceId`. This is the delivery→invoice bridge.
- **Karigar / Workshop** (`karigarsService`) — `AssignWorkshopDialog` calls `karigarsService.issueJob({..., orderId})`; `OrderDetailDialog` reads `karigarsService.getJobs()` filtered by `orderId` to show manufacturing progress. `getOpen()` exists to link jobs to open orders.
- **Customers** (`customersService`) — customer lookup, mobile/city/loyalty in forms and detail.
- **Cashbook** — order advances surface as inflows.
- **Shared libs** — `lib/excel` (export), `lib/waTemplates.openWhatsApp` (notify), `lib/format`, `features/pos/calc.GST_RATES`, `features/pos/GridCells` (NumCell/TextCell), `CustomerCombobox`.

## Gotchas & notes
- **Legacy `booked` status** — alias for `confirmed`; the table dropdown and filters normalize `booked → confirmed` (`OrdersPage.tsx:128,355`; `orderStatusIndex` at `constants.ts:162`). Keep both mapped in `ORDER_STATUS_META`.
- **`advanceReceived` is derived, not free-set** — `addPayment` recomputes it from summed `order_payments`; don't patch it directly. First advance side-effects a status change.
- **Balance = `estimatedAmount − advanceReceived`** computed everywhere ad hoc; `estimatedAmount` already includes GST.
- **Deliver is not an in-Orders write** — it hands off to POS; the order only becomes `delivered` when the POS invoice is saved (`header.orderId` branch). Cancelling from POS won't roll it back automatically.
- **Pricing breakdown fields are optional** (legacy rows may lack them) — detail/summary use `?? 0` guards.
- **Dual backend** — every method exists in both Dexie and SQLite impls; keep them in sync when changing `ordersService`.
- `add` accepts an optional preset `statusHistory`; `duplicate` (`OrdersPage.tsx:188`) strips id/orderNo/status/history/invoiceId and re-adds as `draft`.
