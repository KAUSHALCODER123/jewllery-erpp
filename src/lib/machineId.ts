/**
 * The machine id this install is locked to for licensing.
 *
 * Desktop: the OS hardware id from the Rust `get_machine_id` command, hashed +
 * formatted — different on every physical machine, so a copied install can't
 * reuse another machine's license.
 * Web/dev: a stable per-browser random id (persisted) so the activation flow is
 * testable without the desktop shell. Real enforcement is the desktop path.
 */
import { isTauri } from "@/db/sqlite"

const FALLBACK_KEY = "jewel.machineId.fallback"

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

/** Group the first 16 hex chars into XXXX-XXXX-XXXX-XXXX (uppercase). */
function format(hashHex: string): string {
  return (hashHex.slice(0, 16).toUpperCase().match(/.{1,4}/g) ?? []).join("-")
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return toHex(buf)
}

let cached: string | null = null

/** The stable machine id used to lock/verify a license. Memoised per session. */
export async function getMachineId(): Promise<string> {
  if (cached) return cached
  let raw: string
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core")
    raw = await invoke<string>("get_machine_id")
  } else {
    raw = localStorage.getItem(FALLBACK_KEY) ?? ""
    if (!raw) {
      raw = crypto.randomUUID()
      localStorage.setItem(FALLBACK_KEY, raw)
    }
  }
  cached = format(await sha256Hex(`jewel-erp:${raw}`))
  return cached
}
