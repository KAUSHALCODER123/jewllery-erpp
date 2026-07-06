/**
 * A tiny global "data changed" signal for the SQLite backend.
 *
 * Dexie drives `useLiveQuery` reactivity via its own observable; SQLite has no
 * equivalent, so every SQLite mutation bumps this counter and the SQLite variant
 * of `useLiveData` (see useLiveData.ts) refetches when it changes. Pure (no React)
 * so the data layer (sqlite.ts) can bump it without importing React.
 */

let version = 0
const listeners = new Set<() => void>()

export const getDataVersion = (): number => version

/** Bump after a mutation to notify all live subscribers. */
export function bumpDataVersion(): void {
  version++
  for (const l of listeners) l()
}

export function subscribeDataVersion(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
