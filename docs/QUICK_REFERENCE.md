# Jewel-ERP — Quick Reference

One-screen cheatsheet for every feature. For depth, open the `CONTEXT.md` inside each feature folder (`src/features/<name>/CONTEXT.md`).

**Stack:** Vite 7 · React 19 · TypeScript · Tailwind v4 · Tauri v2 desktop shell.
**Data backend:** dual — Dexie/IndexedDB on web, SQLite (`@tauri-apps/plugin-sql`) on desktop, chosen per-service via `pick(dexieImpl, sqlite?.impl)`; live UI via the `useLiveData` hook.
**Auth/session:** `authService`/`sqliteAuth` + `passwordHash`; `useSession` gates the app and supplies the active Company profile.

---

## Sales cycle

### POS (Point of Sale)
- **What:** Keyboard-first jewellery billing screen — scan/enter new items, take old-gold (URD) in exchange, apply discounts/GST/TCS/loyalty, take payment, save & print/WhatsApp the invoice (also edits saved invoices).
- **Route/entry:** `/billing` (nav "Billing / POS", shortcut F2); component `PosPage`.
- **Main files:** usePosStore.ts, calc.ts, CheckoutPane.tsx, InvoiceReceipt.tsx
- **Key actions:** select/add customer, scan item, add URD/old-gold, discount, redeem loyalty, take cash/UPI, save, update, print, WhatsApp
- **Services:** salesService (createInvoice/updateInvoice/getFull), customersService (get/add/getOutstanding), itemsService (getByTag/getByIds)
- **Links to:** Items/Inventory, Customers, Loyalty/Settings, Orders, Day Book, Receipt Designer, WhatsApp

### Orders
- **What:** Books and tracks customer jewellery orders through a multi-stage production workflow (draft → confirmed → advance → gold reserved → workshop → production → ready → invoiced → delivered), with live pricing estimates and advance payments.
- **Route/entry:** `/orders` — nav "Order Booking".
- **Main files:** OrdersPage.tsx, OrderFormDialog.tsx, OrderDetailDialog.tsx, OrderTimelineDialog.tsx, ReceiveAdvanceDialog.tsx, AssignWorkshopDialog.tsx
- **Key actions:** book/duplicate order, receive advance, reserve gold, assign to workshop, advance status, deliver & bill, cancel, notify via WhatsApp, Excel export, print detail
- **Services:** ordersService (add/get/getAll/getOpen/setStatus/getPayments/addPayment/update), customersService, karigarsService, usePosStore
- **Links to:** POS/Billing (delivery→invoice via setOrderLink + invoiceId writeback), Karigar/Workshop (issueJob by orderId), Customers, Cashbook

### Receipt (Udhari Collection)
- **What:** Record a payment against a customer's outstanding balance and print a voucher (separate from POS invoice payments).
- **Route/entry:** `/receipt` → `ReceiptPage`.
- **Main files:** ReceiptPage.tsx (form + recent list + in-file `ReceiptVoucher`)
- **Key actions:** pick customer → see outstanding → Save & Print Receipt; search recent receipts
- **Services:** receiptsService.add/getAll (RCP sequence), customersService.getOutstanding
- **Links to:** Customers, Reports (feeds customerLedger credits + cashBook inflow), useSession company

### Receipt Designer
- **What:** Drag-and-drop editor for the printed invoice layout — reorder/toggle/style receipt sections, add free-text lines, set the shop logo. Persisted as JSON on the company and consumed by the real POS invoice.
- **Route/entry:** `/receipt-designer` → ReceiptDesignerPage.tsx.
- **Main files:** ReceiptDesignerPage.tsx, layout.ts
- **Key actions:** drag-reorder blocks, toggle enabled, set align/fontSize/bold, add/delete custom text, upload/show/remove logo, Save, Reset to default
- **Services:** none dedicated — persists via authService.updateCompany(id, { receiptLayout, printLogoUrl, printShowLogo }); read via parseReceiptLayout(company?.receiptLayout)
- **Links to:** pos/InvoiceReceipt.tsx (shares layout.ts — the real renderer), Settings Print & Rates, receiptI18n, Barcode, useSession
- **Gotcha:** Font size applies only to text/footer blocks via a `[&_*]:!text-[Npx]` descendant override; classes must be hardcoded literals for Tailwind JIT. Logo lives on separate company fields, not the layout JSON.

---

## Inventory & sourcing

### Item Master (Inventory)
- **What:** Jewellery stock master — CRUD, search/category filter, Excel export, barcode-label printing (metal/purity/weights/making/HUID/tag).
- **Route/entry:** `/inventory` → InventoryPage (title "Item Master").
- **Main files:** InventoryPage.tsx, ItemFormDialog.tsx, BarcodeLabels.tsx
- **Key actions:** New/Edit/Delete item (auto tag from category prefix, auto netWt), search tag/name/HUID, category filter (shows ALL statuses), print labels, Excel export, load demo stock
- **Services:** itemsService — getAll/getInStock/get/getByTag/getByIds/add/update/remove/search/count; helpers computeNetWt, nextSequence
- **Links to:** POS/Sales (marks items sold), Refining (source; melting → melted; produces bullion), Company defaultHsnCode, counters

