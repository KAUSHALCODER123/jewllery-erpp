import { useLiveData } from "@/db/useLiveData"
import { X, Printer } from "lucide-react"
import type { Loan, LoanPayment } from "@/db/types"
import { customersService } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { receiptT } from "@/lib/receiptI18n"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PaymentReceipt({
  loan,
  payment,
  onClose,
}: {
  loan: Loan
  payment: LoanPayment
  onClose: () => void
}) {
  const company = useSession((s) => s.company)
  const t = receiptT(company?.receiptLanguage)
  const SHOP = {
    name: company?.name ?? "Jewellery Shop",
    address: [company?.address, company?.city].filter(Boolean).join(", "),
    phone: company?.phone ?? "",
  }
  const customer = useLiveData(
    () => customersService.get(loan.customerId),
    [loan.customerId],
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

  const paymentTitle =
    payment.type === "part" ? t("partRepaymentReceipt") :
    payment.type === "renewal" ? t("loanRenewalVoucher") :
    t("loanClosureReceipt")

  return (
    <div className="print-overlay fixed inset-0 z-[60] flex flex-col items-center overflow-auto bg-black/40 p-6">
      <div className={cn("no-print mb-3 flex items-center justify-between", widthClass)}>
        <span className="text-sm font-medium text-white">
          Payment Receipt for {loan.loanNo}
        </span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            <X className="size-4" /> Close
          </Button>
        </div>
      </div>

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
              <p className="text-[10px] leading-tight">Ph: {SHOP.phone}</p>
            </div>
          </div>
          <div className="text-right">
            <p
              className={cn("font-bold", isThermal ? "text-xs" : "text-sm")}
              style={hasAccent ? { color: accentColor } : undefined}
            >
              {paymentTitle}
            </p>
            <p className="text-[10px] leading-tight">{t("receiptNo")}: PAY-{payment.id || "TEMP"}</p>
            <p className="text-[10px] leading-tight">{t("date")}: {formatDate(payment.date)}</p>
          </div>
        </div>

        <div className="flex justify-between gap-4 border-b border-black/30 py-2">
          <div>
            <p className="text-[11px] font-semibold">{t("borrower")}</p>
            <p className="font-medium">{customer?.name ?? "—"}</p>
            <p className="text-[11px]">
              {customer?.mobile}
              {customer?.address ? ` · ${customer.address}` : ""}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-right">{t("loanDetails")}</p>
            <p className="font-medium text-right">{t("no")}: {loan.loanNo}</p>
            <p className="text-[11px] text-right">{t("date")}: {formatDate(loan.date)}</p>
          </div>
        </div>

        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr
              className="border-b border-black [&>th]:py-1 [&>th]:text-left"
              style={hasAccent ? { borderBottomColor: accentColor } : undefined}
            >
              <th>{t("particulars")}</th>
              <th className="text-right">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black/15 [&>td]:py-1">
              <td>{t("amountReceived")}</td>
              <td className="text-right font-bold tabular">{formatAmount(payment.amount)}</td>
            </tr>
            <tr className="border-b border-black/15 [&>td]:py-1">
              <td>{t("towardsInterest")}</td>
              <td className="text-right tabular">{formatAmount(payment.towardsInterest)}</td>
            </tr>
            <tr className="border-b border-black/15 [&>td]:py-1">
              <td>{t("towardsPrincipal")}</td>
              <td className="text-right tabular">{formatAmount(payment.towardsPrincipal)}</td>
            </tr>
          </tbody>
        </table>

        {payment.notes && (
          <div className="mt-3 text-[11px]">
            <span className="font-semibold">{t("notes")}</span> {payment.notes}
          </div>
        )}

        <div
          className="mt-4 text-[10px] text-black/60 border-t pt-2"
          style={hasAccent ? { borderTopColor: accentColor } : undefined}
        >
          {t("paymentTerms")}
          {company?.printTermsText ? ` · ${company.printTermsText}` : ""}
        </div>

        <div className="mt-8 flex justify-between text-[11px]">
          <span>{t("borrowerSignature")}</span>
          <span>{t("forShop")} {SHOP.name}</span>
        </div>
      </div>
    </div>
  )
}
