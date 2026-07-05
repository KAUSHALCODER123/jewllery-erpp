/**
 * SQLite implementations of the master-data + sequence services, mirroring the
 * Dexie versions in dbService.ts. Built on makeTableRepo / withTransaction and an
 * injectable executor so every method is unit-testable in Node with a fake — the
 * SQL each service issues is verified without a live Tauri runtime.
 *
 * NOT yet wired into dbService: a live cutover must flip ALL services together
 * (mixing SQLite + Dexie tables in one runtime would split-brain the data). See
 * docs/SQLITE-CUTOVER.md. This is the tested implementation the flip will use.
 */

import type { Customer, Item } from "@/db/types"
import { makeTableRepo, withTransaction, tauriExecutor, type SqlExecutor } from "@/db/sqliteRepo"
import { decodeRow } from "@/db/sqlBuilder"
import { typesFor } from "@/db/sqliteSchema"

const nowIso = () => new Date().toISOString()
const round = (n: number): number => Number(n.toFixed(2))
const computeNetWt = (grossWt: number, stoneWt: number): number =>
  Math.max(0, Number((grossWt - stoneWt).toFixed(3)))

/**
 * Increment a named counter and return the next value + formatted code. NOTE:
 * this does NOT open its own transaction — callers that need atomicity (item tag
 * minting, invoice numbering) wrap it in `withTransaction`, exactly like the
 * Dexie version runs inside `db.transaction`.
 */
export async function nextSequenceRaw(
  exec: SqlExecutor,
  key: string,
  opts: { prefix?: string; pad?: number } = {},
): Promise<{ value: number; code: string }> {
  const { prefix = "", pad = 4 } = opts
  const rows = await exec.query<{ value: number }>(
    'SELECT value FROM counters WHERE key = $1',
    [key],
  )
  const current = rows[0]?.value ?? 0
  const value = current + 1
  await exec.run(
    'INSERT INTO counters (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
    [key, value],
  )
  return { value, code: `${prefix}${String(value).padStart(pad, "0")}` }
}

/** Build the SQLite master-data services bound to an executor. */
export function makeSqliteServices(exec: SqlExecutor = tauriExecutor) {
  const itemsRepo = makeTableRepo("items", typesFor("items"), exec)
  const customersRepo = makeTableRepo("customers", typesFor("customers"), exec)

  const nextSequence = (key: string, opts?: { prefix?: string; pad?: number }) =>
    withTransaction(exec, () => nextSequenceRaw(exec, key, opts))

  const itemsService = {
    getAll: () => itemsRepo.getAll(["id", "DESC"]) as unknown as Promise<Item[]>,

    get: (id: number) => itemsRepo.get(id) as unknown as Promise<Item | undefined>,

    async getInStock(): Promise<Item[]> {
      const rows = await exec.query<Record<string, unknown>>(
        "SELECT * FROM items WHERE COALESCE(status, 'in_stock') = 'in_stock' ORDER BY id DESC",
      )
      return rows.map((r) => decodeRow<Item>(r, typesFor("items")))
    },

    async getByTag(tag: string): Promise<Item | undefined> {
      const rows = await exec.query<Record<string, unknown>>(
        "SELECT * FROM items WHERE tag = $1 LIMIT 1",
        [tag],
      )
      return rows[0] ? decodeRow<Item>(rows[0], typesFor("items")) : undefined
    },

    async add(
      input: Omit<Item, "id" | "netWt" | "tag" | "createdAt" | "updatedAt"> & {
        tag?: string
        tagPrefix?: string
      },
    ): Promise<Item> {
      return withTransaction(exec, async () => {
        const { tag, tagPrefix, ...rest } = input
        const finalTag =
          tag ??
          (await nextSequenceRaw(exec, `item:${tagPrefix ?? "ITM"}`, { prefix: tagPrefix ?? "ITM" })).code
        const record: Omit<Item, "id"> = {
          ...rest,
          tag: finalTag,
          netWt: computeNetWt(rest.grossWt, rest.stoneWt),
          status: rest.status ?? "in_stock",
          quantity: rest.quantity ?? 1,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        return (await itemsRepo.add(record)) as unknown as Item
      })
    },

    async update(id: number, patch: Partial<Item>): Promise<void> {
      const next: Partial<Item> = { ...patch, updatedAt: nowIso() }
      if (patch.grossWt != null || patch.stoneWt != null) {
        const existing = (await itemsRepo.get(id)) as unknown as Item | undefined
        if (existing) {
          next.netWt = computeNetWt(
            patch.grossWt ?? existing.grossWt,
            patch.stoneWt ?? existing.stoneWt,
          )
        }
      }
      await itemsRepo.update(id, next)
    },

    remove: (id: number) => itemsRepo.remove(id),

    async search(term: string): Promise<Item[]> {
      const q = term.trim().toLowerCase()
      if (!q) return itemsService.getAll()
      const like = `%${q}%`
      const rows = await exec.query<Record<string, unknown>>(
        "SELECT * FROM items WHERE lower(tag) LIKE $1 OR lower(name) LIKE $1 OR lower(COALESCE(huid,'')) LIKE $1 ORDER BY id DESC",
        [like],
      )
      return rows.map((r) => decodeRow<Item>(r, typesFor("items")))
    },

    count: () => itemsRepo.count(),
  }

  const customersService = {
    getAll: () => customersRepo.getAll(["name", "ASC"]) as unknown as Promise<Customer[]>,

    get: (id: number) => customersRepo.get(id) as unknown as Promise<Customer | undefined>,

    async add(input: Omit<Customer, "id" | "createdAt" | "updatedAt">): Promise<Customer> {
      const record: Omit<Customer, "id"> = {
        ...input,
        loyaltyPoints: input.loyaltyPoints ?? 0,
        openingBalance: input.openingBalance ?? 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      return (await customersRepo.add(record)) as unknown as Customer
    },

    update: (id: number, patch: Partial<Customer>) =>
      customersRepo.update(id, { ...patch, updatedAt: nowIso() }),

    remove: (id: number) => customersRepo.remove(id),

    async search(term: string): Promise<Customer[]> {
      const q = term.trim().toLowerCase()
      if (!q) return customersService.getAll()
      const like = `%${q}%`
      const rows = await exec.query<Record<string, unknown>>(
        "SELECT * FROM customers WHERE lower(name) LIKE $1 OR mobile LIKE $1 ORDER BY name ASC",
        [like],
      )
      return rows.map((r) => decodeRow<Customer>(r, typesFor("customers")))
    },

    /** Outstanding = openingBalance + unpaid invoice balances − receipts collected. */
    async getOutstanding(customerId: number): Promise<number> {
      const cust = (await customersRepo.get(customerId)) as unknown as Customer | undefined
      if (!cust) return 0
      const inv = await exec.query<{ s: number }>(
        "SELECT COALESCE(SUM(balance), 0) AS s FROM sales_invoices WHERE customerId = $1",
        [customerId],
      )
      const rec = await exec.query<{ s: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM receipts WHERE customerId = $1",
        [customerId],
      )
      return round(cust.openingBalance + (inv[0]?.s ?? 0) - (rec[0]?.s ?? 0))
    },
  }

  return { nextSequence, itemsService, customersService }
}
