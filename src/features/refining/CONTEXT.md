# Metal Refining (Ghalai) — Context

**Purpose:** Melt scrap/old jewellery into pure bullion. Computes pure-metal content, refining loss, recovered weight and recovery %, plus optional refining charges (with GST). Records each job atomically as an auditable inventory movement, mints a GB-numbered bullion lot + a sellable stock item, and supports full reversal. Also manages a refiners master and an analytics dashboard.

## Key files
| File | Responsibility |
|------|----------------|
| `RefiningPage.tsx` | Main page (route `/refining`, title "Metal Refining (Ghalai)"). Three tabs: **Refine** (job form + live summary + history table), **Refiners** (master CRUD), **Analytics** (KPIs + bar/trend charts + recent jobs). Handles calc, validation, confirm dialog, reversal dialog. |
| `RefinerFormDialog.tsx` | Create/Edit `Refiner` (name, internal/external kind, contact, address, default charge basis/rate/GST, notes). Default charges pre-fill a new job. |
| `RefiningDetailDialog.tsx` | Read-only job detail: meta, weight calc, charges, generated bullion, inventory-ledger audit trail, timeline (created/reversed), remarks, print. |

## Data model & entities
`Refining` (`src/db/types.ts:512`): `refiningNo` (REF…), `date`, `refinerId`/`refinerName`, `sourceItemId`, `description`, `type` (MetalType), `inputWt`, `inputKarat`, `inputFinePct`, `pureGoldWt`, `refiningLossPct`, `lossWt`, `outputWt`, `recoveryPct`, `outputPurity`, `scrapType`, charge fields (`chargeType` per_gram|flat|percentage, `chargeRate`, `chargeAmount`, `chargeGstPct`, `chargeGstAmount`, `totalCharge`), `outputItemId`, `bullionNo` (GB000001), `status` (`completed`|`reversed`), `reversedAt/By`, `createdBy`, `notes`.

`Refiner` (`types.ts:570`): `name`, `kind` (internal/external), `contact`, `address`, default `chargeType`/`chargeRate`/`gstPct`, `notes`.

Related: `BullionStock` (GB lot linked to an `items` row + refiningId), `InventoryLedger` (in/out movement rows), `bullion_movement`. Constants: `GOLD_KARATS`, `SCRAP_TYPES`, `REFINING_CHARGE_TYPES`, `METAL_TYPES`.

## Services & data flow
`refiningService` (`pick`, `dbService.ts:1791`; Dexie impl `dbService.ts:808`):
- `getAll`, `get`, `getLedger(refiningId)` (inventory_ledger by refId), `getBullion(refiningId)` (bullion_stock).
- `create(input, { addToStock, outputCategory, outputName })` — one `rw` transaction over refinings/items/counters/bullion_stock/bullion_movement/inventory_ledger: (1) mint `REF` no + insert header; (2) if `sourceItemId`, set that item `status:"melted"` + ledger OUT; (3) if `addToStock` & outputWt>0, create sellable `Item` (tagPrefix "BUL") + `GB`-numbered `BullionStock` + bullion_movement "produced" + ledger IN; (4) backfill header with `outputItemId`/`bullionNo`.
- `reverse(id, { by })` — never hard-deletes: restores melted source to `in_stock` (+ledger), voids produced bullion (`bullion_stock.status:"reversed"`, deletes its unsold item, movement + ledger OUT), marks job `reversed`. **Blocked if the produced bullion item is already `sold`.**

`refinersService` (`dbService.ts:1036`): `getAll` (by name), `get`, `add`, `update`, `remove`.

Page loads via `useLiveData`: `itemsService.getInStock()` (source picker), `refiningService.getAll()` (history + analytics), `refinersService.getAll()`.

Client-side calc: `finePct` from karat (`karatByLabel`) or custom; `pureGold = inputWt × finePct/100`; `lossWt = pureGold × lossPct/100`; `recovered = pureGold − lossWt`; charges by basis (per_gram × inputWt / flat / percentage of a base) + GST. `purityToFinePct`/`purityToKarat` helpers derive fineness from a purity label when sourcing from stock.

## User-facing flows
1. **Refine a job** — pick date/refiner (pre-fills charges)/optional source-from-stock (auto-fills desc/metal/wt/purity)/scrap type; enter input wt, purity (karat or custom fineness), loss %, output purity, charges; live summary shows recovery %; "Refine & Add Bullion" → confirm dialog → `create`. Toast: `REF…: X → Y g pure`.
2. **Reverse** — history row RotateCcw → confirm → `reverse`; restores scrap, voids bullion.
3. **View details** — Eye icon → `RefiningDetailDialog` (ledger audit trail, generated bullion, timeline, print).
4. **Refiners tab** — add/edit/delete refiners with default charges.
5. **Analytics tab** — today's jobs, month refined, bullion produced, avg recovery, total loss, total charges; 6-month recovered-gold bars + recovery-% trend; recent jobs list.

## Cross-feature connections
- **Item Master / Inventory** — consumes in-stock items as scrap (marks `melted`); produces new sellable `Item`s (BUL tag) that appear in inventory and can be sold at POS or issued to karigar.
- **Bullion** — `BullionStock` (GB) + `bullion_movement` provenance chain.
- **Inventory ledger** — every melt/produce/reversal writes `inventory_ledger` rows (refType `refining` / `refining_reversal`) — the shared audit trail.
- **Counters** — REF / GB / BUL-item sequences via `nextSequence`.
- **Session** — `user.name` recorded as `createdBy`/`reversedBy`.

## Gotchas & notes
- Reversal is guarded: if the refined bullion's stock item is already `sold`, reverse throws — surfaced as an error toast.
- Jobs are never edited in place ("not silently edited") — only created or reversed, preserving the audit trail.
- Analytics excludes `status === "reversed"` jobs from most metrics; `recent` shows all (incl. reversed).
- Fineness: input capped 0–99.99%; `usingKarat` locks the fineness field and derives it from the karat.
- `addToStock` unchecked → no bullion/item/ledger-IN created; header still records the computed output.
- Charge basis "percentage" needs a separate `chargeBase` (₹) input; per_gram multiplies by inputWt.
- Non-gold metals: karat selector hidden, user enters fineness directly.
