import { useCallback, useEffect, useState } from "react"
import { getMachineId } from "@/lib/machineId"
import { verifyLicense, type LicenseResult } from "@/lib/license"

/**
 * License state for the offline machine-lock. A paid license (signed, bound to
 * this machine) is stored locally; before it exists a first-run trial runs for a
 * few days, and an expired license keeps working through a short grace window so
 * a shop is never dead-stopped mid-day.
 */
const LICENSE_KEY = "jewel.license"
const TRIAL_START_KEY = "jewel.trialStart"
export const TRIAL_DAYS = 15
export const GRACE_DAYS = 7

export type LicenseState = "checking" | "licensed" | "trial" | "grace" | "expired" | "unlicensed"

export interface LicenseStatus {
  state: LicenseState
  machineId?: string
  store?: string
  exp?: string
  /** Days until expiry (negative once past). */
  daysLeft?: number
  trialDaysLeft?: number
}

/** Days left in the first-run trial; starts the clock on first call. */
function trialDaysLeft(): number {
  let start = localStorage.getItem(TRIAL_START_KEY)
  if (!start) {
    start = new Date().toISOString().slice(0, 10)
    localStorage.setItem(TRIAL_START_KEY, start)
  }
  const elapsed = Math.floor((Date.now() - Date.parse(`${start}T00:00:00`)) / 86400000)
  return Math.max(0, TRIAL_DAYS - elapsed)
}

async function evaluate(): Promise<LicenseStatus> {
  const machineId = await getMachineId()
  const stored = localStorage.getItem(LICENSE_KEY)
  if (stored) {
    const r = await verifyLicense(stored, machineId)
    if (r.valid) return { state: "licensed", machineId, store: r.store, exp: r.exp, daysLeft: r.daysLeft }
    if (r.reason === "expired") {
      const inGrace = (r.daysLeft ?? -9999) >= -GRACE_DAYS
      return { state: inGrace ? "grace" : "expired", machineId, store: r.store, exp: r.exp, daysLeft: r.daysLeft }
    }
    // wrong-machine / bad-signature / malformed → treat as unlicensed (fall through)
  }
  const trial = trialDaysLeft()
  if (trial > 0) return { state: "trial", machineId, trialDaysLeft: trial }
  return { state: "unlicensed", machineId }
}

export function useLicense() {
  const [status, setStatus] = useState<LicenseStatus>({ state: "checking" })

  const refresh = useCallback(async () => {
    setStatus(await evaluate())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Verify + persist a pasted license. Returns the verification result so the
   * caller can show why it failed (wrong machine / expired / invalid). */
  const activate = useCallback(
    async (license: string): Promise<LicenseResult> => {
      const machineId = await getMachineId()
      const r = await verifyLicense(license.trim(), machineId)
      if (r.valid) {
        localStorage.setItem(LICENSE_KEY, license.trim())
        await refresh()
      }
      return r
    },
    [refresh],
  )

  return { status, activate, refresh }
}
