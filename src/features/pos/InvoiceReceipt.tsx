import { useMemo, useState } from "react"
import { useLiveData } from "@/db/useLiveData"
import { X, Printer, MessageCircle, FileText, Receipt } from "lucide-react"
import { defaultWaTemplate, fillTemplate, openWhatsApp } from "@/lib/waTemplates"
import type { SalesInvoice, SalesItem, UrdItem } from "@/db/types"
import { customersService, itemsService } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { receiptT } from "@/lib/receiptI18n"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
import { Barcode } from "@/components/Barcode"
import {
  parseReceiptLayout,
  alignClass,
  fontSizeClass,
  type ReceiptBlockType,
} from "@/features/receipt-designer/layout"
import { parseReceiptTheme, receiptFontClass } from "@/features/receipt-designer/theme"
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
  // Print mode: a Tax Invoice shows the GST breakup; an Estimate is the same
  // saved sale printed without the tax lines and headed "ESTIMATE". Nothing about
  // the stored sale, stock, reports or numbering changes — only what is printed.
  const [mode, setMode] = useState<"invoice" | "estimate">("invoice")
  const isEstimate = mode === "estimate"
  const company = useSession((s) => s.company)
  const t = receiptT(company?.receiptLanguage)
  const SHOP = {
    name: company?.name ?? "Jewellery Shop",
    address: [company?.address, company?.city].filter(Boolean).join(", "),
    gstin: company?.gstin ?? "",
    phone: company?.phone ?? "",
  }
  const customer = useLiveData(
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
  const theme = parseReceiptTheme(company?.receiptTheme)
  const band = theme.header === "band"
  const accentColor = company?.printAccentColor || theme.accent
  const hasAccent = accentColor !== "#000000"

  // The printed-receipt layout designed in the Receipt Designer (order + which
  // sections show). Absent/invalid → the standard order.
  const layout = useMemo(
    () => parseReceiptLayout(company?.receiptLayout),
    [company?.receiptLayout],
  )

  // Fetch sales items from db to resolve HUID
  const itemIds = useMemo(() => {
    return items.map((it) => it.itemId).filter((id): id is number => id !== undefined)
  }, [items])

  const itemsFromDb = useLiveData(
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

  // ---- Each receipt section as a node, keyed by block type. The designer
  // decides the order and which appear; the renderer below walks the layout. ----
  const sections: Record<ReceiptBlockType, React.ReactNode> = {
    header: (
      <div
        className={cn("flex items-start justify-between pb-2", band ? "rounded-md p-3 text-white" : "border-b-2 border-black")}
        style={band ? { backgroundColor: accentColor } : hasAccent ? { borderBottomColor: accentColor } : undefined}
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
            className={cn("font-bold uppercase", isThermal ? "text-xs" : "text-sm")}
            style={band ? undefined : hasAccent ? { color: accentColor } : undefined}
          >
            {isEstimate ? t("estimate") : t("taxInvoice")}
          </p>
          {isEstimate && <p className="text-[9px] leading-tight italic">{t("notATaxInvoice")}</p>}
          <p className="text-[10px] leading-tight">{t("no")}: {invoice.invoiceNo}</p>
          <p className="text-[10px] leading-tight">{t("date")}: {formatDate(invoice.date)}</p>
        </div>
      </div>
    ),

    customer: (
      <div className="border-b border-black/30 py-2">
        <p className="text-[11px] font-semibold">{t("billTo")}</p>
        <p className="font-medium">{customer?.name ?? "—"}</p>
        <p className="text-[11px]">
          {customer?.mobile}
          {customer?.address ? ` · ${customer.address}` : ""}
          {customer?.city ? `, ${customer.city}` : ""}
        </p>
        {customer?.gstin && <p className="text-[11px]">GSTIN: {customer.gstin}</p>}
      </div>
    ),

    items: (
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
                <td className="text-right tabular">{formatAmount(it.makingAmount)}</td>
                <td className="text-right tabular">{formatAmount(it.finalAmount)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    ),

    urd:
      urd.length > 0 ? (
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
                <td className="text-right tabular">-{formatAmount(u.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null,

    totals: (
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
          {totals.urdTotal > 0 && <Line label={t("lessOldGold")} value={-totals.urdTotal} />}
          {totals.billDiscount > 0 && <Line label={t("lessBillDiscount")} value={-totals.billDiscount} />}
          {totals.makingDiscount > 0 && <Line label={t("lessMakingDiscount")} value={-totals.makingDiscount} />}
          {totals.loyaltyDiscount > 0 && <Line label={t("lessLoyaltyPoints")} value={-totals.loyaltyDiscount} />}
          {!isEstimate && (
            <>
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
            </>
          )}
          <div
            className="mt-1 flex justify-between border-t border-black pt-1 font-bold"
            style={hasAccent ? { borderTopColor: accentColor } : undefined}
          >
            <span>{isEstimate ? t("total") : t("netPayable")}</span>
            <span className="tabular">{formatAmount(totals.netAmount)}</span>
          </div>
          {invoice.advanceApplied && invoice.advanceApplied > 0 ? (
            <Line label={t("lessAdvance")} value={-invoice.advanceApplied} />
          ) : null}
          <Line label={t("cash")} value={invoice.cashPaid} />
          <Line label="UPI" value={invoice.upiPaid} />
          {(invoice.paymentDetails ?? []).filter((p) => p.amount > 0).map((p) => <Line key={p.mode} label={`${p.mode.toUpperCase()}${p.reference ? ` (${p.reference})` : ""}`} value={p.amount} />)}
          <div className="flex justify-between font-semibold border-t border-dashed pt-0.5 mt-0.5">
            <span>{t("balance")}</span>
            <span className="tabular">{formatAmount(invoice.balance)}</span>
          </div>
        </div>
      </div>
    ),

    barcode: (
      <div className="mt-3 flex justify-center">
        <Barcode value={invoice.invoiceNo} height={32} />
      </div>
    ),

    footer: (
      <p className="mt-6 text-center text-[10px] text-black/60 whitespace-pre-line border-t pt-2" style={hasAccent ? { borderTopColor: accentColor } : undefined}>
        {company?.printTermsText ? company.printTermsText : t("thankYou")}
      </p>
    ),

    text: null, // per-block content rendered inline below
  }

  return (
    <div className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/40 p-6">
      {/* Toolbar — hidden when printing */}
      <div className={cn("no-print mb-3 flex items-center justify-between", widthClass)}>
        <span className="text-sm font-medium text-white">
          {isEstimate ? "Estimate" : "Invoice"} {invoice.invoiceNo}
        </span>
        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded-md border border-white/30">
            <button
              type="button"
              onClick={() => setMode("invoice")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs font-medium",
                !isEstimate ? "bg-white text-black" : "text-white hover:bg-white/10",
              )}
            >
              <Receipt className="size-3.5" /> Tax Invoice
            </button>
            <button
              type="button"
              onClick={() => setMode("estimate")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs font-medium",
                isEstimate ? "bg-white text-black" : "text-white hover:bg-white/10",
              )}
            >
              <FileText className="size-3.5" /> Estimate
            </button>
          </div>
          <Button
            size="sm"
            className="bg-[#25D366] text-white hover:bg-[#1da851]"
            onClick={() => {
              const statusStr = invoice.balance > 0
                ? `${t("balanceDue")}: ₹${formatAmount(invoice.balance)}`
                : t("paidInFull")
              const text = fillTemplate(
                company?.templateInvoice || defaultWaTemplate("invoice", company?.receiptLanguage),
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

      {/* The printable invoice — sections rendered in the designed order. */}
      <div
        className={cn(
          "print-area bg-white text-black shadow-xl",
          receiptFontClass(theme.font),
          theme.border === "box" ? "border-2" : theme.border === "line" ? "border-t-[4px]" : "",
          widthClass,
          isThermal ? "p-3 text-[10px]" : "p-6 text-[12px]"
        )}
        style={
          theme.border === "box"
            ? { borderColor: accentColor }
            : theme.border === "line"
              ? { borderTopColor: accentColor }
              : undefined
        }
      >
        {layout
          .filter((b) => b.enabled)
          .map((block) => {
            const node =
              block.type === "text"
                ? block.text
                  ? <p className="whitespace-pre-line">{block.text}</p>
                  : null
                : sections[block.type]
            if (!node) return null
            return (
              <div
                key={block.id}
                className={cn(
                  alignClass(block.align),
                  block.fontSize && (block.type === "text" || block.type === "footer")
                    ? fontSizeClass(block.fontSize)
                    : undefined,
                  block.bold && "font-bold",
                )}
              >
                {node}
              </div>
            )
          })}
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