### Purchase
- **What:** Record vendor purchases (jewellery/bullion), manage the supplier master, track vendor outstanding, take payments, process returns. Ticked purchase lines are minted into live inventory (Item Master) with auto-generated tags.
- **Route/entry:** `/purchase` → PurchasePage.tsx; tabbed Purchases / Suppliers / Returns.
- **Main files:** PurchasePage.tsx, PurchaseFormDialog.tsx, SupplierFormDialog.tsx, VendorPaymentDialog.tsx, VendorLedgerDialog.tsx, ReturnDialog.tsx
- **Key actions:** New Purchase (grid, per-row "Add to stock", GST, totals), New/Edit Supplier, Pay Vendor, Vendor Ledger, Record Return, filters + Excel export
- **Services:** purchaseService (atomic create), itemsService.add (per-row stock insert), suppliersService (getOutstanding), purchasePaymentsService, purchaseReturnsService
- **Links to:** Item Master (minted items), inventory ledger (returns), POS (GridCells, GST_RATES), lib/constants, session
- **Gotcha:** Save is two-phase — purchaseService.create is atomic; the ticked-row itemsService.add loop runs after with independent per-row try/catch, so a bad stock insert never rolls back or mislabels the committed bill.

### Refining
- **What:** Melt scrap → pure bullion; computes fineness/loss/recovery + charges, records atomic auditable jobs, mints bullion + a sellable item, reversible. Includes refiners master + analytics.
- **Route/entry:** `/refining` → RefiningPage (title "Metal Refining (Ghalai)").
- **Main files:** RefiningPage.tsx, RefinerFormDialog.tsx, RefiningDetailDialog.tsx
- **Key actions:** create job (source-from-stock/scrap, purity, loss%, charges) → confirm; reverse job (guarded if bullion sold); view detail + ledger audit + print; refiner CRUD; analytics
- **Services:** refiningService — getAll/get/getLedger/getBullion/create/reverse; refinersService — getAll/get/add/update/remove; consumes itemsService.getInStock
- **Links to:** Item Master (consumes/produces items), BullionStock + bullion_movement, inventory_ledger, counters (REF/GB), session

### Karigar (Job Work)
- **What:** Goldsmith job-work tracker — per-karigar metal ledger; issue raw metal then receive the finished item, reconciling with allowed wastage.
- **Route/entry:** `/karigar` → KarigarPage.
- **Main files:** KarigarPage.tsx (ledger + jobs tables; AddKarigar/IssueJob/ReceiveJob dialogs)
- **Key actions:** New Karigar, Issue Metal (debits balance), Receive (credits finished + wastage), search/filter jobs
- **Services:** karigarsService (getAll/add/getJobs/issueJob/receiveJob), ordersService.getOpen
- **Links to:** Orders (link job to an open order); no direct stock deduction

### Audit (Physical Stock Audit)
- **What:** NOT a change log — a physical stock-audit scanner. Scan tags, reconcile against system, flag missing/unknown. Read-only; nothing is persisted.
- **Route/entry:** `/audit` → StockAuditPage.
- **Main files:** StockAuditPage.tsx (scan bar, stats, item table with badges)
- **Key actions:** scan tags (Enter), Reconcile (flags missing red), Export Missing CSV, Reset
- **Services:** itemsService.getAll only; csv helpers — all audit state is ephemeral React state
- **Links to:** Inventory/items (sole data source; sold/melted tags show as "Unknown")

---

## Loans & savings

### Girvi (Gold Loan)
- **What:** Pawn / gold-loan module — pledge jewellery as collateral for a cash loan, track accruing interest, part-payments, renewals (with capitalisation), and closure/redemption with printable Pavati and payment vouchers.
- **Route/entry:** `/girvi` — nav "Girvi (Loans)".
- **Main files:** GirviPage.tsx, LoanFormDialog.tsx, LoanDetailsDialog.tsx, interest.ts, PavatiReceipt.tsx, PaymentReceipt.tsx
- **Key actions:** New Loan; row icons — Eye=View Details, Receipt=Pavati, Lock=quick Close/Redeem (open loans only); **inside View Details (open loans only)** — Part Payment, Renew, Close, WhatsApp reminder, Print
- **Services:** loansService (getAll/get/getOpen/getPayments/getAllPayments/add/update/addPayment/close), customersService, nextSequence("loan", GRV), computeLoanDues (interest.ts)
- **Links to:** Customers, Company/session, waTemplates, receiptI18n, POS GridCells, sequences, Reports/day-book
- **Gotcha:** Part/Renew/WhatsApp are hidden inside the View Details dialog and only for OPEN loans. Payment allocation is interest-first-then-principal; renewals capitalise unpaid interest (compounding).

