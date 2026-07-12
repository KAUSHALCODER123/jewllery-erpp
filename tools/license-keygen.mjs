#!/usr/bin/env node
/**
 * Jewel-ERP license key-maker — YOUR PRIVATE TOOL. Never ship this or the key file.
 *
 *   node tools/license-keygen.mjs genkeys
 *       One-time. Creates a keypair. Saves the PRIVATE key to
 *       tools/.license-private-key.json (gitignored — keep it secret & backed up)
 *       and prints the PUBLIC key to paste into src/lib/license.ts (LICENSE_PUBLIC_KEY).
 *
 *   node tools/license-keygen.mjs sign --machine <MID> --store "Shop Name" --days 365
 *       Make a license for one machine. Paste the printed string into the shop's
 *       "Activate" screen. `--days` sets how long until it expires (default 365).
 *       Use `--lifetime` instead of `--days` for a never-expiring key.
 *
 * The shop can never forge a license: only this private key can sign one, and the
 * app only trusts signatures from its embedded public key, for its own machine id.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const KEYFILE = fileURLToPath(new URL("./.license-private-key.json", import.meta.url))
const b64 = (buf) => Buffer.from(buf).toString("base64")
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"))
const today = () => new Date().toISOString().slice(0, 10)
const addDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10)

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

async function genkeys() {
  if (existsSync(KEYFILE)) {
    console.error(`Refusing to overwrite existing ${KEYFILE}. Delete it first if you really mean to.`)
    process.exit(1)
  }
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])
  const priv = await crypto.subtle.exportKey("pkcs8", kp.privateKey)
  const pub = await crypto.subtle.exportKey("raw", kp.publicKey)
  writeFileSync(KEYFILE, JSON.stringify({ priv: b64(priv), pub: b64(pub) }, null, 2))
  console.log(`Private key saved to ${KEYFILE}`)
  console.log("KEEP IT SECRET. Back it up. If it leaks, anyone can mint licenses.\n")
  console.log("Paste this PUBLIC key into src/lib/license.ts (LICENSE_PUBLIC_KEY):\n")
  console.log(b64(pub))
}

async function sign() {
  if (!existsSync(KEYFILE)) {
    console.error("No key file. Run:  node tools/license-keygen.mjs genkeys")
    process.exit(1)
  }
  const mid = arg("machine")
  const store = arg("store", "Store")
  const lifetime = process.argv.includes("--lifetime")
  const days = Number(arg("days", "365"))
  if (!mid) {
    console.error('Missing --machine <MID>.  e.g. --machine A7F3-9K2M-... --store "Name" --days 365')
    console.error("For a never-expiring key, add --lifetime instead of --days.")
    process.exit(1)
  }
  const { priv } = JSON.parse(readFileSync(KEYFILE, "utf8"))
  const key = await crypto.subtle.importKey("pkcs8", unb64(priv), { name: "Ed25519" }, false, ["sign"])
  const exp = lifetime ? "lifetime" : addDays(days)
  const payload = { v: 1, mid, store, iss: today(), exp }
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, bytes)
  const license = `${b64(bytes)}.${b64(sig)}`
  console.log(`\nLicense for "${store}"  ·  machine ${mid}  ·  ${lifetime ? "LIFETIME (never expires)" : `expires ${exp}`}\n`)
  console.log(license)
}

const cmd = process.argv[2]
if (cmd === "genkeys") await genkeys()
else if (cmd === "sign") await sign()
else {
  console.log("Usage:\n  node tools/license-keygen.mjs genkeys\n  node tools/license-keygen.mjs sign --machine <MID> --store \"Name\" --days 365\n  node tools/license-keygen.mjs sign --machine <MID> --store \"Name\" --lifetime")
}
