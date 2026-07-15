import { useState } from "react"
import { Coins, Gem } from "lucide-react"
import { useLiveData } from "@/db/useLiveData"
import { ledgerService, todayStr } from "@/services/dbService"
import type { MetalTallyGroup } from "@/db/types"
import { wt, formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/PageHeader"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const METAL_LABEL: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  other: "Other",
}

export function MetalTallyPage() {
  const [date, setDate] = useState(todayStr())
  const tally = useLiveData(() => ledgerService.metalTally(date), [date], undefined)
  const groups = tally?.groups ?? []

  return (
    <>
      <PageHeader
        title="Daily Metal Tally"
        subtitle="Weight in / out / closing per metal & category — silver and loose gold by weight"
        actions={
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input
              type="date"
              max={todayStr()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 w-40"
            />
          </div>
        }
      />

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-muted-foreground">
            <Coins className="size-10 opacity-40" />
            <p className="text-sm">No metal movement recorded up to {date}.</p>
            <p className="text-xs">Sales, purchases and old-gold intake feed this tally.</p>
          </div>
        ) : (
          groups.map((g) => <MetalCard key={g.metal} g={g} />)
        )}
      </div>
    </>
  )
}

function MetalCard({ g }: { g: MetalTallyGroup }) {
  const isSilver = g.metal === "silver"
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold",
          isSilver ? "text-slate-500" : "text-amber-600",
        )}
      >
        {isSilver ? <Coins className="size-4" /> : <Gem className="size-4" />}
        {METAL_LABEL[g.metal] ?? g.metal}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          Closing <b className="text-foreground">{wt(g.closing)} g</b>
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Opening (g)</TableHead>
              <TableHead className="text-right">In (g)</TableHead>
              <TableHead className="text-right">Out (g)</TableHead>
              <TableHead className="text-right">Closing (g)</TableHead>
              <TableHead className="text-right">In ₹</TableHead>
              <TableHead className="text-right">Out ₹</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {g.categories.map((c) => (
              <TableRow key={c.category}>
                <TableCell className="font-medium">{c.category}</TableCell>
                <TableCell className="text-right tabular text-muted-foreground">{wt(c.opening)}</TableCell>
                <TableCell className="text-right tabular text-emerald-600">{c.inWt ? `+${wt(c.inWt)}` : "—"}</TableCell>
                <TableCell className="text-right tabular text-destructive">{c.outWt ? `−${wt(c.outWt)}` : "—"}</TableCell>
                <TableCell className="text-right tabular font-medium">{wt(c.closing)}</TableCell>
                <TableCell className="text-right tabular text-muted-foreground">{c.inValue ? formatAmount(c.inValue) : "—"}</TableCell>
                <TableCell className="text-right tabular text-muted-foreground">{c.outValue ? formatAmount(c.outValue) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell>Total {METAL_LABEL[g.metal] ?? g.metal}</TableCell>
              <TableCell className="text-right tabular">{wt(g.opening)}</TableCell>
              <TableCell className="text-right tabular text-emerald-600">{g.inWt ? `+${wt(g.inWt)}` : "—"}</TableCell>
              <TableCell className="text-right tabular text-destructive">{g.outWt ? `−${wt(g.outWt)}` : "—"}</TableCell>
              <TableCell className="text-right tabular">{wt(g.closing)}</TableCell>
              <TableCell className="text-right tabular">{g.inValue ? formatAmount(g.inValue) : "—"}</TableCell>
              <TableCell className="text-right tabular">{g.outValue ? formatAmount(g.outValue) : "—"}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}
