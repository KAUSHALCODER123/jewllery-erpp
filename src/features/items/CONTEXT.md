# Item Master (Inventory) — Context

**Purpose:** Manage the shop's jewellery stock ("Item Master"). Create, edit, delete, search, filter, Excel-export and print barcode labels for individual pieces. Each item carries metal/purity/weight/making data and a scannable barcode tag; items are the sellable units consumed by POS, refining, and karigar flows.

## Key files
| File | Responsibility |
|------|----------------|
| `InventoryPage.tsx` | Main page (route `/inventory`, title "Item Master"). Live-loads all items, client-side search + category filter, totals (count/gross/net), Excel export, "Print Labels" for the filtered set, empty-state with demo-seed, row action menu (Edit / Print Label / Delete). |
| `ItemFormDialog.tsx` | Create/Edit item form (react-hook-form + zod `itemSchema`). Auto net-wt, category→metal/purity defaulting, HSN default from company, auto tag generation. |
| `BarcodeLabels.tsx` | Print overlay laying out one 48mm×26mm jewellery tag per item (shop name, `<Barcode value={item.tag}>`, purity, net wt, HUID). Uses global print CSS (`.print-overlay/.print-area/.no-print`). |

## Data model & entities
`Item` (`src/db/types.ts:23`): `id`, `tag` (unique barcode, e.g. "RIN0001"), `name`, `type` (`MetalType` = gold/silver/platinum/other), `purity` (string label), `grossWt`, `stoneWt`, `netWt` (derived grossWt−stoneWt, persisted), `makingChargePerGm`, optional `huid`, `hsn`, `category`, `quantity` (default 1), `status` (`in_stock` | `sold` | `melted` | `with_karigar`, default `in_stock`), `createdAt`, `updatedAt`.

Constants: `CATEGORIES` (each has `prefix`/`label`/`defaultType`), `METAL_TYPES`, `PURITY_OPTIONS[metal]`, `ITEM_STATUS` (label + tone) in `src/lib/constants.ts`.

## Services & data flow
`itemsService` = `pick(itemsServiceDexie, sqlite?.itemsService)` (`dbService.ts:1785`). Dexie impl at `dbService.ts:116`:
- `getAll()` — all items, id desc.
- `getInStock()` — only `status === "in_stock"` (used by Refining/Karigar as source pickers).
- `get`, `getByTag`, `getByIds`, `search` (tag/name/huid), `count`.
- `add(input)` — recomputes `netWt` via `computeNetWt`; mints a sequential tag from `tagPrefix` (category prefix, fallback "ITM") via `nextSequence` when no tag supplied; sets `status: "in_stock"`, `quantity: 1`, timestamps.
- `update(id, patch)` — recomputes `netWt` if gross/stone changed; bumps `updatedAt`.
- `remove(id)` — hard delete.

Reactivity via `useLiveData(() => itemsService.getAll(), [], undefined)`. Filtering/totals are client-side in the page (the filter shows ALL items regardless of status). Demo data via `seedItemsIfEmpty()`; Excel via `exportObjectsToExcel`.

## User-facing flows
1. **Browse/search** — search by tag/name/HUID, filter by category; header shows count + gross/net grams; "Print Labels (N)" prints all filtered rows.
2. **Create** — "New Item"; leave Tag blank to auto-generate from category prefix; net wt auto-computed; toast shows minted tag.
3. **Edit / Delete** — per-row menu (confirm on delete).
4. **Print label** — single row menu or bulk from toolbar → `BarcodeLabels` overlay → `window.print()`.
5. **Export** — filtered rows to `.xlsx`.

## Cross-feature connections
- **POS/Sales** (`salesService.createInvoice`) marks sold tagged items `status: "sold"`; edit-invoice restores to `in_stock`.
- **Refining** uses `itemsService.getInStock()` as the "Source from stock" picker; melting sets item `status: "melted"`; refined bullion is created as a new `Item` (tagPrefix "BUL") via `itemsServiceDexie.add`.
- **Company settings** supply `defaultHsnCode` for the item form.
- Tag sequences come from the shared `counters` table (`nextSequence`).

## Gotchas & notes
- `getInStock` implementation does an `anyOf("in_stock").or("id").above(0)` then filters in JS — effectively "all items, keep in_stock" (works but not a pure index query).
- The Item Master grid intentionally lists items of ALL statuses (sold/melted included); only Refining's source picker restricts to in-stock.
- `netWt` is persisted; always mutate weights through `itemsService` so it stays consistent.
- Tag uniqueness relies on the counter sequence; a manually-entered duplicate tag is not guarded here.
- Barcode labels are fixed 48mm×26mm; rely on global print CSS classes to isolate the print area.
