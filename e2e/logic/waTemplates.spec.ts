import { test, expect } from "@playwright/test"
import {
  defaultWaTemplate,
  fillTemplate,
  normalizePhone,
  type WaTemplateKind,
} from "../../src/lib/waTemplates"
import { RECEIPT_LANGUAGES, type ReceiptLang } from "../../src/lib/receiptI18n"

/** Localized WhatsApp share templates. */

const KINDS: WaTemplateKind[] = ["invoice", "dues", "girvi", "scheme"]
const LANGS = RECEIPT_LANGUAGES.map((l) => l.code) as ReceiptLang[]
const tokens = (s: string) => new Set(s.match(/{{\w+}}/g) ?? [])

test("fillTemplate replaces every placeholder ($-safe)", () => {
  expect(fillTemplate("Hi {{name}}, owe ₹{{amt}}", { name: "A", amt: 500 })).toBe("Hi A, owe ₹500")
  expect(fillTemplate("{{a}} {{a}}", { a: "x" })).toBe("x x")
})

test("defaultWaTemplate falls back to English for unknown/undefined language", () => {
  expect(defaultWaTemplate("dues", undefined)).toBe(defaultWaTemplate("dues", "en"))
  expect(defaultWaTemplate("invoice", "xx" as ReceiptLang)).toBe(defaultWaTemplate("invoice", "en"))
})

test("known translations are localized, not English", () => {
  expect(defaultWaTemplate("invoice", "hi")).toContain("कुल देय") // Net Payable
  expect(defaultWaTemplate("scheme", "ta")).toContain("மாதாந்திர") // monthly
  expect(defaultWaTemplate("dues", "gu")).toContain("બાકી")
})

test("every language keeps the same {{placeholders}} as English (fillTemplate parity)", () => {
  for (const kind of KINDS) {
    const en = tokens(defaultWaTemplate(kind, "en"))
    for (const lang of LANGS) {
      expect([...tokens(defaultWaTemplate(kind, lang))].sort(), `${kind}/${lang} placeholders drifted`).toEqual(
        [...en].sort(),
      )
    }
  }
})

test("every kind × language is non-empty", () => {
  for (const kind of KINDS) {
    for (const lang of LANGS) {
      expect(defaultWaTemplate(kind, lang).trim().length, `${kind}/${lang}`).toBeGreaterThan(0)
    }
  }
})

test("normalizePhone prefixes 91 for bare 10-digit numbers", () => {
  expect(normalizePhone("9876543210")).toBe("919876543210")
  expect(normalizePhone("+91 98765 43210")).toBe("919876543210")
  expect(normalizePhone("")).toBe("")
})
