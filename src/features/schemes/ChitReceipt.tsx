import { useLiveQuery } from "dexie-react-hooks"
import { X, Printer } from "lucide-react"
import type { Scheme, SchemeAccount, SchemePayment } from "@/db/types"
import { customersService, addMonths } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"

export function ChitReceipt({
  account,
  scheme,
  payment,
  onClose,
}: {
  account: SchemeAccount
  scheme: Scheme
  payment: SchemePayment
  onClose: () => void
}) {
  const company = useSession((s) => s.company)
  const SHOP = {
    name: company?.name ?? "Jewellery Shop",
    address: [company?.address, company?.city].filter(Boolean).join(", "),
    phone: company?.phone ?? "",
  }

  const customer = useLiveQuery(
    () => customersService.get(account.customerId),
    [account.customerId],
    undefined,
  )

  const nextDueDate = payment.installmentNo < scheme.durationMonths
    ? addMonths(account.startDate, payment.installmentNo)
    : null

  return (
    <div className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/40 p-6">
      <div className="no-print mb-3 flex w-[80mm] items-center justify-between">
        <span className="text-sm font-medium text-white">Chit #{payment.id}</span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            <X className="size-4" /> Close
          </Button>
        </div>
      </div>

      <div className="print-area w-[80mm] bg-white p-4 text-[11px] text-black shadow-xl font-mono">
        <div className="text-center border-b border-dashed border-black pb-2">
          <h2 className="text-sm font-bold uppercase">{SHOP.name}</h2>
          <p className="text-[10px]">{SHOP.address}</p>
          <p className="text-[10px]">Ph: {SHOP.phone}</p>
          <p className="mt-1 font-semibold border border-black px-2 py-0.5 inline-block text-[10px]">
            SCHEME PAYMENT RECEIPT
          </p>
        </div>

        <div className="py-2 border-b border-dashed border-black space-y-0.5">
          <div className="flex justify-between">
            <span>Date:</span>
            <span className="font-semibold">{formatDate(payment.date)}</span>
          </div>
          <div className="flex justify-between">
            <span>Receipt No:</span>
            <span className="font-semibold">SCH-{payment.id}</span>
          </div>
          <div className="flex justify-between">
            <span>Account No:</span>
            <span className="font-semibold">{account.accountNo}</span>
          </div>
          <div className="flex justify-between">
            <span>Scheme:</span>
            <span className="font-semibold">{scheme.name}</span>
          </div>
          <div className="flex justify-between">
            <span>Customer:</span>
            <span className="font-semibold truncate max-w-[150px]">{customer?.name ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span>Mobile:</span>
            <span className="font-semibold">{customer?.mobile ?? "—"}</span>
          </div>
        </div>

        <div className="py-2 border-b border-dashed border-black space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span>Installment Paid:</span>
            <span>{payment.installmentNo} / {scheme.durationMonths}</span>
          </div>
          <div className="flex justify-between text-xs font-bold">
            <span>Amount Paid:</span>
            <span>{formatAmount(payment.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Payment Mode:</span>
            <span className="uppercase font-semibold">{payment.mode}</span>
          </div>
        </div>

        <div className="py-2 border-b border-dashed border-black space-y-0.5">
          {nextDueDate ? (
            <div className="flex justify-between font-bold text-[10px]">
              <span>Next Due Date:</span>
              <span>{formatDate(nextDueDate)}</span>
            </div>
          ) : (
            <div className="text-center font-bold text-emerald-600 text-[10px]">
              ★ SCHEME MATURED ★
            </div>
          )}
        </div>

        <div className="pt-4 text-center text-[9px] text-black/60">
          <p>Thank you for saving with us!</p>
          <p className="mt-2 border-t border-dashed border-black/30 pt-2 font-sans">
            Authorized Signatory
          </p>
        </div>
      </div>
    </div>
  )
}
