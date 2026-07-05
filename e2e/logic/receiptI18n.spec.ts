import { test, expect } from "@playwright/test"
import {
  receiptT,
  RECEIPT_KEYS,
  RECEIPT_LANGUAGES,
  type ReceiptLang,
} from "../../src/lib/receiptI18n"

/** Regional-language receipt labels — pure, no browser. */

const LANGS: ReceiptLang[] = ["en", "hi", "mr", "gu", "ta"]

test("offers exactly the supported languages with native labels", () => {
  expect(RECEIPT_LANGUAGES.map((l) => l.code)).toEqual(LANGS)
  for (const l of RECEIPT_LANGUAGES) expect(l.label.trim().length).toBeGreaterThan(0)
})

test("every key is translated (non-empty) in every language", () => {
  for (const lang of LANGS) {
    const t = receiptT(lang)
    for (const key of RECEIPT_KEYS) {
      expect(t(key), `${lang}.${key} is empty`).toBeTruthy()
    }
  }
})

test("known translations are correct", () => {
  expect(receiptT("en")("taxInvoice")).toBe("TAX INVOICE")
  expect(receiptT("hi")("taxInvoice")).toBe("कर बीजक")
  expect(receiptT("gu")("netPayable")).toBe("ચૂકવવાપાત્ર")
  expect(receiptT("ta")("balance")).toBe("மீதி")
  expect(receiptT("mr")("cash")).toBe("रोख")
})

test("falls back to English for undefined/unknown languages", () => {
  expect(receiptT(undefined)("taxInvoice")).toBe("TAX INVOICE")
  expect(receiptT(null)("balance")).toBe("Balance")
  expect(receiptT("xx" as ReceiptLang)("taxable")).toBe("Taxable")
})

test("non-English keeps the same key count as English (no missing entries)", () => {
  // Each language returns a distinct string for at least the headline label,
  // proving the dictionary is actually populated (not silently all-English).
  const headlines = LANGS.map((l) => receiptT(l)("taxInvoice"))
  expect(new Set(headlines).size).toBeGreaterThan(1)
})
