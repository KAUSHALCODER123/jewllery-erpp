# Audit (Physical Stock Audit) — Context

**Purpose:** Physical stock-taking by barcode/tag scan. Scan every tag in the trays; matched in-stock items turn green; on Reconcile, anything in the system but not scanned is flagged red (missing/misplaced), and scans not in active stock are flagged. **Read-only — reports discrepancies without mutating inventory.**

> Note: this is *not* an audit-trail / change-log feature. The folder is `audit` and the route is `/audit`, but it is the physical stock audit tool.

## Key files
| File | Responsibility |
|------|----------------|
| `StockAuditPage.tsx` | Whole feature: scan bar, summary stats, item table with per-row Verified/Missing/Unknown badges. In-file `Stat` and `Badge` helpers. |

## Data model & entities
- Reads **Item** records (`tag`,`name`,`category`,`purity`,`grossWt`,`netWt`,`huid`,`status`). Only `status === "in_stock"` (default when unset) items are audited.
- All audit state is **client-side React state**, nothing persisted: `scanned: Set<string>`, `unknown: string[]`, `reconciled: boolean`.

## Services & data flow
- `itemsService.getAll()` (the only service call) → filtered to in-stock, indexed by `tag`.
- Scanning (Enter or Verify): uppercases the tag; if it matches active stock → add to `scanned` (green); else → push to `unknown` (amber).
- `verifiedCount` / `missingCount` derived from `scanned` vs in-stock set.

## User-facing flows
1. Focus scan box, scan tags (hardware scanner acts as keyboard + Enter).
2. Watch Verified / Missing / Unknown counters.
3. **Reconcile** → unscanned in-stock rows flip to red "Missing".
4. **Export Missing** → CSV of unscanned items (tag/name/category/purity/weights/HUID).
5. **Reset** clears all scan state.

## Cross-feature connections
- **Inventory (items)** — single source of truth read via `itemsService`; sold/melted tags surface as "Unknown scans".
- Uses `wt()` from `@/lib/format`, `toCsv`/`downloadText` from `@/lib/csv`.

## Gotchas & notes
- Purely ephemeral: navigating away loses the audit; no audit record is written anywhere.
- "Unknown" covers both foreign tags and items no longer in active stock (sold/melted).
- Reconcile is just a UI flag toggle; it never changes item `status`.
