import { useMemo, useState } from "react"
import { useLiveData } from "@/db/useLiveData"
import {
  Flame,
  Calculator,
  Coins,
  TrendingDown,
  Scale,
  Loader2,
  Gem,
} from "lucide-react"
import { toast } from "sonner"
import type { MetalType } from "@/db/types"
import { itemsService, refiningService, todayStr } from "@/services/dbService"
import { METAL_TYPES, GOLD_KARATS, karatByLabel } from "@/lib/constants"
import { formatDate, wt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useSession } from "@/stores/useSession"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const round3 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(3))
const round2 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(2))

/** Best-effort fineness % from a purity label like "22K (916)" or "18K". */
function purityToFinePct(purity: string): number {
  const paren = purity.match(/\((\d{3})\)/)
  if (paren) return Number((Number(paren[1]) / 10).toFixed(2)) // 916 -> 91.6
  const karat = purity.match(/(\d{1,2})\s*K/i)
  if (karat) return Number(((Number(karat[1]) / 24) * 100).toFixed(2))
  const num = Number(purity)
  return Number.isFinite(num) && num > 0 && num <= 100 ? num : 91.6
}

/** Map an item's purity string onto a known karat, else "Custom". */
function purityToKarat(purity: string): string {
  const fine = purityToFinePct(purity)
  const hit = GOLD_KARATS.find((k) => Math.abs(k.finePct - fine) < 0.2)
  return hit ? hit.karat : "Custom"
}

