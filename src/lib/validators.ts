import { z } from "zod"

/**
 * Zod schemas — the single source of truth for form validation across the app.
 * Strict typing on weights/purity/amounts is the whole reason we picked Zod:
 * a jewellery ledger must never accept a negative weight or a malformed PAN.
 */

const positiveWt = z
  .number({ message: "Required" })
  .min(0, "Cannot be negative")
  .max(100000, "Too large")

const nonNegMoney = z
  .number({ message: "Required" })
  .min(0, "Cannot be negative")

// PAN: ABCDE1234F · Aadhaar: 12 digits · GSTIN: 15 chars · mobile: 10 digits
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/

export const itemSchema = z
  .object({
    name: z.string().trim().min(1, "Item name is required"),
    type: z.enum(["gold", "silver", "platinum", "other"]),
    category: z.string().min(1, "Select a category"),
    purity: z.string().min(1, "Select a purity"),
    grossWt: positiveWt,
    stoneWt: positiveWt,
    makingChargePerGm: nonNegMoney,
    quantity: z.number().int().min(1, "At least 1"),
    huid: z
      .string()
      .trim()
      .toUpperCase()
      .length(6, "HUID is 6 characters")
      .optional()
      .or(z.literal("")),
    hsn: z.string().trim().optional().or(z.literal("")),
    /** Optional manual tag; blank => auto-generated from category prefix. */
    tag: z.string().trim().toUpperCase().optional().or(z.literal("")),
  })
  .refine((d) => d.stoneWt <= d.grossWt, {
    message: "Stone weight cannot exceed gross weight",
    path: ["stoneWt"],
  })

export type ItemFormValues = z.infer<typeof itemSchema>

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required"),
  mobile: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, "Enter a 10-digit mobile number"),
  address: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(panRegex, "Invalid PAN (e.g. ABCDE1234F)")
    .optional()
    .or(z.literal("")),
  aadhaar: z
    .string()
    .trim()
    .regex(/^[0-9]{12}$/, "Aadhaar is 12 digits")
    .optional()
    .or(z.literal("")),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(gstinRegex, "Invalid GSTIN")
    .optional()
    .or(z.literal("")),
  birthDate: z.string().optional().or(z.literal("")),
  anniversary: z.string().optional().or(z.literal("")),
  openingBalance: z.number(),
  loyaltyPoints: z.number().min(0),
})

export type CustomerFormValues = z.infer<typeof customerSchema>
