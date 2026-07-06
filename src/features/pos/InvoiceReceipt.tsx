import { useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { X, Printer, MessageCircle } from "lucide-react"
import { DEFAULT_INVOICE_TEMPLATE, fillTemplate, openWhatsApp } from "@/lib/waTemplates"
import type { SalesInvoice, SalesItem, UrdItem } from "@/db/types"
import { customersService, itemsService } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { receiptT } from "@/lib/receiptI18n"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
import type { PosTotals } from "./calc"
import { cn } from "@/lib/utils"

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
  const t = receiptT(company?.receiptLanguage)
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

  const paperSize = company?.printPaperSize ?? "A5"
  const widthClass = 
    paperSize === "A4" ? "w-[210mm]" :
    paperSize === "80mm" ? "w-[80mm]" :
    "w-[148mm]"

  const isThermal = paperSize === "80mm"
  const accentColor = company?.printAccentColor || "#000000"
  const hasAccent = !!company?.printAccentColor && company.printAccentColor !== "#000000"

  // Fetch sales items from db to resolve HUID
  const itemIds = useMemo(() => {
    return items.map((it) => it.itemId).filter((id): id is number => id !== undefined)
  }, [items])

  const itemsFromDb = useLiveQuery(
    () => itemsService.getByIds(itemIds),
    [itemIds.join(",")],
    []
  )

  const itemsMap = useMemo(() => {
    const m = new Map<number, any>()
    for (const it of itemsFromDb ?? []) {
      m.set(it.id!, it)
    }
    return m
  }, [itemsFromDb])

  return (
    <div className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/40 p-6">
      {/* Toolbar — hidden when printing */}
      <div className={cn("no-print mb-3 flex items-center justify-between", widthClass)}>
        <span className="text-sm font-medium text-white">
          Invoice {invoice.invoiceNo}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-[#25D366] text-white hover:bg-[#1da851]"
            onClick={() => {
              const statusStr = invoice.balance > 0
                ? `Balance Due: ₹${formatAmount(invoice.balance)}`
                : "Paid in full. Thank you!"
              const text = fillTemplate(
                company?.templateInvoice || DEFAULT_INVOICE_TEMPLATE,
                {
                  companyName: SHOP.name,
                  invoiceNo: invoice.invoiceNo,
                  invoiceDate: formatDate(invoice.date),
                  netAmount: formatAmount(totals.netAmount),
                  paymentStatus: statusStr,
                },
              )
              openWhatsApp(customer?.mobile, text)
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
      <div
        className={cn(
          "print-area bg-white text-black shadow-xl border-t-[4px]",
          widthClass,
          isThermal ? "p-3 text-[10px]" : "p-6 text-[12px]"
        )}
        style={hasAccent ? { borderTopColor: accentColor } : undefined}
      >
        <div
          className="flex items-start justify-between border-b-2 border-black pb-2"
          style={hasAccent ? { borderBottomColor: accentColor } : undefined}
        >
          <div className="flex items-start gap-2.5">
            {company?.printShowLogo && company?.printLogoUrl && (
              <img
                src={company.printLogoUrl}
                alt="Logo"
                className={cn("object-contain", isThermal ? "size-8" : "size-12")}
              />
            )}
            <div>
              <h1 className={cn("font-bold", isThermal ? "text-sm" : "text-lg")}>{SHOP.name}</h1>
              <p className="text-[10px] leading-tight">{SHOP.address}</p>
              <p className="text-[10px] leading-tight">
                GSTIN: {SHOP.gstin} · Ph: {SHOP.phone}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p
              className={cn("font-bold", isThermal ? "text-xs" : "text-sm")}
              style={hasAccent ? { color: accentColor } : undefined}
            >
              {t("taxInvoice")}
            </p>
            <p className="text-[10px] leading-tight">{t("no")}: {invoice.invoiceNo}</p>
            <p className="text-[10px] leading-tight">{t("date")}: {formatDate(invoice.date)}</p>
          </div>
        </div>

        {/* Customer */}
        <div className="border-b border-black/30 py-2">
          <p className="text-[11px] font-semibold">{t("billTo")}</p>
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
            <tr
              className="border-b border-black [&>th]:py-1 [&>th]:text-left"
              style={hasAccent ? { borderBottomColor: accentColor } : undefined}
            >
              <th>#</th>
              <th>{t("description")}</th>
              {!isThermal && <th>HSN</th>}
              {company?.printShowHuid && <th>HUID</th>}
              <th className="text-right">{t("netWt")}</th>
              <th className="text-right">{t("rate")}</th>
              <th className="text-right">{t("making")}</th>
              <th className="text-right">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const dbItem = it.itemId ? itemsMap.get(it.itemId) : undefined
              const huid = dbItem?.huid
              return (
                <tr key={i} className="border-b border-black/15 [&>td]:py-0.5">
                  <td>{i + 1}</td>
                  <td>{it.description}</td>
                  {!isThermal && <td>{it.hsn ?? "—"}</td>}
                  {company?.printShowHuid && <td>{huid ?? "—"}</td>}
                  <td className="text-right tabular">{it.netWt.toFixed(3)}</td>
                  <td className="text-right tabular">{formatAmount(it.rate)}</td>
                  <td className="text-right tabular">
                    {formatAmount(it.makingAmount)}
                  </td>
                  <td className="text-right tabular">
                    {formatAmount(it.finalAmount)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* URD */}
        {urd.length > 0 && (
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-black/40 [&>th]:py-1 [&>th]:text-left">
                <th>{t("oldGoldUrd")}</th>
                <th className="text-right">{t("netWt")}</th>
                <th className="text-right">{t("rate")}</th>
                <th className="text-right">{t("lessAmount")}</th>
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

        {/* Totals & Bank info */}
        <div className="mt-4 flex flex-col md:flex-row justify-between gap-6 text-[11px]">
          {/* Bank Details (Left side) */}
          <div className={cn("space-y-1 rounded border p-2 bg-muted/10 text-[10px]", isThermal ? "w-full" : "w-5/12")}>
            {company?.printBankName ? (
              <>
                <p className="font-semibold uppercase text-[9px] text-muted-foreground border-b pb-0.5 mb-1" style={hasAccent ? { borderBottomColor: accentColor } : undefined}>{t("bankDetails")}</p>
                <p><span className="font-medium text-muted-foreground">{t("bank")}:</span> {company.printBankName}</p>
                {company.printBankAccountNo && <p><span className="font-medium text-muted-foreground">{t("acNo")}:</span> {company.printBankAccountNo}</p>}
                {company.printBankIfsc && <p><span className="font-medium text-muted-foreground">IFSC:</span> {company.printBankIfsc}</p>}
                {company.printBankBranch && <p><span className="font-medium text-muted-foreground">{t("branch")}:</span> {company.printBankBranch}</p>}
              </>
            ) : (
              <div className="text-muted-foreground italic text-[9px]">No bank details on file. Configure under settings.</div>
            )}
          </div>

          {/* Totals (Right side) */}
          <div className={cn("space-y-0.5", isThermal ? "w-full" : "w-1/2")}>
            <Line label={t("salesTotal")} value={totals.salesTotal} />
            {totals.urdTotal > 0 && (
              <Line label={t("lessOldGold")} value={-totals.urdTotal} />
            )}
            {totals.billDiscount > 0 && (
              <Line label={t("lessBillDiscount")} value={-totals.billDiscount} />
            )}
            {totals.makingDiscount > 0 && (
              <Line label={t("lessMakingDiscount")} value={-totals.makingDiscount} />
            )}
            {totals.loyaltyDiscount > 0 && (
              <Line label={t("lessLoyaltyPoints")} value={-totals.loyaltyDiscount} />
            )}
            <Line label={t("taxable")} value={totals.taxable} />
            {totals.igst > 0 ? (
              <Line label="IGST" value={totals.igst} />
            ) : (
              <>
                <Line label="CGST" value={totals.cgst} />
                <Line label="SGST" value={totals.sgst} />
              </>
            )}
            {totals.tcs > 0 && <Line label="TCS" value={totals.tcs} />}
            <div
              className="mt-1 flex justify-between border-t border-black pt-1 font-bold"
              style={hasAccent ? { borderTopColor: accentColor } : undefined}
            >
              <span>{t("netPayable")}</span>
              <span className="tabular">{formatAmount(totals.netAmount)}</span>
            </div>
            {invoice.advanceApplied && invoice.advanceApplied > 0 ? (
              <Line label={t("lessAdvance")} value={-invoice.advanceApplied} />
            ) : null}
            <Line label={t("cash")} value={invoice.cashPaid} />
            <Line label="UPI" value={invoice.upiPaid} />
            <div className="flex justify-between font-semibold border-t border-dashed pt-0.5 mt-0.5">
              <span>{t("balance")}</span>
              <span className="tabular">{formatAmount(invoice.balance)}</span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-black/60 whitespace-pre-line border-t pt-2" style={hasAccent ? { borderTopColor: accentColor } : undefined}>
          {company?.printTermsText ? company.printTermsText : t("thankYou")}
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