export function RefiningPage() {
  const inStock = useLiveData(() => itemsService.getInStock(), [], [])
  const history = useLiveData(() => refiningService.getAll(), [], [])
  const user = useSession((s) => s.user)

  const [date, setDate] = useState(todayStr())
  const [refinerName, setRefinerName] = useState("")
  const [sourceId, setSourceId] = useState("none")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<MetalType>("gold")
  const [inputWt, setInputWt] = useState(0)
  const [karat, setKarat] = useState("22K")
  const [customFine, setCustomFine] = useState(91.6)
  const [lossPct, setLossPct] = useState(0)
  const [outputPurity, setOutputPurity] = useState("24K (999)")
  const [addToStock, setAddToStock] = useState(true)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const isGold = type === "gold"
  const usingKarat = isGold && karat !== "Custom"
  const finePct = usingKarat ? karatByLabel(karat)?.finePct ?? 91.6 : customFine

  // ---- Live, fully-automatic calculation (no manual output entry). ----
  const calc = useMemo(() => {
    const pureGold = round3(inputWt * (finePct / 100))
    const lossWt = round3(pureGold * (lossPct / 100))
    const recovered = round3(pureGold - lossWt)
    const recoveryPct = inputWt > 0 ? round2((recovered / inputWt) * 100) : 0
    return { pureGold, lossWt, recovered, recoveryPct }
  }, [inputWt, finePct, lossPct])

  const inputPurityLabel = usingKarat ? `${karat} · ${finePct}%` : `${finePct}% fine`

  const onSource = (val: string) => {
    setSourceId(val)
    if (val === "none") return
    const item = inStock.find((i) => String(i.id) === val)
    if (!item) return
    setDescription(item.name)
    setType(item.type)
    setInputWt(item.grossWt)
    if (item.type === "gold") {
      const k = purityToKarat(item.purity)
      setKarat(k)
      if (k === "Custom") setCustomFine(purityToFinePct(item.purity))
    } else {
      setCustomFine(purityToFinePct(item.purity))
    }
  }

  /** Returns an error message if the job is invalid, else null. */
  const validate = (): string | null => {
    if (!(inputWt > 0)) return "Enter a valid input weight (greater than zero)"
    if (!(finePct > 0) || finePct > 99.99) return "Fineness must be between 0 and 99.99%"
    if (lossPct < 0 || lossPct > 100) return "Refining loss must be between 0% and 100%"
    if (!(calc.recovered > 0)) return "Recovered gold must be greater than zero"
    if (calc.recovered > inputWt) return "Recovered weight cannot exceed the input weight"
    return null
  }

  const onRefine = () => {
    const err = validate()
    if (err) return toast.error(err)
    setConfirmOpen(true)
  }

  const doRefine = async () => {
    setSaving(true)
    try {
      const rec = await refiningService.create(
        {
          date,
          refinerName: refinerName.trim() || undefined,
          sourceItemId: sourceId !== "none" ? Number(sourceId) : undefined,
          description: description.trim() || "Scrap metal",
          type,
          inputWt,
          inputKarat: usingKarat ? karat : undefined,
          inputFinePct: finePct,
          pureGoldWt: calc.pureGold,
          refiningLossPct: lossPct,
          lossWt: calc.lossWt,
          outputWt: calc.recovered,
          recoveryPct: calc.recoveryPct,
          outputPurity,
          status: "completed",
          createdBy: user?.name,
        },
        { addToStock },
      )
      toast.success(
        `${rec.refiningNo}: ${wt(inputWt)} → ${wt(calc.recovered)} g pure` +
          (addToStock ? ` · bullion ${rec.outputItemId ? "added to stock" : ""}` : ""),
      )
      // Reset for the next job.
      setConfirmOpen(false)
      setSourceId("none")
      setDescription("")
      setInputWt(0)
      setLossPct(0)
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Metal Refining (Ghalai)"
        subtitle="Melt scrap / old metal into pure bullion — fineness, loss and recovery are calculated automatically"
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,460px)_1fr]">
          {/* ---- Input form ---- */}
          <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Flame className="size-4 text-orange-500" /> Refining Job
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Refiner">
                <Input
                  value={refinerName}
                  onChange={(e) => setRefinerName(e.target.value)}
                  placeholder="optional"
                />
              </Field>
            </div>

            <Field label="Source from stock (optional)">
              <Select value={sourceId} onValueChange={onSource}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Untracked scrap" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Untracked scrap</SelectItem>
                  {inStock.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.tag} · {i.name} ({wt(i.grossWt)}g)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Description">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Old 22K gold scrap"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Metal">
                <Select value={type} onValueChange={(v) => setType(v as MetalType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METAL_TYPES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Input Wt (g)">
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  className="tabular text-right"
                  value={inputWt || ""}
                  onChange={(e) => setInputWt(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Input purity: karat dropdown for gold, fineness for custom / other metals. */}
              <Field label="Input Purity">
                {isGold ? (
                  <Select value={karat} onValueChange={setKarat}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOLD_KARATS.map((k) => (
                        <SelectItem key={k.karat} value={k.karat}>
                          {k.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="Custom">Custom…</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                    Enter fineness →
                  </div>
                )}
              </Field>
              <Field label={usingKarat ? "Fineness % (auto)" : "Fineness %"}>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={99.99}
                  disabled={usingKarat}
                  className={cn("tabular text-right", usingKarat && "bg-muted/40 text-muted-foreground")}
                  value={usingKarat ? finePct : customFine || ""}
                  onChange={(e) =>
                    setCustomFine(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Refining Loss %">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  className="tabular text-right"
                  value={lossPct || ""}
                  onChange={(e) => setLossPct(e.target.value === "" ? 0 : Math.max(0, e.target.valueAsNumber || 0))}
                />
              </Field>
              <Field label="Output Purity">
                <Input value={outputPurity} onChange={(e) => setOutputPurity(e.target.value)} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={addToStock}
                onChange={(e) => setAddToStock(e.target.checked)}
                className="size-4 cursor-pointer accent-primary"
              />
              Add refined bullion to stock
            </label>
          </section>

          {/* ---- Live summary card ---- */}
          <section className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-gradient-to-b from-primary/5 to-transparent p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Calculator className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Refining Summary</h3>
              <span
                className={cn(
                  "ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  calc.recoveryPct >= 90
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                )}
              >
                {calc.recoveryPct.toFixed(2)}% recovery
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <Row icon={<Scale className="size-3.5" />} label="Input Weight" value={`${wt(inputWt)} g`} />
              <Row icon={<Gem className="size-3.5" />} label="Input Purity" value={inputPurityLabel} />
              <Row label="Pure Gold Content" value={`${wt(calc.pureGold)} g`} strong />
              <Row label="Refining Loss" value={`${lossPct || 0}%`} />
              <Row
                icon={<TrendingDown className="size-3.5 text-orange-500" />}
                label="Loss Weight"
                value={`${wt(calc.lossWt)} g`}
                tone="loss"
              />
              <Row label="Output Purity" value={outputPurity} />
              <Row
                label="Bullion Number"
                value={addToStock ? "Auto (BUL…)" : "Not added to stock"}
              />
              <Row label="Recovery %" value={`${calc.recoveryPct.toFixed(2)}%`} />
            </dl>

            {/* Recovered — the headline figure */}
            <div className="flex items-center justify-between rounded-lg border border-emerald-300/60 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <span className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                <Coins className="size-4" /> Recovered Gold
              </span>
              <span className="text-2xl font-bold tabular text-emerald-700 dark:text-emerald-300">
                {wt(calc.recovered)} <span className="text-base font-medium">g</span>
              </span>
            </div>

            <Button className="w-full" size="lg" onClick={onRefine} disabled={saving}>
              <Flame className="size-4" /> Refine &amp; Add Bullion
            </Button>
          </section>
        </div>

        {/* ---- History ---- */}
        <section className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Refining History
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-24">Ref No</TableHead>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-20 text-right">Input</TableHead>
                  <TableHead className="w-20">Purity</TableHead>
                  <TableHead className="w-20 text-right">Pure</TableHead>
                  <TableHead className="w-16 text-right">Loss%</TableHead>
                  <TableHead className="w-24 text-right">Recovered</TableHead>
                  <TableHead className="w-20 text-right">Rec.%</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                      No refining jobs yet. Melt some scrap to get started.
                    </TableCell>
                  </TableRow>
                )}
                {(history ?? []).map((r) => {
                  const pure = r.pureGoldWt ?? round3(r.inputWt * (r.inputFinePct / 100))
                  const rec = r.recoveryPct ?? (r.inputWt > 0 ? round2((r.outputWt / r.inputWt) * 100) : 0)
                  const reversed = r.status === "reversed"
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.refiningNo}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.date)}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{r.description}</TableCell>
                      <TableCell className="text-right tabular">{wt(r.inputWt)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.inputKarat ?? `${r.inputFinePct}%`}
                      </TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">{wt(pure)}</TableCell>
                      <TableCell className="text-right tabular text-muted-foreground">
                        {r.refiningLossPct}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular">{wt(r.outputWt)}</TableCell>
                      <TableCell className="text-right tabular">{rec.toFixed(1)}%</TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      {/* ---- Confirmation dialog ---- */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !saving && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm refining</DialogTitle>
            <DialogDescription>
              This melts the source metal and records the recovered bullion. It can be
              reversed later, but not silently edited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <ConfirmRow label="Input" value={`${wt(inputWt)} g · ${inputPurityLabel}`} />
            <ConfirmRow label="Pure gold" value={`${wt(calc.pureGold)} g`} />
            <ConfirmRow label="Refining loss" value={`${lossPct || 0}%  (−${wt(calc.lossWt)} g)`} />
            <ConfirmRow
              label="Recovered"
              value={`${wt(calc.recovered)} g · ${outputPurity}`}
              strong
            />
            {addToStock && (
              <p className="pt-1 text-xs text-muted-foreground">
                A bullion stock item will be created and added to inventory.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void doRefine()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Flame className="size-4" />}
              {saving ? "Refining…" : "Confirm & Refine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function Row({
  icon,
  label,
  value,
  strong,
  tone,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  strong?: boolean
  tone?: "loss"
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          "tabular",
          strong && "font-semibold",
          tone === "loss" && "text-orange-600 dark:text-orange-400",
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function ConfirmRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular", strong && "font-semibold text-foreground")}>{value}</span>
    </div>
  )
}
