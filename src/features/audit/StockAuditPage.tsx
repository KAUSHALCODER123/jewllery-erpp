import { useMemo, useRef, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import {
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  Download,
  RotateCcw,
  ClipboardCheck,
} from "lucide-react"
import { toast } from "sonner"
import { itemsService } from "@/services/dbService"
import { wt } from "@/lib/format"
import { toCsv, downloadText } from "@/lib/csv"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * Physical stock audit: scan every tag in the trays; matched items turn green.
 * On Reconcile, anything in the system but not scanned is flagged red (missing
 * / misplaced / stolen). Scans that don't match active stock are flagged too.
 * Read-only — it reports discrepancies without mutating inventory.
 */
export function StockAuditPage() {
  const allItems = useLiveQuery(() => itemsService.getAll(), [], undefined)
  const [scanned, setScanned] = useState<Set<string>>(new Set())
  const [unknown, setUnknown] = useState<string[]>([])
  const [reconciled, setReconciled] = useState(false)
  const [scan, setScan] = useState("")
  const scanRef = useRef<HTMLInputElement>(null)

  const inStock = useMemo(
    () => (allItems ?? []).filter((i) => (i.status ?? "in_stock") === "in_stock"),
    [allItems],
  )
  const tagToItem = useMemo(() => {
    const m = new Map<string, (typeof inStock)[number]>()
    for (const i of inStock) m.set(i.tag, i)
    return m
  }, [inStock])

  const verifiedCount = inStock.filter((i) => scanned.has(i.tag)).length
  const missingCount = inStock.length - verifiedCount

  const handleScan = () => {
    const tag = scan.trim().toUpperCase()
    setScan("")
    scanRef.current?.focus()
    if (!tag) return
    if (tagToItem.has(tag)) {
      if (scanned.has(tag)) {
        toast.info(`${tag} already verified`)
        return
      }
      setScanned((s) => new Set(s).add(tag))
      toast.success(`✓ ${tag} verified`)
    } else {
      // Either a sold/melted item, or a foreign tag — flag it.
      if (!unknown.includes(tag)) setUnknown((u) => [tag, ...u])
      toast.warning(`⚠ ${tag} not in active stock`)
    }
  }

  const reset = () => {
    setScanned(new Set())
    setUnknown([])
    setReconciled(false)
    setScan("")
    scanRef.current?.focus()
  }

  const exportMissing = () => {
    const missing = inStock.filter((i) => !scanned.has(i.tag))
    const csv = toCsv(
      ["Tag", "Name", "Category", "Purity", "GrossWt", "NetWt", "HUID"],
      missing.map((i) => [
        i.tag,
        i.name,
        i.category ?? "",
        i.purity,
        i.grossWt,
        i.netWt,
        i.huid ?? "",
      ]),
    )
    downloadText("stock-audit-missing.csv", csv)
  }

  return (
    <>
      <PageHeader
        title="Physical Stock Audit"
        subtitle="Scan every tag in the trays, then reconcile against the system"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReconciled(true)}
              disabled={inStock.length === 0}
            >
              <ClipboardCheck className="size-4" /> Reconcile
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="size-4" /> Reset
            </Button>
          </div>
        }
      />

      {/* Scan bar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="relative w-80">
          <ScanLine className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={scanRef}
            value={scan}
            autoFocus
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleScan()
              }
            }}
            placeholder="Scan a tag and press Enter…"
            className="pl-8 uppercase"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleScan}>
          Verify
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <Stat label="Expected (in stock)" value={inStock.length} tone="text-foreground" />
        <Stat label="Verified" value={verifiedCount} tone="text-emerald-600" />
        <Stat
          label="Missing"
          value={missingCount}
          tone={missingCount > 0 ? "text-destructive" : "text-muted-foreground"}
        />
        <Stat
          label="Unknown scans"
          value={unknown.length}
          tone={unknown.length > 0 ? "text-amber-600" : "text-muted-foreground"}
        />
      </div>

      <div className="flex items-center justify-between px-4 pb-2">
        <p className="text-xs text-muted-foreground">
          {reconciled
            ? "Reconciled — unscanned items are flagged red below."
            : "Green = verified. Scan all trays, then click Reconcile."}
        </p>
        {reconciled && missingCount > 0 && (
          <Button variant="outline" size="sm" onClick={exportMissing}>
            <Download className="size-4" /> Export Missing ({missingCount})
          </Button>
        )}
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-28">Tag</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Category</TableHead>
              <TableHead className="w-24">Purity</TableHead>
              <TableHead className="w-20 text-right">Net Wt</TableHead>
              <TableHead className="w-28">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Unknown scans first (always flagged) */}
            {unknown.map((tag) => (
              <TableRow key={`u-${tag}`} className="bg-amber-50">
                <TableCell className="font-medium">{tag}</TableCell>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Scanned but not in active stock (sold, melted, or foreign tag)
                </TableCell>
                <TableCell>
                  <Badge tone="bg-amber-100 text-amber-800" icon={<AlertTriangle className="size-3" />}>
                    Unknown
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {inStock.map((i) => {
              const ok = scanned.has(i.tag)
              return (
                <TableRow
                  key={i.id}
                  className={cn(
                    ok && "bg-emerald-50",
                    !ok && reconciled && "bg-destructive/5",
                  )}
                >
                  <TableCell className="font-medium">{i.tag}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{i.name}</TableCell>
                  <TableCell className="text-muted-foreground">{i.category}</TableCell>
                  <TableCell className="text-muted-foreground">{i.purity}</TableCell>
                  <TableCell className="text-right tabular">{wt(i.netWt)}</TableCell>
                  <TableCell>
                    {ok ? (
                      <Badge tone="bg-emerald-100 text-emerald-800" icon={<CheckCircle2 className="size-3" />}>
                        Verified
                      </Badge>
                    ) : reconciled ? (
                      <Badge tone="bg-destructive/15 text-destructive" icon={<AlertTriangle className="size-3" />}>
                        Missing
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {inStock.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No in-stock items to audit.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular", tone)}>{value}</div>
    </div>
  )
}

function Badge({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode
  tone: string
  icon: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
        tone,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
