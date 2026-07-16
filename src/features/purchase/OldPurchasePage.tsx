import { useState } from "react"
import { Plus, Trash2, Recycle } from "lucide-react"
import { toast } from "sonner"
import type { MetalType, PaymentMode } from "@/db/types"
import { operationsService, todayStr } from "@/services/dbService"
import { useSession } from "@/stores/useSession"
import { METAL_TYPES, PURITY_OPTIONS } from "@/lib/constants"
import { formatAmount, wt } from "@/lib/format"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NumCell, TextCell } from "@/features/pos/GridCells"

interface Row {
  id: string
  description: string
  type: MetalType
  grossWt: number
  lessWt: number
  purity: string
  rate: number
}

const rid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r${Date.now()}${Math.floor(Math.random() * 1e6)}`
const r2 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(2))
const r3 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(3))

/** Fineness % from "22K (916)" / "916" / "91.6". */
const finePct = (purity: string): number => {
  const paren = purity.match(/\((\d{3})\)/)
  if (paren) return Number(paren[1]) / 10
  const k = purity.match(/(\d{1,2})\s*K/i)
  if (k) return (Number(k[1]) / 24) * 100
  const n = Number(purity)
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 0
}

const newRow = (): Row => ({ id: rid(), description: "", type: "gold", grossWt: 0, lessWt: 0, purity: "22K (916)", rate: 0 })
const rowNet = (r: Row) => Math.max(0, r3(r.grossWt - r.lessWt))
const rowFine = (r: Row) => r3((rowNet(r) * finePct(r.purity)) / 100)
const rowAmount = (r: Row) => r2(rowFine(r) * r.rate)

/**
 * Pure old-gold purchase: a customer sells scrap for cash (no sale). Adds the metal
 * to loose stock and pays cash out — logged in the Day Book so the drawer balances.
 */
export function OldPurchasePage() {
  const user = useSession((s) => s.user)
  const [date, setDate] = useState(todayStr())
  const [party, setParty] = useState("")
  const [mode, setMode] = useState<Exclude<PaymentMode, "credit">>("cash")
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [saving, setSaving] = useState(false)

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const total = r2(rows.reduce((s, r) => s + rowAmount(r), 0))
  const totalFine = r3(rows.reduce((s, r) => s + rowFine(r), 0))

  const save = async () => {
    const lines = rows.filter((r) => r.grossWt > 0)
    if (!lines.length) return toast.error("Add at least one scrap line")
    setSaving(true)
    try {
      const res = await operationsService.buyOldGold({
        date,
        party: party.trim() || undefined,
        mode,
        createdBy: user?.name,
        lines: lines.map((r) => ({ description: r.description || "Old gold", type: r.type, netWt: rowNet(r), purity: r.purity, fineWt: rowFine(r), rate: r.rate, amount: rowAmount(r) })),
      })
      toast.success(`Bought old gold · ${res.voucherNo} · paid ₹${formatAmount(res.total)}`)
      setRows([newRow()])
      setParty("")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Old Gold Purchase" subtitle="Buy scrap for cash — adds to loose stock, pays cash out (Day Book)" />
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input type="date" max={todayStr()} value={date} onChange={(e) => setDate(e.target.value || todayStr())} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Customer / party (optional)</Label>
            <Input value={party} onChange={(e) => setParty(e.target.value)} placeholder="Walk-in seller name" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pay by</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["cash", "upi", "cheque"].map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                <th>Description</th>
                <th className="w-24">Metal</th>
                <th className="w-20 text-right">Gross (g)</th>
                <th className="w-20 text-right">Less (g)</th>
                <th className="w-20 text-right">Net (g)</th>
                <th className="w-28">Purity</th>
                <th className="w-20 text-right">Fine (g)</th>
                <th className="w-24 text-right">Rate/g</th>
                <th className="w-28 text-right">Amount ₹</th>
                <th className="w-7" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t [&>td]:px-1 [&>td]:py-0.5">
                  <td><TextCell value={r.description} onChange={(v) => update(r.id, { description: v })} placeholder="e.g. Old chain" /></td>
                  <td>
                    <Select value={r.type} onValueChange={(v) => update(r.id, { type: v as MetalType, purity: (PURITY_OPTIONS[v as MetalType] ?? PURITY_OPTIONS.gold)[0] })}>
                      <SelectTrigger size="sm" className="h-8 w-full border-0 shadow-none"><SelectValue /></SelectTrigger>
                      <SelectContent>{METAL_TYPES.filter((m) => m.value === "gold" || m.value === "silver").map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td><NumCell value={r.grossWt} onChange={(v) => update(r.id, { grossWt: v })} /></td>
                  <td><NumCell value={r.lessWt} onChange={(v) => update(r.id, { lessWt: v })} /></td>
                  <td className="px-2 text-right tabular text-muted-foreground">{wt(rowNet(r))}</td>
                  <td>
                    <Select value={r.purity} onValueChange={(v) => update(r.id, { purity: v })}>
                      <SelectTrigger size="sm" className="h-8 w-full border-0 shadow-none"><SelectValue /></SelectTrigger>
                      <SelectContent>{(PURITY_OPTIONS[r.type] ?? PURITY_OPTIONS.gold).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 text-right tabular text-muted-foreground">{wt(rowFine(r))}</td>
                  <td><NumCell value={r.rate} step={1} onChange={(v) => update(r.id, { rate: v })} /></td>
                  <td className="px-2 text-right font-medium tabular">{formatAmount(rowAmount(r))}</td>
                  <td>
                    <button onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove row">
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
            <Plus className="size-4" /> Row
          </Button>
          <div className="ml-auto flex items-center gap-6 text-sm">
            <span className="text-muted-foreground">Fine <b className="text-foreground">{wt(totalFine)} g</b></span>
            <span className="text-muted-foreground">Cash out <b className="text-destructive">₹{formatAmount(total)}</b></span>
            <Button onClick={() => void save()} disabled={saving || total <= 0}>
              <Recycle className="size-4" /> Buy &amp; Pay Cash
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
