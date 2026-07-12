import { test, expect } from "@playwright/test"
import { verifyLicense } from "@/lib/license"

/**
 * Offline license verification. FIXTURE is a real license signed by the vendor
 * private key (tools/license-keygen.mjs) for machine "FIXTURE-MID-1234",
 * store "Fixture Shop", expiring 2036-07-09. If the embedded public key changes,
 * regenerate this with:  node tools/license-keygen.mjs sign --machine FIXTURE-MID-1234 --store "Fixture Shop" --days 3650
 */
const FIXTURE =
  "eyJ2IjoxLCJtaWQiOiJGSVhUVVJFLU1JRC0xMjM0Iiwic3RvcmUiOiJGaXh0dXJlIFNob3AiLCJpc3MiOiIyMDI2LTA3LTEyIiwiZXhwIjoiMjAzNi0wNy0wOSJ9.ai3ac0G4iuJipLIeaEq6AdDMG7xOX36H9PhBCnb/ZvtnfJWS1THarZ6O3P55vc2xxtBSzGGcuQE5pUoCb8rdDA=="

const MID = "FIXTURE-MID-1234"
const NOW = new Date("2026-07-13T00:00:00Z")

test("a valid license on the right machine is accepted", async () => {
  const r = await verifyLicense(FIXTURE, MID, NOW)
  expect(r.valid).toBe(true)
  expect(r.reason).toBe("ok")
  expect(r.store).toBe("Fixture Shop")
  expect(r.exp).toBe("2036-07-09")
  expect(r.daysLeft).toBeGreaterThan(3000)
})

test("the same license on a DIFFERENT machine is rejected (anti-copy)", async () => {
  const r = await verifyLicense(FIXTURE, "SOME-OTHER-MACHINE", NOW)
  expect(r.valid).toBe(false)
  expect(r.reason).toBe("wrong-machine")
})

test("an expired license is rejected", async () => {
  const r = await verifyLicense(FIXTURE, MID, new Date("2037-01-01T00:00:00Z"))
  expect(r.valid).toBe(false)
  expect(r.reason).toBe("expired")
})

test("a tampered signature is rejected", async () => {
  const [p, s] = FIXTURE.split(".")
  const flipped = s[0] === "A" ? "B" + s.slice(1) : "A" + s.slice(1)
  const r = await verifyLicense(`${p}.${flipped}`, MID, NOW)
  expect(r.valid).toBe(false)
  expect(r.reason).toBe("bad-signature")
})

test("a tampered payload (e.g. changed machine/expiry) is rejected", async () => {
  // Re-encode the payload with a different machine id, keep the original signature.
  const forged = { v: 1, mid: "ATTACKER-PC", store: "Fixture Shop", iss: "2026-07-12", exp: "2099-01-01" }
  const forgedPayload = btoa(JSON.stringify(forged))
  const sig = FIXTURE.split(".")[1]
  const r = await verifyLicense(`${forgedPayload}.${sig}`, "ATTACKER-PC", NOW)
  expect(r.valid).toBe(false)
  expect(r.reason).toBe("bad-signature")
})

test("a lifetime key is valid forever (no expiry), even far in the future", async () => {
  // Signed for FIXTURE-MID-1234 with --lifetime.
  const LIFETIME =
    "eyJ2IjoxLCJtaWQiOiJGSVhUVVJFLU1JRC0xMjM0Iiwic3RvcmUiOiJGaXh0dXJlIFNob3AiLCJpc3MiOiIyMDI2LTA3LTEyIiwiZXhwIjoibGlmZXRpbWUifQ==.Ng9HKpA1tH7zPiuf00roeiGKFxxrK68ofo82YlekR6xHMyisGcG6CjdaDcv+3FxY5zH6UGmDNP5eHcZUlHMBAg=="
  const soon = await verifyLicense(LIFETIME, MID, NOW)
  expect(soon.valid).toBe(true)
  expect(soon.exp).toBe("lifetime")
  const decadesLater = await verifyLicense(LIFETIME, MID, new Date("2099-01-01T00:00:00Z"))
  expect(decadesLater.valid).toBe(true)
  // Still machine-locked: a lifetime key on another machine is rejected.
  expect((await verifyLicense(LIFETIME, "OTHER", NOW)).reason).toBe("wrong-machine")
})

test("garbage input is rejected, never throws", async () => {
  expect((await verifyLicense("", MID, NOW)).reason).toBe("malformed")
  expect((await verifyLicense("not-a-license", MID, NOW)).reason).toBe("malformed")
  expect((await verifyLicense("a.b", MID, NOW)).valid).toBe(false)
})