### Schemes
- **What:** Gold saving / instalment plans ("pay 11, get 12") — create plans, enrol customers, record monthly instalments, track the due schedule, print chit receipts.
- **Route/entry:** `/schemes` → SchemesPage.
- **Main files:** SchemesPage.tsx (tabs + 4 dialogs), ChitReceipt.tsx
- **Key actions:** New Plan, Enroll Customer, Record Instalment (double-pay guarded), View Schedule, Print Chit, WhatsApp reminder, Mark Matured
- **Services:** schemesService (getSchemes/addScheme/getAccounts/enroll/getPayments/getSchedule/addPayment/setStatus), customersService
- **Links to:** Customers, useSession company (print + templateScheme), waTemplates, Settings

---

## Masters, ledgers & system

### Customers
- **What:** Customer/party master with KYC (PAN/Aadhaar/GSTIN), marketing dates, opening balance, loyalty points, and live outstanding (Udhari) display.
- **Route/entry:** `/customers` → CustomersPage.
- **Main files:** CustomersPage.tsx, CustomerFormDialog.tsx
- **Key actions:** New/Edit/Delete customer, search name/mobile, Excel export, loyalty-cap enforcement, outstanding Dr/Cr column, load demo customers
- **Services:** customersService — getAll/get/add/update/remove/search/getOutstanding; page also reads salesService.getInvoices()
- **Links to:** Sales/POS (customerId, loyalty delta, invoice balances), Receipts, Company loyaltyMaxPoints
- **Note:** Outstanding = `openingBalance + Σ invoice.balance − Σ standalone receipts`, computed identically in the list view and in `customersService.getOutstanding`.

### Daybook
- **What:** Daily transactions ledger — per-day KPI dashboard (sales, URD, GST, cash/UPI, credit, loans) + that day's invoice list with edit-in-POS.
- **Route/entry:** `/daybook` → DayBookPage.
- **Main files:** DayBookPage.tsx (date navigator, KPI cards, invoice table)
- **Key actions:** navigate days, review KPIs, edit a bill (loads into POS)
- **Services:** reportsService.getDayBook, salesService.getInvoicesByDate/getFull, customersService.getAll, loansService.getAll
- **Links to:** POS (usePosStore.loadForEdit → /billing), Girvi, Customers

### Reports
- **What:** Derived accounting & GST reports — party ledger, cash book, sundry debtors, GSTR-1, HSN summary; CSV/Excel export.
- **Route/entry:** `/reports` → ReportsPage (5 tabs).
- **Main files:** ReportsPage.tsx (PartyLedger, CashBook, Debtors, Gstr1, HsnSummary)
- **Key actions:** ledger by customer, cash book by day, debtors + WhatsApp dues, GSTR-1/HSN by month with CSV/Excel export
- **Services:** ledgerService (customerLedger/cashBook/sundryDebtors/gstr1/gstHsnSummary), xlsx, csv helpers, waTemplates
- **Links to:** POS, Receipt, Orders (advances), Girvi (loans), Customers, Settings (GST/HSN defaults)

### Settings
- **What:** Central config — shop profile, print/rate/loyalty defaults, multi-firm management, users, password, backup/restore (+Google Drive), WhatsApp templates.
- **Route/entry:** `/settings` → SettingsPage (7 tabs).
- **Main files:** SettingsPage.tsx (ShopProfile, PrintSettings, Firms, UsersAdmin [owner-only], MyAccount, Backup, NotificationTemplates)
- **Key actions:** save company/print config, add/switch firm (reloads), add/enable users, change password, JSON/Excel/Drive backup, RESTORE-confirmed restore, edit message templates
- **Services:** authService (updateCompany/listCompanies/addCompany/listUsers/addUser/setActive/changePassword), maintenanceService (export/import), driveBackup, switchCompany/activeCompanyId, useSession
- **Links to:** Everything via the Company profile (print, templates, loyalty/GST defaults); Auth (shared systemDb)

### Auth
- **What:** Login gate — pick firm + financial year, authenticate the user, seed the session, point the business DB at the company.
- **Route/entry:** no URL — rendered by App.tsx when `!user`.
- **Main files:** LoginPage.tsx
- **Key actions:** select firm/FY, login (default `admin/admin`); switching firm forces `window.location.reload()`
- **Services:** authService.listCompanies/login (salted passwordHash+salt; sqliteAuth under Tauri else Dexie), useSession.setSession, ACTIVE_COMPANY_KEY/activeCompanyId
- **Links to:** Settings (user mgmt + password change, same systemDb), useSession, db/database singleton

---

## Cross-feature data flow (at a glance)

```
Purchase ──mints──▶ Item Master ──sells──▶ POS ──invoice──▶ Daybook / Reports
   │                    │  ▲                     │
   │                    │  └──produces── Refining │
Suppliers            Karigar (job work)          ├──payment──▶ Receipt (Udhari)
                        ▲                         │
Orders ──issueJob───────┘   Orders ──deliver──────┘   Customers ◀── outstanding (all of the above)

Girvi (loans) · Schemes (savings) ──▶ Customers, Reports, Settings templates
Settings/Company profile ──▶ print layout, GST/loyalty defaults, WhatsApp templates (every feature)
Auth ──gates──▶ everything; session Company drives config
```
