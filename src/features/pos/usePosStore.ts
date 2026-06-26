import { create } from "zustand"
import type { Item, SalesInvoice, SalesItem, UrdItem } from "@/db/types"
import type { SalesLine, UrdLine } from "./calc"

/** Generate a local row id. */
const rid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r${Date.now()}${Math.floor(Math.random() * 1e6)}`

interface PosState {
  customerId: number | null
  sales: SalesLine[]
  urd: UrdLine[]
  gstRate: number
  cashPaid: number
  upiPaid: number
  notes: string
  billDiscount: number
  makingDiscount: number
  tcsPct: number
  interState: boolean
  salesman: string
  /** Loyalty points the customer wants to redeem on this bill. */
  loyaltyRedeem: number
  /** Set when editing a saved invoice (vs creating a new one). */
  editingInvoiceId: number | null
  editingInvoiceNo: string | null
  orderId: number | null
  advanceApplied: number

  setCustomer: (id: number | null) => void
  setOrderLink: (orderId: number | null, advance: number) => void
  loadForEdit: (payload: {
    invoice: SalesInvoice
    items: SalesItem[]
    urd: UrdItem[]
  }) => void

  addSalesLine: (partial?: Partial<SalesLine>) => string
  /** Add (or refresh) a line from a scanned/looked-up stock item. */
  addFromItem: (item: Item) => void
  updateSalesLine: (id: string, patch: Partial<SalesLine>) => void
  removeSalesLine: (id: string) => void

  addUrdLine: (partial?: Partial<UrdLine>) => string
  updateUrdLine: (id: string, patch: Partial<UrdLine>) => void
  removeUrdLine: (id: string) => void

  setGstRate: (r: number) => void
  setCashPaid: (n: number) => void
  setUpiPaid: (n: number) => void
  setNotes: (s: string) => void
  setBillDiscount: (n: number) => void
  setMakingDiscount: (n: number) => void
  setTcsPct: (n: number) => void
  setInterState: (b: boolean) => void
  setSalesman: (s: string) => void
  setLoyaltyRedeem: (n: number) => void

  reset: () => void
}

const emptySalesLine = (partial?: Partial<SalesLine>): SalesLine => ({
  id: rid(),
  tag: "",
  description: "",
  netWt: 0,
  rate: 0,
  makingPerGm: 0,
  ...partial,
})

const emptyUrdLine = (partial?: Partial<UrdLine>): UrdLine => ({
  id: rid(),
  description: "",
  grossWt: 0,
  lessPct: 0,
  rate: 0,
  ...partial,
})

export const usePosStore = create<PosState>((set) => ({
  customerId: null,
  sales: [],
  urd: [],
  gstRate: 3,
  cashPaid: 0,
  upiPaid: 0,
  notes: "",
  billDiscount: 0,
  makingDiscount: 0,
  tcsPct: 0,
  interState: false,
  salesman: "",
  loyaltyRedeem: 0,
  editingInvoiceId: null,
  editingInvoiceNo: null,
  orderId: null,
  advanceApplied: 0,

  setCustomer: (id) => set({ customerId: id }),
  setOrderLink: (orderId, advance) => set({ orderId, advanceApplied: advance }),

  loadForEdit: ({ invoice, items, urd }) => {
    const gst = invoice.cgst + invoice.sgst + (invoice.igst ?? 0)
    const taxable = invoice.taxableAmount || 0
    const gstRate = taxable > 0 ? Math.round((gst / taxable) * 1000) / 10 : 3
    const tcsPct =
      taxable > 0 ? Math.round(((invoice.tcs ?? 0) / taxable) * 10000) / 100 : 0
    set({
      editingInvoiceId: invoice.id ?? null,
      editingInvoiceNo: invoice.invoiceNo,
      customerId: invoice.customerId,
      orderId: invoice.orderId ?? null,
      advanceApplied: invoice.advanceApplied ?? 0,
      gstRate,
      interState: !!invoice.igst,
      billDiscount: invoice.billDiscount ?? 0,
      makingDiscount: invoice.makingDiscount ?? 0,
      tcsPct,
      cashPaid: invoice.cashPaid,
      upiPaid: invoice.upiPaid,
      salesman: invoice.salesman ?? "",
      loyaltyRedeem: 0,
      notes: invoice.notes ?? "",
      sales: items.map((it) => ({
        id: rid(),
        itemId: it.itemId,
        tag: "",
        description: it.description,
        netWt: it.netWt,
        rate: it.rate,
        makingPerGm: it.netWt > 0 ? Number((it.makingAmount / it.netWt).toFixed(2)) : 0,
        hsn: it.hsn,
      })),
      urd: urd.map((u) => ({
        id: rid(),
        description: u.description,
        grossWt: u.grossWt,
        lessPct: u.grossWt > 0 ? Number(((u.deductionWt / u.grossWt) * 100).toFixed(2)) : 0,
        rate: u.rate,
      })),
    })
  },

  addSalesLine: (partial) => {
    const line = emptySalesLine(partial)
    set((s) => ({ sales: [...s.sales, line] }))
    return line.id
  },

  addFromItem: (item) =>
    set((s) => {
      // If the same tagged item is already on the bill, don't duplicate it.
      if (item.tag && s.sales.some((l) => l.tag === item.tag && l.itemId === item.id)) {
        return s
      }
      const line = emptySalesLine({
        itemId: item.id,
        tag: item.tag,
        description: item.name,
        netWt: item.netWt,
        makingPerGm: item.makingChargePerGm,
        hsn: item.hsn,
      })
      return { sales: [...s.sales, line] }
    }),

  updateSalesLine: (id, patch) =>
    set((s) => ({
      sales: s.sales.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),

  removeSalesLine: (id) =>
    set((s) => ({ sales: s.sales.filter((l) => l.id !== id) })),

  addUrdLine: (partial) => {
    const line = emptyUrdLine(partial)
    set((s) => ({ urd: [...s.urd, line] }))
    return line.id
  },

  updateUrdLine: (id, patch) =>
    set((s) => ({
      urd: s.urd.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),

  removeUrdLine: (id) =>
    set((s) => ({ urd: s.urd.filter((l) => l.id !== id) })),

  setGstRate: (r) => set({ gstRate: r }),
  setCashPaid: (n) => set({ cashPaid: n }),
  setUpiPaid: (n) => set({ upiPaid: n }),
  setNotes: (s) => set({ notes: s }),
  setBillDiscount: (n) => set({ billDiscount: n }),
  setMakingDiscount: (n) => set({ makingDiscount: n }),
  setTcsPct: (n) => set({ tcsPct: n }),
  setInterState: (b) => set({ interState: b }),
  setSalesman: (s) => set({ salesman: s }),
  setLoyaltyRedeem: (n) => set({ loyaltyRedeem: n }),

  reset: () =>
    set({
      customerId: null,
      sales: [],
      urd: [],
      gstRate: 3,
      cashPaid: 0,
      upiPaid: 0,
      notes: "",
      billDiscount: 0,
      makingDiscount: 0,
      tcsPct: 0,
      interState: false,
      salesman: "",
      loyaltyRedeem: 0,
      editingInvoiceId: null,
      editingInvoiceNo: null,
      orderId: null,
      advanceApplied: 0,
    }),
}))
