import { useLiveData } from "@/db/useLiveData"
import type { Supplier } from "@/db/types"
import { purchasePaymentsService, purchaseService, suppliersService } from "@/services/dbService"
import { formatAmount, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function VendorLedgerDialog({
  vendor,
  onOpenChange,
  onPay,
}: {
  vendor: Supplier | null
  onOpenChange: (o: boolean) => void
  onPay?: (v: Supplier) => void
}) {
  const invoices = useLiveData(() => purchaseService.getInvoices(), [], [])
  const payments = useLiveData(
    () => (vendor?.id ? purchasePaymentsService.getBySupplier(vendor.id) : Promise.resolve([])),
    [vendor?.id],
    [],
  )
  const outstanding = useLiveData(
    () => (vendor?.id ? suppliersService.getOutstanding(vendor.id) : Promise.resolve(0)),
    [vendor?.id, invoices, payments],
    0,
  )

  if (!vendor) return null
  const vendorPurchases = invoices.filter((p) => p.supplierId === vendor.id)
  const totalPurchases = vendorPurchases.reduce((s, p) => s + p.netAmount, 0)
  const lastPurchase = vendorPurchases[0]?.date

  return (
    <Dialog open={!!vendor} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {vendor.name}
            {vendor.status === "inactive" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Inactive</span>
            )}
            {vendor.rating ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                ★ {vendor.rating}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {[vendor.mobile, vendor.city, vendor.gstin].filter(Boolean).join(" · ") || "Vendor ledger"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1 text-sm">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Outstanding" value={`₹${formatAmount(outstanding)}`} tone={outstanding > 0 ? "red" : "emerald"} />
            <Stat label="Total Purchases" value={`₹${formatAmount(totalPurchases)}`} />
            <Stat label="Purchases" value={String(vendorPurchases.length)} />
            <Stat label="Last Purchase" value={lastPurchase ? formatDate(lastPurchase) : "—"} />
          </div>
          {(vendor.paymentTerms || vendor.creditLimit) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {vendor.paymentTerms && <span>Terms: <b className="text-foreground">{vendor.paymentTerms}</b></span>}
              {vendor.creditLimit ? <span>Credit limit: <b className="text-foreground">₹{formatAmount(vendor.creditLimit)}</b></span> : null}
            </div>
          )}

          {/* Purchases */}
          <section className="rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purchase History</h4>
            {vendorPurchases.length === 0 ? (
              <p className="text-xs text-muted-foreground">No purchases yet.</p>
            ) : (
              <div className="space-y-1">
                {vendorPurchases.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="font-medium">{p.purchaseNo}</span>
                    <span className="text-muted-foreground">{formatDate(p.date)}</span>
                    <span className="ml-auto tabular">₹{formatAmount(p.netAmount)}</span>
                    <span className={cn("w-20 text-right tabular text-[11px]", p.balance > 0 ? "text-destructive" : "text-emerald-600")}>
                      {p.balance > 0 ? `bal ${formatAmount(p.balance)}` : "paid"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Payments */}
          <section className="rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment History</h4>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No payments recorded.</p>
            ) : (
              <div className="space-y-1">
                {[...payments].reverse().map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-muted-foreground">{formatDate(p.date)}</span>
                    <span className="capitalize text-muted-foreground">{p.mode}</span>
                    <span className="text-[11px] text-muted-foreground">{p.purchaseId ? "against bill" : "on account"}</span>
                    {p.notes && <span className="truncate text-[11px] text-muted-foreground">· {p.notes}</span>}
                    <span className="ml-auto tabular">₹{formatAmount(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => onPay?.(vendor)}>Record Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" | "emerald" }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-bold tabular",
          tone === "red" ? "text-destructive" : tone === "emerald" ? "text-emerald-600" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  )
}
