/**
 * `useLiveData` — a drop-in replacement for Dexie's `useLiveQuery` that stays
 * reactive under BOTH backends.
 *
 * - Dexie (default): delegates straight to `useLiveQuery`, so behaviour is
 *   identical to before (Dexie's observable drives re-renders).
 * - SQLite (cutover on, under Tauri): SQLite has no live observable, so we
 *   refetch whenever the deps OR the global data-version signal change — every
 *   SQLite mutation bumps that signal (see sqlite.ts → bumpDataVersion).
 *
 * The backend is fixed for the session, so the implementation is selected once
 * at module load — no conditional hook calls.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { isTauri } from "./sqlite"
import { SQLITE_CUTOVER_ENABLED } from "./persistence"
import { getDataVersion, subscribeDataVersion } from "./dataVersion"

const USING_SQLITE = SQLITE_CUTOVER_ENABLED && isTauri()

/** Subscribe to the global SQLite data-version signal. */
function useDataVersion(): number {
  return useSyncExternalStore(subscribeDataVersion, getDataVersion, getDataVersion)
}

/** SQLite variant: refetch on deps- or data-version change. */
function useSqliteLive<T, TDefault>(
  querier: () => T | Promise<T>,
  deps: unknown[] = [],
  defaultResult?: TDefault,
): T | TDefault {
  const version = useDataVersion()
  const [result, setResult] = useState<T | TDefault>(defaultResult as TDefault)

  useEffect(() => {
    let cancelled = false
    Promise.resolve(querier()).then(
      (r) => {
        if (!cancelled) setResult(r)
      },
      () => {
        /* swallow — same as useLiveQuery, which surfaces errors separately */
      },
    )
    return () => {
      cancelled = true
    }
    // querier is intentionally not a dep (it's recreated each render); callers
    // pass an explicit deps array, exactly like useLiveQuery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  return result
}

/** Same signature as dexie-react-hooks' useLiveQuery. */
export const useLiveData: typeof useLiveQuery = USING_SQLITE
  ? (useSqliteLive as typeof useLiveQuery)
  : useLiveQuery
