import { test, expect } from "@playwright/test"
import { getDataVersion, bumpDataVersion, subscribeDataVersion } from "../../src/db/dataVersion"

/**
 * The global SQLite data-version signal that drives useLiveData reactivity under
 * the SQLite backend (Dexie uses its own observable). Pure — unit-testable here.
 */

test("bump increments the version and notifies subscribers", () => {
  const start = getDataVersion()
  let calls = 0
  const unsub = subscribeDataVersion(() => calls++)

  bumpDataVersion()
  bumpDataVersion()

  expect(getDataVersion()).toBe(start + 2)
  expect(calls).toBe(2)

  unsub()
  bumpDataVersion()
  // No further notifications after unsubscribe...
  expect(calls).toBe(2)
  // ...but the version still advances.
  expect(getDataVersion()).toBe(start + 3)
})

test("multiple subscribers are all notified", () => {
  let a = 0
  let b = 0
  const ua = subscribeDataVersion(() => a++)
  const ub = subscribeDataVersion(() => b++)
  bumpDataVersion()
  expect(a).toBe(1)
  expect(b).toBe(1)
  ua()
  ub()
})
