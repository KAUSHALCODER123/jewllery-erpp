import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2, Scale } from "lucide-react"
import { toast } from "sonner"
import type { Item } from "@/db/types"
import { itemsService } from "@/services/dbService"
import { useLiveData } from "@/db/useLiveData"
import { CATEGORIES, categoryByLabel, PURITY_OPTIONS } from "@/lib/constants"
import { wt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"
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
import { NumCell, TextCell } from "@/features/pos/GridCells"

interface Piece {
  id: string
  category: string
  purity: string
  grossWt: number
  stoneWt: number
  makingPerGm: number
  huid: string
}

const rid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p${Date.now()}${Math.floor(Math.random() * 1e6)}`

const round3 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(3))
const pieceNet = (p: Piece) => Math.max(0, round3(p.grossWt - p.stoneWt))

const newPiece = (): Piece => ({
  id: rid(),
  category: "Ring",
  purity: "22K (916)",
  grossWt: 0,
  stoneWt: 0,
  makingPerGm: 0,
  huid: "",
})

/**
 * Tag finished gold pieces out of a loose (bulk) gold pool — "buy by weight, tag
 * later". Each piece mints a barcode and its net weight is drawn down from the
 * chosen loose category, so the metal tally reclassifies the weight without
 * double-counting.
 */
export function TagFromLooseDialog({
  open,
  onOpenChange,
  onTagged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onTagged: (items: Item[]) => void
}) {
  const user = useSession((s) => s.user)
  const balances = useLiveData(() => itemsService.goldLooseBalances(), [], [])
  const [source, setSource] = useState("")
  const [pieces, setPieces] = useState<Piece[]>([newPiece()])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setPieces([newPiece()])
    setSaving(false)
  }, [open])

  // Default the source to the largest loose pool once balances load.
  useEffect(() => {
    if (open && !source && balances.length) setSource(balances[0].category)
  }, [open, source, balances])

  const available = useMemo(
    () => balances.find((b) => b.category === source)?.weight ?? 0,
    [balances, source],
  )
  const totalNet = round3(pieces.reduce((s, p) => s + pieceNet(p), 0))
  const remaining = round3(available - totalNet)

  const update = (id: string, patch: Partial<Piece>) =>
    setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const save = async () => {
    if (!source) return toast.error("Pick the loose gold pool to tag from")
    const rows = pieces.filter((p) => p.grossWt > 0)
    if (!rows.length) return toast.error("Add at least one piece")
    if (remaining < -0.0005)
      return toast.error(`Pieces (${wt(totalNet)} g) exceed available loose gold (${wt(available)} g)`)
    setSaving(true)
    try {
      const { tags } = await itemsService.tagFromLooseGold({
        sourceCategory: source,
        user: user?.name,
        pieces: rows.map((p) => ({
          tagPrefix: categoryByLabel(p.category)?.prefix ?? "ITM",
          category: p.category,
          name: p.category,
          purity: p.purity,
          grossWt: p.grossWt,
          stoneWt: p.stoneWt || undefined,
          makingChargePerGm: p.makingPerGm || undefined,
          huid: p.huid.trim() || undefined,
        })),
      })
      const created = (await Promise.all(tags.map((t) => itemsService.getByTag(t)))).filter(
        (i): i is Item => !!i,
      )
      toast.success(`Tagged ${tags.length} piece(s) · ${wt(totalNet)} g drawn from ${source}`)
      onOpenChange(false)
      onTagged(created)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="size-4" /> Tag Gold From Weight
          </DialogTitle>
          <DialogDescription>
            Turn bulk/loose gold into individually tagged pieces. Each piece gets a barcode and its
            net weight is drawn down from the chosen loose pool.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Source pool */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Loose gold pool</Label>
              {balances.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No loose gold in stock. Buy gold by weight in Purchase first (leave a row un-ticked
                  from Stock), then tag it here.
                </p>
              ) : (
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="w-56" size="sm">
                    <SelectValue placeholder="Select pool" />
                  </SelectTrigger>
                  <SelectContent>
                    {balances.map((b) => (
                      <SelectItem key={b.category} value={b.category}>
                        {b.category} · {wt(b.weight)} g
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="ml-auto flex gap-4 text-sm">
              <Stat label="Available" value={`${wt(available)} g`} />
              <Stat label="Tagging" value={`${wt(totalNet)} g`} />
              <Stat
                label="Remaining"
                value={`${wt(remaining)} g`}
                tone={remaining < -0.0005 ? "bad" : "ok"}
              />
            </div>
          </div>

          {/* Pieces grid */}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
                  <th className="w-32">Category</th>
                  <th className="w-28">Purity</th>
                  <th className="w-20 text-right">Gross (g)</th>
                  <th className="w-20 text-right">Stone (g)</th>
                  <th className="w-20 text-right">Net (g)</th>
                  <th className="w-24 text-right">Making/g</th>
                  <th className="w-28">HUID</th>
                  <th className="w-7" />
                </tr>
              </thead>
              <tbody>
                {pieces.map((p) => (
                  <tr key={p.id} className="border-t [&>td]:px-1 [&>td]:py-0.5">
                    <td>
                      <Select
                        value={p.category}
                        onValueChange={(v) => update(p.id, { category: v })}
                      >
                        <SelectTrigger size="sm" className="h-8 w-full border-0 shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.filter((c) => c.defaultType === "gold").map((c) => (
                            <SelectItem key={c.prefix} value={c.label}>
                              {c.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="Nathani">Nathani</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td>
                      <Select value={p.purity} onValueChange={(v) => update(p.id, { purity: v })}>
                        <SelectTrigger size="sm" className="h-8 w-full border-0 shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PURITY_OPTIONS.gold.map((q) => (
                            <SelectItem key={q} value={q}>
                              {q}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td>
                      <NumCell value={p.grossWt} onChange={(v) => update(p.id, { grossWt: v })} />
                    </td>
                    <td>
                      <NumCell value={p.stoneWt} onChange={(v) => update(p.id, { stoneWt: v })} />
                    </td>
                    <td className="px-2 text-right tabular text-muted-foreground">{wt(pieceNet(p))}</td>
                    <td>
                      <NumCell value={p.makingPerGm} step={1} onChange={(v) => update(p.id, { makingPerGm: v })} />
                    </td>
                    <td>
                      <TextCell value={p.huid} onChange={(v) => update(p.id, { huid: v })} placeholder="HUID" />
                    </td>
                    <td>
                      <button
                        onClick={() => setPieces((ps) => (ps.length > 1 ? ps.filter((x) => x.id !== p.id) : ps))}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remove piece"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPieces((ps) => [...ps, newPiece()])}>
            <Plus className="size-4" /> Add piece
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || balances.length === 0 || remaining < -0.0005}
          >
            Tag &amp; Print Labels
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={cn("font-semibold tabular", tone === "bad" && "text-destructive")}>{value}</p>
    </div>
  )
}
