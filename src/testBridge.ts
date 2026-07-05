/**
 * Test bridge — exposes the app's service layer and pure calculators on
 * `window.__jewel` so end-to-end tests (Playwright) can drive the real
 * IndexedDB-backed logic directly (an "API" surface for an offline app).
 *
 * This module is imported ONLY in DEV builds (see main.tsx), so it is tree-shaken
 * out of the production/desktop bundle and can never leak into shipped code.
 */

import { dbService } from "@/services/dbService"
import { authService } from "@/services/authService"
import * as calc from "@/features/pos/calc"
import * as interest from "@/features/girvi/interest"
import * as format from "@/lib/format"
import {
  seedAllIfEmpty,
  seedItemsIfEmpty,
  seedCustomersIfEmpty,
  seedSuppliersIfEmpty,
  seedSchemesIfEmpty,
} from "@/db/seed"
import { db, activeCompanyId } from "@/db/database"
import { systemDb } from "@/db/systemDb"

export interface JewelTestBridge {
  db: typeof dbService
  auth: typeof authService
  calc: typeof calc
  interest: typeof interest
  format: typeof format
  seed: {
    all: typeof seedAllIfEmpty
    items: typeof seedItemsIfEmpty
    customers: typeof seedCustomersIfEmpty
    suppliers: typeof seedSuppliersIfEmpty
    schemes: typeof seedSchemesIfEmpty
  }
  activeCompanyId: typeof activeCompanyId
  /** Wipe the active company's business DB (used to isolate tests). */
  resetBusinessDb: () => Promise<void>
  /** Wipe the system DB (companies + users). */
  resetSystemDb: () => Promise<void>
  /** True once the bridge is installed — tests poll on this. */
  ready: true
}

export function installTestBridge(): void {
  const bridge: JewelTestBridge = {
    db: dbService,
    auth: authService,
    calc,
    interest,
    format,
    seed: {
      all: seedAllIfEmpty,
      items: seedItemsIfEmpty,
      customers: seedCustomersIfEmpty,
      suppliers: seedSuppliersIfEmpty,
      schemes: seedSchemesIfEmpty,
    },
    activeCompanyId,
    resetBusinessDb: () =>
      db.transaction("rw", db.tables, async () => {
        await Promise.all(db.tables.map((t) => t.clear()))
      }),
    resetSystemDb: () =>
      systemDb.transaction("rw", systemDb.tables, async () => {
        await Promise.all(systemDb.tables.map((t) => t.clear()))
      }),
    ready: true,
  }
  ;(window as unknown as { __jewel: JewelTestBridge }).__jewel = bridge
}
