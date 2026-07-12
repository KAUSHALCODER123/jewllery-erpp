# Licensing (offline machine-lock)

Jewel-ERP is locked to one computer per license so a copied install can't run on
another machine. It's fully offline — no server, no internet needed.

## How it works
- Each PC has a stable **Machine ID** (from its hardware). The app shows it on the
  Activate screen and in **Settings → License**.
- You issue a **license key** signed with your **private key** — bound to that one
  Machine ID, with an **expiry date**.
- The app trusts only keys signed by your key (its public half is baked into the
  build) and only for its own Machine ID. Copy the install to another PC → the
  Machine ID won't match → it won't run. Nobody can forge a key without your
  private key.
- **First run gets a 15-day free trial.** After a license expires there's a **7-day
  grace** window (app still works, red banner) before it locks.

## One-time setup (already done)
A keypair was generated with:
```
node tools/license-keygen.mjs genkeys
```
- The **private key** is at `tools/.license-private-key.json` — **gitignored. KEEP IT
  SECRET AND BACK IT UP.** If it leaks, anyone can mint licenses. If you lose it, you
  can't issue keys for the current build — you'd have to run `genkeys` again, paste the
  new public key into `src/lib/license.ts` (`LICENSE_PUBLIC_KEY`), rebuild, and
  re-license everyone.
- The **public key** is embedded in `src/lib/license.ts`.

## Selling / activating a shop
1. Shop installs the app → the Activate screen shows their **Machine ID** (e.g.
   `A498-E6C4-F94A-BEEC`). They read it to you (WhatsApp/phone).
2. They pay. You mint a license:
   ```
   node tools/license-keygen.mjs sign --machine "A498-E6C4-F94A-BEEC" --store "Ramesh Jewellers" --days 365
   ```
3. Send them the printed key. They paste it into the Activate screen (or Settings →
   License) and click Activate. Done.

**10 stores = 10 Machine IDs = 10 licenses = you charge for 10.** One owner can't run
a second store on the first store's key.

## Renewing
Same command with a fresh `--days`. Send the new key; they paste it in Settings →
License → Apply. Expiry dates are your recurring-revenue lever.

## Handling edge cases
- **New PC / Windows reinstall** changes the Machine ID → just issue a new key for the
  new id.
- **Trial length / grace** live in `src/features/license/useLicense.ts`
  (`TRIAL_DAYS`, `GRACE_DAYS`).

## Honest limits
Verification runs in the app (JavaScript), so it stops casual copying between shops —
the real threat — but not a determined reverse-engineer. That's an accepted trade-off
for an offline app. If you later want stronger enforcement (remote revoke, seat
counts), add an online activation check on top; the machine-lock stays as the base.

## Tests
`e2e/logic/license.spec.ts` verifies accept / wrong-machine / expired / tampered /
garbage against a signed fixture. Regenerate the fixture if you ever change the keypair.
