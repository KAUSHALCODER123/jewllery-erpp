# Karigar — Context

**Purpose:** Goldsmith (karigar) job-work tracker. Maintain a metal ledger per craftsman and track jobs: issue raw metal, then receive the finished item, reconciling weight with an allowed wastage.

## Key files
| File | Responsibility |
|------|----------------|
| `KarigarPage.tsx` | Whole feature: metal-ledger table, jobs table (search + status filter), and in-file dialogs `AddKarigarDialog`, `IssueJobDialog`, `ReceiveJobDialog`. |

## Data model & entities
- **Karigar** — `name`, optional `mobile`, `metalBalanceWt` (grams; **positive = metal the karigar still owes the shop**).
- **KarigarJob** — `jobNo` (JOB…), `karigarId`, `issuedDate`, `metalIssuedWt`, `wastageAllowed` (%), `finishedWt`, `status` (`issued`|`received`|`closed`), optional `orderId`, `receivedDate`, `description`.

## Services & data flow
`karigarsService` (`pick(karigarsServiceDexie, sqlite?.karigarsService)`):
- `getAll`, `get`, `add`, `getJobs`, `getJobsByKarigar`.
- `issueJob(input)` — mints `jobNo`, sets status `issued`, and **debits** (increases) the karigar's `metalBalanceWt` by `metalIssuedWt`, in a transaction.
- `receiveJob(jobId, finishedWt, wastageAllowed)` — sets `finishedWt`/status `received`/`receivedDate`, and **credits** (decreases) the balance by `finishedWt + (metalIssuedWt * wastage%)`.
- `ordersService.getOpen()` — optional link of a job to an open custom order.

## User-facing flows
1. **New Karigar** → `AddKarigarDialog` → `add`.
2. **Issue Metal** → `IssueJobDialog` (karigar, date, metal wt, planned wastage %, optional order, description) → `issueJob`.
3. **Receive** (on an `issued` job) → `ReceiveJobDialog` shows live wastage weight / credited / unreconciled balance → `receiveJob`.
4. Jobs table filterable by search (job/karigar/work) and status.

## Cross-feature connections
- **Orders** — a job can be issued "against" an open order (`orderId`); order descriptions shown in the select.
- Uses `wt()` / `formatDate` from `@/lib/format`.
- No direct link to POS/inventory (issuing metal does not deduct tagged stock here).

## Gotchas & notes
- The metal ledger is a single running `metalBalanceWt` per karigar, not a per-transaction ledger table.
- `wastageAllowed` defaults on receive to the job's planned value but can be overridden at receive time.
- "Unreconciled balance" in the receive dialog is display-only guidance; the job is still marked received regardless of leftover.
- `closed` status exists in the model/UI legend but there is no close action on this page.
