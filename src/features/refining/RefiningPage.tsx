import { useEffect, useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Flame } from "lucide-react"
import { toast } from "sonner"
import type { MetalType } from "@/db/types"
import { itemsService, refiningService, todayStr } from "@/services/dbService"
import { METAL_TYPES } from "@/lib/constants"
import { formatDate, wt } from "@/lib/format"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** Best-effort fineness % from a purity label like "22K (916)" or "18K". */
function purityToFinePct(purity: string): number {
  const paren = purity.match(/\((\d{3})\)/)
  if (paren) return Number((Number(paren[1]) / 10).toFixed(2)) // 916 -> 91.6
  const karat = purity.match(/(\d{1,2})\s*K/i)
  if (karat) return Number(((Number(karat[1]) / 24) * 100).toFixed(2))
  const num = Number(purity)
  return Number.isFinite(num) && num > 0 && num <= 100 ? num : 91.6
}

export function RefiningPage() {
  const inStock = useLiveQuery(() => itemsService.getInStock(), [], [])
  const history = useLiveQuery(() => refiningService.getAll(), [], [])

  const [date, setDate] = useState(todayStr())
  const [refinerName, setRefinerName] = useState("")
  const [sourceId, setSourceId] = useState("none")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<MetalType>("gold")
  const [inputWt, setInputWt] = useState(0)
  const [finePct, setFinePct] = useState(91.6)
  const [lossPct, setLossPct] = useState(0)
  const [outputPurity, setOutputPurity] = useState("24K (999)")
  const [outputWt, setOutputWt] = useState(0)
  const [addToStock, setAddToStock] = useState(true)
  const [manualOutput, setManualOutput] = useState(false)

  const computedOutput = useMemo(
    () => Number((inputWt * (finePct / 100) * (1 - lossPct / 100)).toFixed(3)),
    [inputWt, finePct, lossPct],
  )

  // Keep output following the computed value until the user overrides it.
  useEffect(() => {
    if (!manualOutput) setOutputWt(computedOutput)
  }, [computedOutput, manualOutput])

  const onSource = (val: string) => {
    setSourceId(val)
    if (val === "none") return
    const item = inStock.find((i) => String(i.id) === val)
    if (item) {
      setDescription(item.name)
      setType(item.type)
      setInputWt(item.grossWt)
      setFinePct(purityToFinePct(item.purity))
      setManualOutput(false)
    }
  }

  const save = async () => {
    if (inputWt <= 0) return toast.error("Enter the input weight")
    if (outputWt <= 0) return toast.error("Enter the output weight")
    try {
      const rec = await refiningService.create(
        {
          date,
          refinerName: refinerName.trim() || undefined,
          sourceItemId: sourceId !== "none" ? Number(sourceId) : undefined,
          description: description.trim() || "Scrap metal",
          type,
          inputWt,
          inputFinePct: finePct,
          refiningLossPct: lossPct,
          outputWt,
          outputPurity,
        },
        { addToStock },
      )
      toast.success(
        `${rec.refiningNo}: ${wt(inputWt)} → ${wt(outputWt)} pure${addToStock ? " · added to stock" : ""}`,
      )
      // Reset for the next job.
      setSourceId("none")
      setDescription("")
      setInputWt(0)
      setLossPct(0)
      setManualOutput(false)
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    }
  }

  return (
    <>
      <PageHeader
        title="Metal Refining (Ghalai)"
        subtitle="Melt scrap / old metal into pure bullion and update stock"
      />
      <div className="flex min-h-0 flex-1">
        {/* Form */}
        <div className="w-96 shrink-0 space-y-3 overflow-auto border-r p-4">
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
                className="tabular text-right"
                value={inputWt || ""}
                onChange={(e) => setInputWt(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Input Fineness %">
              <Input
                type="number"
                step="0.1"
                className="tabular text-right"
                value={finePct || ""}
                onChange={(e) => setFinePct(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)}
              />
            </Field>
            <Field label="Refining Loss %">
              <Input
                type="number"
                step="0.1"
                className="tabular text-right"
                value={lossPct || ""}
                onChange={(e) => setLossPct(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Output Purity">
              <Input value={outputPurity} onChange={(e) => setOutputPurity(e.target.value)} />
            </Field>
            <Field label="Output Wt (g)">
              <Input
                type="number"
                step="0.001"
                className="tabular text-right"
                value={outputWt || ""}
                onChange={(e) => {
                  setManualOutput(true)
                  setOutputWt(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }}
              />
            </Field>
          </div>

          <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            Pure content: <span className="font-medium">{wt(inputWt * (finePct / 100))} g</span>
            {" · "}after loss:{" "}
            <span className="font-medium">{wt(computedOutput)} g</span>
            {manualOutput && (
              <button
                className="ml-2 text-primary hover:underline"
                onClick={() => setManualOutput(false)}
              >
                use computed
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addToStock}
              onChange={(e) => setAddToStock(e.target.checked)}
            />
            Add refined bullion to stock
          </label>

          <Button className="w-full" onClick={() => void save()}>
            <Flame className="size-4" /> Refine
          </Button>
        </div>

        {/* History */}
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="border-b px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Refining History
          </div>
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="w-24">No</TableHead>
                <TableHead className="w-24">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24 text-right">Input</TableHead>
                <TableHead className="w-16 text-right">Fine%</TableHead>
                <TableHead className="w-16 text-right">Loss%</TableHead>
                <TableHead className="w-24 text-right">Output</TableHead>
                <TableHead className="w-24">Purity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No refining jobs yet.
                  </TableCell>
                </TableRow>
              )}
              {(history ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.refiningNo}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.date)}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.description}</TableCell>
                  <TableCell className="text-right tabular">{wt(r.inputWt)}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{r.inputFinePct}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{r.refiningLossPct}</TableCell>
                  <TableCell className="text-right font-medium tabular">{wt(r.outputWt)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.outputPurity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
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
