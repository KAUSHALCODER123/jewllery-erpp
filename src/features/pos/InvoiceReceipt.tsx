import { useLiveQuery } from "dexie-react-hooks"
import { X, Printer, MessageCircle } from "lucide-react"
import type { SalesInvoice, SalesItem, UrdItem } from "@/db/types"
import { customersService } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
import type { PosTotals } from "./calc"

export interface PrintPayload {
  invoice: SalesInvoice
  items: Omit<SalesItem, "id" | "invoiceId">[]
  urd: Omit<UrdItem, "id" | "invoiceId">[]
  totals: PosTotals
}

export function InvoiceReceipt({
  payload,
  onClose,
}: {
  payload: PrintPayload
  onClose: () => void
}) {
  const { invoice, items, urd, totals } = payload
  const company = useSession((s) => s.company)
  const SHOP = {
    name: company?.name ?? "Jewellery Shop",
    address: [company?.address, company?.city].filter(Boolean).join(", "),
    gstin: company?.gstin ?? "",
    phone: company?.phone ?? "",
  }
  const customer = useLiveQuery(
    () => customersService.get(invoice.customerId),
    [invoice.customerId],
    undefined,
  )

  return (
    <div className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/40 p-6">
      {/* Toolbar — hidden when printing */}
      <div className="no-print mb-3 flex w-[148mm] items-center justify-between">
        <span className="text-sm font-medium text-white">
          Invoice {invoice.invoiceNo}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-[#25D366] text-white hover:bg-[#1da851]"
            onClick={() => {
              const lines = [
                `*${SHOP.name}*`,
                `Invoice ${invoice.invoiceNo} · ${formatDate(invoice.date)}`,
                `Net Payable: ₹${formatAmount(totals.netAmount)}`,
                invoice.balance > 0
                  ? `Balance Due: ₹${formatAmount(invoice.balance)}`
                  : "Paid in full. Thank you!",
              ]
              const text = encodeURIComponent(lines.join("\n"))
              const digits = (customer?.mobile ?? "").replace(/\D/g, "")
              const phone = digits.length === 10 ? `91${digits}` : digits
              window.open(
                `https://wa.me/${phone}?text=${text}`,
                "_blank",
                "noopener",
              )
            }}
          >
            <MessageCircle className="size-4" /> WhatsApp
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            <X className="size-4" /> Close
          </Button>
        </div>
      </div>

      {/* The printable invoice */}
      <div className="print-area w-[148mm] bg-white p-6 text-[12px] text-black shadow-xl">
        <div className="flex items-start justify-between border-b-2 border-black pb-2">
          <div>
            <h1 className="text-lg font-bold">{SHOP.name}</h1>
            <p className="text-[11px]">{SHOP.address}</p>
            <p className="text-[11px]">
              GSTIN: {SHOP.gstin} · Ph: {SHOP.phone}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">TAX INVOICE</p>
            <p className="text-[11px]">No: {invoice.invoiceNo}</p>
            <p className="text-[11px]">Date: {formatDate(invoice.date)}</p>
          </div>
        </div>

        {/* Customer */}
        <div className="border-b border-black/30 py-2">
          <p className="text-[11px] font-semibold">Bill To:</p>
          <p className="font-medium">{customer?.name ?? "—"}</p>
          <p className="text-[11px]">
            {customer?.mobile}
            {customer?.address ? ` · ${customer.address}` : ""}
            {customer?.city ? `, ${customer.city}` : ""}
          </p>
          {customer?.gstin && (
            <p className="text-[11px]">GSTIN: {customer.gstin}</p>
          )}
        </div>

        {/* Sales lines */}
        <table className="mt-2 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-black [&>th]:py-1 [&>th]:text-left">
              <th>#</th>
              <th>Description</th>
              <th className="text-right">Net Wt</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Making</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-black/15 [&>td]:py-0.5">
                <td>{i + 1}</td>
                <td>{it.description}</td>
                <td className="text-right tabular">{it.netWt.toFixed(3)}</td>
                <td className="text-right tabular">{formatAmount(it.rate)}</td>
                <td className="text-right tabular">
                  {formatAmount(it.makingAmount)}
                </td>
                <td className="text-right tabular">
                  {formatAmount(it.finalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* URD */}
        {urd.length > 0 && (
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-black/40 [&>th]:py-1 [&>th]:text-left">
                <th>Old Gold (URD)</th>
                <th className="text-right">Net Wt</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Less Amount</th>
              </tr>
            </thead>
            <tbody>
              {urd.map((u, i) => (
                <tr key={i} className="[&>td]:py-0.5">
                  <td>{u.description}</td>
                  <td className="text-right tabular">{u.netWt.toFixed(3)}</td>
                  <td className="text-right tabular">{formatAmount(u.rate)}</td>
                  <td className="text-right tabular">
                    -{formatAmount(u.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div className="mt-3 ml-auto w-1/2 space-y-0.5 text-[11px]">
          <Line label="Sales Total" value={totals.salesTotal} />
          {totals.urdTotal > 0 && (
            <Line label="Less: Old Gold" value={-totals.urdTotal} />
          )}
          {totals.billDiscount > 0 && (
            <Line label="Less: Bill Discount" value={-totals.billDiscount} />
          )}
          {totals.makingDiscount > 0 && (
            <Line label="Less: Making Discount" value={-totals.makingDiscount} />
          )}
          {totals.loyaltyDiscount > 0 && (
            <Line label="Less: Loyalty Points" value={-totals.loyaltyDiscount} />
          )}
          <Line label="Taxable" value={totals.taxable} />
          {totals.igst > 0 ? (
            <Line label="IGST" value={totals.igst} />
          ) : (
            <>
              <Line label="CGST" value={totals.cgst} />
              <Line label="SGST" value={totals.sgst} />
            </>
          )}
          {totals.tcs > 0 && <Line label="TCS" value={totals.tcs} />}
          <div className="mt-1 flex justify-between border-t border-black pt-1 font-bold">
            <span>Net Payable</span>
            <span className="tabular">{formatAmount(totals.netAmount)}</span>
          </div>
          {invoice.advanceApplied && invoice.advanceApplied > 0 ? (
            <Line label="Less: Advance Adjusted" value={-invoice.advanceApplied} />
          ) : null}
          <Line label="Cash" value={invoice.cashPaid} />
          <Line label="UPI" value={invoice.upiPaid} />
          <div className="flex justify-between font-semibold">
            <span>Balance</span>
            <span className="tabular">{formatAmount(invoice.balance)}</span>
          </div>
        </div>

        <p className="mt-4 text-center text-[10px] text-black/60">
          Thank you for your business! · Goods once sold are subject to shop terms.
        </p>
      </div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular">{formatAmount(value)}</span>
    </div>
  )
}
