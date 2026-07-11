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
  Plus,
  Search,
  Pencil,
  Trash2,
  Building2,
  User,
  Receipt as ReceiptIcon,
  RotateCcw,
  BarChart3,
  TrendingUp,
  Percent,
  IndianRupee,
  CalendarDays,
  Boxes,
  Eye,
} from "lucide-react"
import { toast } from "sonner"
import type { MetalType, Refiner, Refining } from "@/db/types"
import { itemsService, refiningService, refinersService, todayStr } from "@/services/dbService"
import {
  METAL_TYPES,
  GOLD_KARATS,
  karatByLabel,
  SCRAP_TYPES,
  REFINING_CHARGE_TYPES,
} from "@/lib/constants"
import { formatAmount, formatDate, wt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useSession } from "@/stores/useSession"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { RefinerFormDialog } from "./RefinerFormDialog"
import { RefiningDetailDialog } from "./RefiningDetailDialog"

type ChargeType = "none" | "per_gram" | "flat" | "percentage"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

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

function purityToKarat(purity: string): string {
  const fine = purityToFinePct(purity)
  const hit = GOLD_KARATS.find((k) => Math.abs(k.finePct - fine) < 0.2)
  return hit ? hit.karat : "Custom"
}

export function RefiningPage() {
  const inStock = useLiveData(() => itemsService.getInStock(), [], [])
  const history = useLiveData(() => refiningService.getAll(), [], [])
  const refiners = useLiveData(() => refinersService.getAll(), [], [])
  const user = useSession((s) => s.user)

  const [tab, setTab] = useState("refine")

  // ---- Job form state ----
  const [date, setDate] = useState(todayStr())
  const [refinerId, setRefinerId] = useState("none")
  const [sourceId, setSourceId] = useState("none")
  const [scrapType, setScrapType] = useState("Old Jewellery")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<MetalType>("gold")
  const [inputWt, setInputWt] = useState(0)
  const [karat, setKarat] = useState("22K")
  const [customFine, setCustomFine] = useState(91.6)
  const [lossPct, setLossPct] = useState(0)
  const [outputPurity, setOutputPurity] = useState("24K (999)")
  const [addToStock, setAddToStock] = useState(true)

  // ---- Charges ----
  const [chargeType, setChargeType] = useState<ChargeType>("none")
  const [chargeRate, setChargeRate] = useState(0)
  const [chargeBase, setChargeBase] = useState(0)
  const [chargeGstPct, setChargeGstPct] = useState(0)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // ---- Refiner management ----
  const [refinerDialogOpen, setRefinerDialogOpen] = useState(false)
  const [editRefiner, setEditRefiner] = useState<Refiner | null>(null)

  // ---- History filters + reversal ----
  const [histSearch, setHistSearch] = useState("")
  const [histScrap, setHistScrap] = useState("all")
  const [reverseTarget, setReverseTarget] = useState<Refining | null>(null)
  const [reversing, setReversing] = useState(false)
  const [detailTarget, setDetailTarget] = useState<Refining | null>(null)

  const isGold = type === "gold"
  const usingKarat = isGold && karat !== "Custom"
  const finePct = usingKarat ? karatByLabel(karat)?.finePct ?? 91.6 : customFine

  const calc = useMemo(() => {
    const pureGold = round3(inputWt * (finePct / 100))
    const lossWt = round3(pureGold * (lossPct / 100))
    const recovered = round3(pureGold - lossWt)
    const recoveryPct = inputWt > 0 ? round2((recovered / inputWt) * 100) : 0
    return { pureGold, lossWt, recovered, recoveryPct }
  }, [inputWt, finePct, lossPct])

  const charges = useMemo(() => {
    let amount = 0
    if (chargeType === "per_gram") amount = round2(chargeRate * inputWt)
    else if (chargeType === "flat") amount = round2(chargeRate)
    else if (chargeType === "percentage") amount = round2((chargeBase * chargeRate) / 100)
    const gst = round2(amount * (chargeGstPct / 100))
    return { amount, gst, total: round2(amount + gst) }
  }, [chargeType, chargeRate, chargeBase, chargeGstPct, inputWt])

  const hasCharge = chargeType !== "none"
  const chargeUnit = REFINING_CHARGE_TYPES.find((c) => c.value === chargeType)?.unit ?? ""
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

  const onSelectRefiner = (val: string) => {
    setRefinerId(val)
    if (val === "none") return
    const r = refiners.find((x) => String(x.id) === val)
    if (r?.chargeType) {
      setChargeType(r.chargeType as ChargeType)
      setChargeRate(r.chargeRate ?? 0)
      setChargeGstPct(r.gstPct ?? 0)
    }
  }

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
      const refiner = refinerId !== "none" ? refiners.find((r) => String(r.id) === refinerId) : undefined
      const rec = await refiningService.create(
        {
          date,
          refinerId: refiner?.id,
          refinerName: refiner?.name,
          sourceItemId: sourceId !== "none" ? Number(sourceId) : undefined,
          scrapType: scrapType || undefined,
          description: description.trim() || scrapType || "Scrap metal",
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
          chargeType: hasCharge ? chargeType : undefined,
          chargeRate: hasCharge ? chargeRate : undefined,
          chargeAmount: hasCharge ? charges.amount : undefined,
          chargeGstPct: hasCharge ? chargeGstPct : undefined,
          chargeGstAmount: hasCharge ? charges.gst : undefined,
          totalCharge: hasCharge ? charges.total : undefined,
          status: "completed",
          createdBy: user?.name,
        },
        { addToStock },
      )
      toast.success(`${rec.refiningNo}: ${wt(inputWt)} → ${wt(calc.recovered)} g pure`)
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

  const filteredHistory = useMemo(() => {
    const q = histSearch.trim().toLowerCase()
    return (history ?? []).filter((r) => {
      const okScrap = histScrap === "all" || r.scrapType === histScrap
      const okText =
        !q || r.refiningNo.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
      return okScrap && okText
    })
  }, [history, histSearch, histScrap])

  const doReverse = async () => {
    if (!reverseTarget?.id) return
    setReversing(true)
    try {
      await refiningService.reverse(reverseTarget.id, { by: user?.name })
      toast.success(`${reverseTarget.refiningNo} reversed — scrap restored, bullion voided`)
      setReverseTarget(null)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setReversing(false)
    }
  }

  // ---- Analytics (computed from job history) ----
  const analytics = useMemo(() => {
    const all = history ?? []
    const jobs = all.filter((r) => r.status !== "reversed")
    const today = todayStr()
    const monthKey = today.slice(0, 7)
    const sum = (arr: Refining[], f: (r: Refining) => number) => arr.reduce((s, r) => s + (f(r) || 0), 0)
    const recoveryOf = (r: Refining) =>
      r.recoveryPct ?? (r.inputWt > 0 ? (r.outputWt / r.inputWt) * 100 : 0)

    const todays = jobs.filter((r) => r.date === today)
    const monthJobs = jobs.filter((r) => r.date.slice(0, 7) === monthKey)

    // Last 6 months of recovered gold.
    const [y, m] = today.split("-").map(Number)
    const monthly: { label: string; recovered: number }[] = []
    for (let i = 5; i >= 0; i--) {
      let mm = m - i
      let yy = y
      while (mm <= 0) {
        mm += 12
        yy -= 1
      }
      const key = `${yy}-${String(mm).padStart(2, "0")}`
      monthly.push({
        label: MONTHS[mm - 1],
        recovered: sum(jobs.filter((r) => r.date.slice(0, 7) === key), (r) => r.outputWt),
      })
    }

    // Recovery trend — most recent ~12 jobs, oldest-first.
    const trend = jobs.slice(0, 12).reverse().map((r) => Math.max(0, Math.min(100, recoveryOf(r))))

    return {
      todayCount: todays.length,
      todayInput: sum(todays, (r) => r.inputWt),
      monthRefined: sum(monthJobs, (r) => r.outputWt),
      totalBullion: jobs.filter((r) => r.bullionNo).length,
      avgRecovery: jobs.length ? sum(jobs, recoveryOf) / jobs.length : 0,
      totalLoss: sum(jobs, (r) => r.lossWt ?? 0),
      totalCharges: sum(jobs, (r) => r.totalCharge ?? 0),
      monthly,
      trend,
      recent: all.slice(0, 6),
      jobCount: jobs.length,
    }
  }, [history])

  const deleteRefiner = async (r: Refiner) => {
    if (!r.id) return
    if (!confirm(`Delete refiner ${r.name}?`)) return
    await refinersService.remove(r.id)
    toast.success(`Deleted ${r.name}`)
  }

  return (
    <>
      <PageHeader
        title="Metal Refining (Ghalai)"
        subtitle="Melt scrap into pure bullion — fineness, loss, recovery and charges are calculated automatically"
      />

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0 overflow-hidden">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="refine">
              <Flame className="size-4" /> Refine
            </TabsTrigger>
            <TabsTrigger value="refiners">
              <Building2 className="size-4" /> Refiners ({refiners.length})
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="size-4" /> Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ============ REFINE TAB ============ */}
        <TabsContent value="refine" className="min-h-0 space-y-4 overflow-auto p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,480px)_1fr]">
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
                  <div className="flex gap-1">
                    <Select value={refinerId} onValueChange={onSelectRefiner}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="In-house" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">In-house / none</SelectItem>
                        {refiners.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name} ({r.kind === "internal" ? "int" : "ext"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setEditRefiner(null)
                        setRefinerDialogOpen(true)
                      }}
                      title="New refiner"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
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
                <Field label="Scrap Type">
                  <Select value={scrapType} onValueChange={setScrapType}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCRAP_TYPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

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

              {/* Charges */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ReceiptIcon className="size-3.5" /> Refining Charges
                </Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Field label="Basis">
                    <Select value={chargeType} onValueChange={(v) => setChargeType(v as ChargeType)}>
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REFINING_CHARGE_TYPES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={`Rate ${chargeUnit && `(${chargeUnit})`}`}>
                    <Input
                      type="number"
                      step="0.01"
                      disabled={!hasCharge}
                      className="tabular text-right"
                      value={chargeRate || ""}
                      onChange={(e) => setChargeRate(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)}
                    />
                  </Field>
                  <Field label="GST %">
                    <Input
                      type="number"
                      step="0.1"
                      disabled={!hasCharge}
                      className="tabular text-right"
                      value={chargeGstPct || ""}
                      onChange={(e) => setChargeGstPct(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)}
                    />
                  </Field>
                </div>
                {chargeType === "percentage" && (
                  <div className="mt-2">
                    <Field label="Charge Base Value (₹)">
                      <Input
                        type="number"
                        step="1"
                        className="tabular text-right"
                        value={chargeBase || ""}
                        onChange={(e) => setChargeBase(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)}
                      />
                    </Field>
                  </div>
                )}
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

            {/* ---- Live summary ---- */}
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
                <Row label="Bullion Number" value={addToStock ? "Auto (BUL…)" : "Not added to stock"} />
                <Row label="Recovery %" value={`${calc.recoveryPct.toFixed(2)}%`} />
              </dl>

              <div className="flex items-center justify-between rounded-lg border border-emerald-300/60 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                <span className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  <Coins className="size-4" /> Recovered Gold
                </span>
                <span className="text-2xl font-bold tabular text-emerald-700 dark:text-emerald-300">
                  {wt(calc.recovered)} <span className="text-base font-medium">g</span>
                </span>
              </div>

              {hasCharge && (
                <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
                  <Row label="Refining Charge" value={`₹${formatAmount(charges.amount)}`} />
                  {charges.gst > 0 && (
                    <Row label={`GST (${chargeGstPct}%)`} value={`₹${formatAmount(charges.gst)}`} />
                  )}
                  <div className="flex items-center justify-between border-t pt-1.5 font-semibold">
                    <span>Total Cost</span>
                    <span className="tabular">₹{formatAmount(charges.total)}</span>
                  </div>
                </div>
              )}

              <Button className="w-full" size="lg" onClick={onRefine} disabled={saving}>
                <Flame className="size-4" /> Refine &amp; Add Bullion
              </Button>
            </section>
          </div>

          {/* ---- History ---- */}
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Refining History
              </span>
              <div className="relative ml-auto w-56">
                <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={histSearch}
                  onChange={(e) => setHistSearch(e.target.value)}
                  placeholder="Search ref no / description"
                  className="h-8 pl-7 text-sm"
                />
              </div>
              <Select value={histScrap} onValueChange={setHistScrap}>
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scrap types</SelectItem>
                  {SCRAP_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="w-24">Ref No</TableHead>
                    <TableHead className="w-24">Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-32">Scrap</TableHead>
                    <TableHead className="w-20 text-right">Input</TableHead>
                    <TableHead className="w-24 text-right">Recovered</TableHead>
                    <TableHead className="w-16 text-right">Rec.%</TableHead>
                    <TableHead className="w-24 text-right">Charge</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                        {(history ?? []).length === 0
                          ? "No refining jobs yet. Melt some scrap to get started."
                          : "No jobs match your filters."}
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredHistory.map((r) => {
                    const rec = r.recoveryPct ?? (r.inputWt > 0 ? round2((r.outputWt / r.inputWt) * 100) : 0)
                    const reversed = r.status === "reversed"
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.refiningNo}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(r.date)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                        <TableCell className="text-muted-foreground">{r.scrapType ?? "—"}</TableCell>
                        <TableCell className="text-right tabular">{wt(r.inputWt)}</TableCell>
                        <TableCell className="text-right font-medium tabular">{wt(r.outputWt)}</TableCell>
                        <TableCell className="text-right tabular">{rec.toFixed(1)}%</TableCell>
                        <TableCell className="text-right tabular text-muted-foreground">
                          {r.totalCharge ? `₹${formatAmount(r.totalCharge)}` : "—"}
                        </TableCell>
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
                        <TableCell>
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground"
                              onClick={() => setDetailTarget(r)}
                              title="View details"
                              aria-label="View refining details"
                            >
                              <Eye className="size-3.5" />
                            </Button>
                            {!reversed && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setReverseTarget(r)}
                                title="Reverse this job"
                                aria-label="Reverse refining job"
                              >
                                <RotateCcw className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </TabsContent>

        {/* ============ REFINERS TAB ============ */}
        <TabsContent value="refiners" className="min-h-0 overflow-auto p-4">
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Refiners
              </span>
              <Button
                size="sm"
                onClick={() => {
                  setEditRefiner(null)
                  setRefinerDialogOpen(true)
                }}
              >
                <Plus className="size-4" /> New Refiner
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead className="w-40">Contact</TableHead>
                  <TableHead>Default Charge</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {refiners.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      No refiners yet. Add your in-house team or an outside refinery.
                    </TableCell>
                  </TableRow>
                )}
                {refiners.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
                          r.kind === "internal"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
                        )}
                      >
                        {r.kind === "internal" ? <User className="size-3" /> : <Building2 className="size-3" />}
                        {r.kind === "internal" ? "Internal" : "External"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.contact ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.chargeType
                        ? `${REFINING_CHARGE_TYPES.find((c) => c.value === r.chargeType)?.label} · ${r.chargeRate}${
                            REFINING_CHARGE_TYPES.find((c) => c.value === r.chargeType)?.unit
                          }${r.gstPct ? ` + ${r.gstPct}% GST` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => {
                            setEditRefiner(r)
                            setRefinerDialogOpen(true)
                          }}
                          aria-label="Edit refiner"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          onClick={() => void deleteRefiner(r)}
                          aria-label="Delete refiner"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ============ ANALYTICS TAB ============ */}
        <TabsContent value="analytics" className="min-h-0 space-y-4 overflow-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi icon={<Flame className="size-4 text-orange-500" />} label="Today's Refining" value={`${analytics.todayCount}`} sub={`${wt(analytics.todayInput)} g input`} />
            <Kpi icon={<Coins className="size-4 text-emerald-600" />} label="This Month Refined" value={`${wt(analytics.monthRefined)} g`} sub="recovered gold" />
            <Kpi icon={<Boxes className="size-4 text-primary" />} label="Bullion Produced" value={`${analytics.totalBullion}`} sub="bars, all time" />
            <Kpi icon={<Percent className="size-4 text-primary" />} label="Avg Recovery" value={`${analytics.avgRecovery.toFixed(2)}%`} sub={`${analytics.jobCount} jobs`} />
            <Kpi icon={<TrendingDown className="size-4 text-orange-500" />} label="Total Refining Loss" value={`${wt(analytics.totalLoss)} g`} sub="all time" tone="loss" />
            <Kpi icon={<IndianRupee className="size-4 text-muted-foreground" />} label="Total Charges" value={`₹${formatAmount(analytics.totalCharges)}`} sub="all time" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="size-4 text-muted-foreground" /> Recovered Gold — last 6 months
              </h3>
              {analytics.jobCount === 0 ? (
                <EmptyChart />
              ) : (
                <MonthlyBars data={analytics.monthly} />
              )}
            </section>

            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="size-4 text-muted-foreground" /> Recovery % trend
              </h3>
              {analytics.trend.length === 0 ? (
                <EmptyChart />
              ) : (
                <TrendBars data={analytics.trend} />
              )}
            </section>
          </div>

          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Refining Jobs
            </div>
            <div className="divide-y">
              {analytics.recent.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">No jobs yet.</div>
              )}
              {analytics.recent.map((r) => {
                const rec = r.recoveryPct ?? (r.inputWt > 0 ? (r.outputWt / r.inputWt) * 100 : 0)
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="font-medium">{r.refiningNo}</span>
                    <span className="text-muted-foreground">{formatDate(r.date)}</span>
                    <span className="ml-auto tabular text-muted-foreground">{wt(r.inputWt)} → {wt(r.outputWt)} g</span>
                    <span className="w-16 text-right tabular">{rec.toFixed(1)}%</span>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => setDetailTarget(r)} aria-label="View details">
                      <Eye className="size-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </section>
        </TabsContent>
      </Tabs>

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
            <ConfirmRow label="Recovered" value={`${wt(calc.recovered)} g · ${outputPurity}`} strong />
            {hasCharge && <ConfirmRow label="Charge (incl. GST)" value={`₹${formatAmount(charges.total)}`} />}
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

      {/* ---- Reverse confirmation ---- */}
      <Dialog open={!!reverseTarget} onOpenChange={(o) => !reversing && !o && setReverseTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse {reverseTarget?.refiningNo}?</DialogTitle>
            <DialogDescription>
              This undoes the job's inventory movements — the melted scrap is restored to
              stock and the produced bullion is voided. The record is kept and marked
              reversed (never deleted). Blocked if the bullion was already sold.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseTarget(null)} disabled={reversing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doReverse()} disabled={reversing}>
              {reversing ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {reversing ? "Reversing…" : "Reverse job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RefinerFormDialog
        open={refinerDialogOpen}
        onOpenChange={setRefinerDialogOpen}
        editRefiner={editRefiner}
        onSaved={(r) => setRefinerId(String(r.id))}
      />

      <RefiningDetailDialog refining={detailTarget} onOpenChange={(o) => !o && setDetailTarget(null)} />
    </>
  )
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  tone?: "loss"
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1.5 text-2xl font-bold tabular", tone === "loss" && "text-orange-600 dark:text-orange-400")}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

function MonthlyBars({ data }: { data: { label: string; recovered: number }[] }) {
  const max = Math.max(...data.map((d) => d.recovered), 1)
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular text-muted-foreground">{d.recovered > 0 ? wt(d.recovered) : ""}</span>
          <div
            className="w-full rounded-t bg-primary/70 transition-all"
            style={{ height: `${Math.max(2, (d.recovered / max) * 100)}%` }}
            title={`${d.label}: ${wt(d.recovered)} g`}
          />
          <span className="text-[11px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function TrendBars({ data }: { data: number[] }) {
  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((pct, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-t transition-all",
            pct >= 90 ? "bg-emerald-500/70" : "bg-amber-500/70",
          )}
          style={{ height: `${Math.max(3, pct)}%` }}
          title={`${pct.toFixed(1)}%`}
        />
      ))}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      No data yet — record a refining job.
    </div>
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
