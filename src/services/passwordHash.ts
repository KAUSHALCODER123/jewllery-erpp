/**
 * Password hashing primitives (Web Crypto), shared by the Dexie and SQLite auth
 * implementations. Salted SHA-256 — appropriate for gating a single-machine
 * offline shop app and separating cashier vs owner roles.
 */

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")

export const randomSalt = (): string => {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return toHex(a.buffer)
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return toHex(digest)
}
