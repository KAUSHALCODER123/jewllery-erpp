import { useLiveQuery } from "dexie-react-hooks"
import { X, Printer } from "lucide-react"
import type { Loan } from "@/db/types"
import { customersService } from "@/services/dbService"
import { formatAmount, formatDate, wt } from "@/lib/format"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Printable Pavati (gold-loan pledge receipt). */
export function PavatiReceipt({
  loan,
  onClose,
}: {
  loan: Loan
  onClose: () => void
}) {
  const company = useSession((s) => s.company)
  const SHOP = {
    name: company?.name ?? "Jewellery Shop",
    address: [company?.address, company?.city].filter(Boolean).join(", "),
    phone: company?.phone ?? "",
  }
  const customer = useLiveQuery(
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

  return (
    <div className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/40 p-6">
      <div className={cn("no-print mb-3 flex items-center justify-between", widthClass)}>
        <span className="text-sm font-medium text-white">
          Pavati {loan.loanNo}
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
              GIRVI PAVATI
            </p>
            <p className="text-[10px] leading-tight">No: {loan.loanNo}</p>
            <p className="text-[10px] leading-tight">Date: {formatDate(loan.date)}</p>
          </div>
        </div>

        <div className="flex justify-between gap-4 border-b border-black/30 py-2">
          <div>
            <p className="text-[11px] font-semibold">Borrower:</p>
            <p className="font-medium">{customer?.name ?? "—"}</p>
            <p className="text-[11px]">
              {customer?.mobile}
              {customer?.address ? ` · ${customer.address}` : ""}
            </p>
          </div>
          {loan.collateralImage && (
            <img
              src={loan.collateralImage}
              alt="Collateral"
              className="size-20 rounded border object-cover"
            />
          )}
        </div>

        <table className="mt-2 w-full border-collapse text-[11px]">
          <thead>
            <tr
              className="border-b border-black [&>th]:py-1 [&>th]:text-left"
              style={hasAccent ? { borderBottomColor: accentColor } : undefined}
            >
              <th>#</th>
              <th>Pledged Item</th>
              <th>Purity</th>
              <th className="text-right">Gross</th>
              <th className="text-right">Net</th>
              <th className="text-right">Est. Value</th>
            </tr>
          </thead>
          <tbody>
            {loan.itemsPledged.map((p, i) => (
              <tr key={i} className="border-b border-black/15 [&>td]:py-0.5">
                <td>{i + 1}</td>
                <td>{p.description}</td>
                <td>{p.purity}</td>
                <td className="text-right tabular">{wt(p.grossWt)}</td>
                <td className="text-right tabular">{wt(p.netWt)}</td>
                <td className="text-right tabular">
                  {formatAmount(p.estimatedValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 ml-auto w-1/2 space-y-0.5 text-[11px]">
          <div className="flex justify-between font-bold">
            <span>Loan Amount</span>
            <span className="tabular">{formatAmount(loan.loanAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Interest Rate</span>
            <span className="tabular">{loan.interestRate}% / month</span>
          </div>
          <div className="flex justify-between">
            <span>Total Net Wt</span>
            <span className="tabular">{wt(loan.netWt)} g</span>
          </div>
        </div>

        <p
          className="mt-4 text-[10px] text-black/60 border-t pt-2"
          style={hasAccent ? { borderTopColor: accentColor } : undefined}
        >
          The above goods are pledged as security for the loan. Interest accrues
          monthly. Goods will be returned on full repayment of principal plus
          interest. Subject to shop terms &amp; statutory pawn-broking rules.
          {company?.printTermsText ? ` · ${company.printTermsText}` : ""}
        </p>
        <div className="mt-6 flex justify-between text-[11px]">
          <span>Borrower Signature</span>
          <span>For {SHOP.name}</span>
        </div>
      </div>
    </div>
  )
}
