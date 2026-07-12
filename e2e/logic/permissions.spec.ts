import { expect, test } from "@playwright/test"
import { can, discountDecision, normalizeRole } from "../../src/lib/permissions"

test("legacy cashier migrates logically to staff", () => expect(normalizeRole("cashier")).toBe("staff"))
test("staff can do daily and reasoned work but not destructive administration", () => {
  expect(can("staff", "daily")).toBeTruthy()
  expect(can("staff", "reasoned")).toBeTruthy()
  expect(can("staff", "restore_backup")).toBeFalsy()
  expect(can("staff", "permanent_delete")).toBeFalsy()
})
test("manager handles major stock actions while owner retains administration", () => {
  expect(can("manager", "irreversible_stock")).toBeTruthy()
  expect(can("manager", "manage_users")).toBeFalsy()
  expect(can("owner", "manage_users")).toBeTruthy()
})
test("discount thresholds allow, request reason, then escalate only staff", () => {
  const p={directLimit:500,reasonLimit:2000}
  expect(discountDecision("staff",500,p)).toBe("allow")
  expect(discountDecision("staff",501,p)).toBe("reason")
  expect(discountDecision("staff",2001,p)).toBe("manager")
  expect(discountDecision("manager",2001,p)).toBe("reason")
})
