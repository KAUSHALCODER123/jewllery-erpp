import { useLiveData } from "@/db/useLiveData"
import { Printer, ArrowDownRight, ArrowUpRight, Coins, Clock, RotateCcw } from "lucide-react"
import type { Refining } from "@/db/types"
import { refiningService } from "@/services/dbService"
import { formatAmount, formatDate, wt } from "@/lib/format"
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

export function RefiningDetailDialog({
  refining,
  onOpenChange,
}: {
  refining: Refining | null
  onOpenChange: (o: boolean) => void
}) {
  const ledger = useLiveData(
    () => (refining?.id ? refiningService.getLedger(refining.id) : Promise.resolve([])),
    [refining?.id],
    [],
  )
  const bullion = useLiveData(
    () => (refining?.id ? refiningService.getBullion(refining.id) : Promise.resolve([])),
    [refining?.id],
    [],
  )

  if (!refining) return null
  const reversed = refining.status === "reversed"
  const pure = refining.pureGoldWt ?? Number((refining.inputWt * (refining.inputFinePct / 100)).toFixed(3))
  const recovery = refining.recoveryPct ?? (refining.inputWt > 0 ? (refining.outputWt / refining.inputWt) * 100 : 0)

  return (
    <Dialog open={!!refining} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {refining.refiningNo}
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-medium",
                reversed
                  ? "bg-muted text-muted-foreground line-through"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
              )}
            >
              {reversed ? "Reversed" : "Completed"}
            </span>
          </DialogTitle>
          <DialogDescription>{formatDate(refining.date)} · {refining.description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1 text-sm print-area">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            <Meta label="Refiner" value={refining.refinerName ?? "In-house"} />
            <Meta label="Scrap Type" value={refining.scrapType ?? "—"} />
            <Meta label="Metal" value={refining.type} />
            <Meta label="Recorded by" value={refining.createdBy ?? "—"} />
            <Meta label="Bullion No" value={refining.bullionNo ?? "—"} />
            <Meta label="Output Purity" value={refining.outputPurity} />
          </div>

          {/* Weight calculation */}
          <section className="rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Weight Calculation
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <Calc label="Input Weight" value={`${wt(refining.inputWt)} g`} />
              <Calc label="Input Fineness" value={`${refining.inputKarat ?? ""} ${refining.inputFinePct}%`.trim()} />
              <Calc label="Pure Gold Content" value={`${wt(pure)} g`} />
              <Calc label="Refining Loss" value={`${refining.refiningLossPct}%`} />
              <Calc label="Loss Weight" value={`${wt(refining.lossWt ?? 0)} g`} tone="loss" />
              <Calc label="Recovery %" value={`${recovery.toFixed(2)}%`} />
            </div>
            <div className="mt-2 flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
              <span className="flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300">
                <Coins className="size-4" /> Recovered Gold
              </span>
              <span className="text-lg font-bold tabular text-emerald-700 dark:text-emerald-300">
                {wt(refining.outputWt)} g
              </span>
            </div>
          </section>

          {/* Charges */}
          {refining.totalCharge ? (
            <section className="rounded-lg border p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Charges
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                <Calc label="Basis" value={`${refining.chargeType ?? "—"} · ${refining.chargeRate ?? 0}`} />
                <Calc label="Charge" value={`₹${formatAmount(refining.chargeAmount ?? 0)}`} />
                <Calc label={`GST (${refining.chargeGstPct ?? 0}%)`} value={`₹${formatAmount(refining.chargeGstAmount ?? 0)}`} />
                <Calc label="Total Cost" value={`₹${formatAmount(refining.totalCharge)}`} strong />
              </div>
            </section>
          ) : null}

          {/* Generated bullion */}
          {bullion.length > 0 && (
            <section className="rounded-lg border p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Generated Bullion
              </h4>
              <div className="space-y-1.5">
                {bullion.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{b.bullionNo}</span>
                    <span className="text-muted-foreground">{b.purity}</span>
                    <span className="tabular">{wt(b.weight)} g</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-medium",
                        b.status === "in_stock"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {b.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Inventory movement (ledger) — the audit trail */}
          <section className="rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Inventory Movement
            </h4>
            {ledger.length === 0 ? (
              <p className="text-xs text-muted-foreground">No ledger entries recorded.</p>
            ) : (
              <div className="space-y-1.5">
                {ledger.map((l) => (
                  <div key={l.id} className="flex items-center gap-2">
                    {l.movement === "in" ? (
                      <ArrowDownRight className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <ArrowUpRight className="size-4 shrink-0 text-orange-500" />
                    )}
                    <span className="flex-1 truncate text-muted-foreground">{l.description ?? l.refType}</span>
                    <span className="tabular">{wt(l.weight)} g</span>
                    {l.createdBy && <span className="text-[11px] text-muted-foreground">· {l.createdBy}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Timeline */}
          <section className="rounded-lg border p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Timeline
            </h4>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                <span>Created{refining.createdBy ? ` by ${refining.createdBy}` : ""}</span>
                <span className="ml-auto text-muted-foreground">{fmtStamp(refining.createdAt)}</span>
              </div>
              {reversed && (
                <div className="flex items-center gap-2 text-destructive">
                  <RotateCcw className="size-4" />
                  <span>Reversed{refining.reversedBy ? ` by ${refining.reversedBy}` : ""}</span>
                  <span className="ml-auto text-muted-foreground">{fmtStamp(refining.reversedAt)}</span>
                </div>
              )}
            </div>
          </section>

          {refining.notes && (
            <section className="rounded-lg border p-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remarks</h4>
              <p className="whitespace-pre-line">{refining.notes}</p>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function fmtStamp(iso?: string): string {
  if (!iso) return "—"
  const d = iso.slice(0, 10)
  const t = iso.length > 10 ? iso.slice(11, 16) : ""
  return t ? `${formatDate(d)} ${t}` : formatDate(d)
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

function Calc({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "loss" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular", strong && "font-semibold", tone === "loss" && "text-orange-600 dark:text-orange-400")}>
        {value}
      </span>
    </div>
  )
}
