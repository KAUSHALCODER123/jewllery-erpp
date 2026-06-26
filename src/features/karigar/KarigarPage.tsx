import { useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Plus, Hammer, ArrowDownToLine, UserPlus } from "lucide-react"
import { toast } from "sonner"
import type { Karigar, KarigarJob } from "@/db/types"
import { karigarsService, ordersService, todayStr } from "@/services/dbService"
import { wt } from "@/lib/format"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

const JOB_STATUS: Record<string, { label: string; tone: string }> = {
  issued: { label: "Issued", tone: "bg-amber-100 text-amber-800" },
  received: { label: "Received", tone: "bg-emerald-100 text-emerald-800" },
  closed: { label: "Closed", tone: "bg-muted text-muted-foreground" },
}

export function KarigarPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [receiving, setReceiving] = useState<KarigarJob | null>(null)

  const karigars = useLiveQuery(() => karigarsService.getAll(), [], undefined)
  const jobs = useLiveQuery(() => karigarsService.getJobs(), [], [])
  const karigarName = useMemo(() => {
    const m = new Map<number, string>()
    for (const k of karigars ?? []) m.set(k.id!, k.name)
    return m
  }, [karigars])

  return (
    <>
      <PageHeader
        title="Karigar — Goldsmith Tracker"
        subtitle={`${(karigars ?? []).length} karigars · ${jobs.filter((j) => j.status === "issued").length} open jobs`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="size-4" /> New Karigar
            </Button>
            <Button
              size="sm"
              onClick={() => setIssueOpen(true)}
              disabled={!karigars || karigars.length === 0}
            >
              <Plus className="size-4" /> Issue Metal
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        {karigars && karigars.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <Hammer className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No karigars yet. Add one to start issuing metal.
            </p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="size-4" /> New Karigar
            </Button>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {/* Karigar ledger balances */}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Metal Ledger
              </h2>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karigar</TableHead>
                      <TableHead className="w-32">Mobile</TableHead>
                      <TableHead className="w-40 text-right">
                        Metal Balance (g)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(karigars ?? []).map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="font-medium">{k.name}</TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {k.mobile ?? "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium tabular",
                            k.metalBalanceWt > 0.001 && "text-destructive",
                            k.metalBalanceWt < -0.001 && "text-emerald-600",
                          )}
                        >
                          {wt(k.metalBalanceWt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Positive balance = metal the karigar still owes the shop.
              </p>
            </section>

            {/* Jobs */}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Jobs
              </h2>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Job No</TableHead>
                      <TableHead>Karigar</TableHead>
                      <TableHead>Work</TableHead>
                      <TableHead className="w-24">Issued</TableHead>
                      <TableHead className="w-24 text-right">Issued Wt</TableHead>
                      <TableHead className="w-24 text-right">Finished Wt</TableHead>
                      <TableHead className="w-20 text-right">Wastage</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No jobs yet. Issue metal to a karigar.
                        </TableCell>
                      </TableRow>
                    )}
                    {jobs.map((j) => {
                      const st = JOB_STATUS[j.status]
                      return (
                        <TableRow key={j.id}>
                          <TableCell className="font-medium">{j.jobNo}</TableCell>
                          <TableCell>{karigarName.get(j.karigarId) ?? "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground">
                            {j.description ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(j.issuedDate)}
                          </TableCell>
                          <TableCell className="text-right tabular">
                            {wt(j.metalIssuedWt)}
                          </TableCell>
                          <TableCell className="text-right tabular">
                            {j.finishedWt ? wt(j.finishedWt) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular">
                            {j.status === "issued" ? "—" : `${j.wastageAllowed}%`}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px] font-medium",
                                st.tone,
                              )}
                            >
                              {st.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            {j.status === "issued" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReceiving(j)}
                              >
                                <ArrowDownToLine className="size-4" /> Receive
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </div>

      <AddKarigarDialog open={addOpen} onOpenChange={setAddOpen} />
      <IssueJobDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        karigars={karigars ?? []}
      />
      {receiving && (
        <ReceiveJobDialog job={receiving} onDone={() => setReceiving(null)} />
      )}
    </>
  )
}

function AddKarigarDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [name, setName] = useState("")
  const [mobile, setMobile] = useState("")

  const save = async () => {
    if (!name.trim()) return toast.error("Enter karigar name")
    await karigarsService.add({ name: name.trim(), mobile: mobile.trim() || undefined })
    toast.success(`Added karigar ${name}`)
    setName("")
    setMobile("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Karigar</DialogTitle>
          <DialogDescription>Add a goldsmith to the ledger.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Label className="text-xs text-muted-foreground">Mobile</Label>
          <Input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IssueJobDialog({
  open,
  onOpenChange,
  karigars,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  karigars: Karigar[]
}) {
  const [karigarId, setKarigarId] = useState<string>("")
  const [date, setDate] = useState(todayStr())
  const [metalWt, setMetalWt] = useState(0)
  const [wastage, setWastage] = useState(0)
  const [description, setDescription] = useState("")
  const [orderId, setOrderId] = useState<string>("none")
  const openOrders = useLiveQuery(() => ordersService.getOpen(), [], [])

  const save = async () => {
    if (!karigarId) return toast.error("Select a karigar")
    if (metalWt <= 0) return toast.error("Enter metal weight issued")
    await karigarsService.issueJob({
      karigarId: Number(karigarId),
      issuedDate: date,
      metalIssuedWt: metalWt,
      wastageAllowed: wastage,
      description: description.trim() || undefined,
      orderId: orderId !== "none" ? Number(orderId) : undefined,
    })
    toast.success("Metal issued")
    setKarigarId("")
    setMetalWt(0)
    setWastage(0)
    setDescription("")
    setOrderId("none")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue Metal to Karigar</DialogTitle>
          <DialogDescription>
            Debits the karigar's metal ledger by the issued weight.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Karigar</Label>
          <Select value={karigarId} onValueChange={setKarigarId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select karigar" />
            </SelectTrigger>
            <SelectContent>
              {karigars.map((k) => (
                <SelectItem key={k.id} value={String(k.id)}>
                  {k.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Metal Issued (g)
              </Label>
              <Input
                type="number"
                step="0.001"
                className="tabular text-right"
                value={metalWt || ""}
                onChange={(e) =>
                  setMetalWt(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }
              />
            </div>
          </div>
          <Label className="text-xs text-muted-foreground">
            Planned Wastage Allowed (%)
          </Label>
          <Input
            type="number"
            step="0.1"
            className="tabular text-right"
            value={wastage || ""}
            onChange={(e) =>
              setWastage(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
            }
          />
          <Label className="text-xs text-muted-foreground">
            Against Order (optional)
          </Label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No order</SelectItem>
              {openOrders.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.orderNo} ·{" "}
                  {o.items.map((i) => i.description).filter(Boolean)[0] ?? "order"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="text-xs text-muted-foreground">Work / Item</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. 4 gold rings"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Issue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReceiveJobDialog({
  job,
  onDone,
}: {
  job: KarigarJob
  onDone: () => void
}) {
  const [finishedWt, setFinishedWt] = useState(0)
  const [wastage, setWastage] = useState(job.wastageAllowed)

  const wastageWt = (job.metalIssuedWt * wastage) / 100
  const credited = finishedWt + wastageWt
  const remaining = Number((job.metalIssuedWt - credited).toFixed(3))

  const save = async () => {
    if (finishedWt <= 0) return toast.error("Enter finished weight")
    await karigarsService.receiveJob(job.id!, finishedWt, wastage)
    toast.success(`Job ${job.jobNo} received`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Finished Item — {job.jobNo}</DialogTitle>
          <DialogDescription>
            Credits the ledger by finished weight + allowed wastage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Metal Issued</span>
            <span className="tabular">{wt(job.metalIssuedWt)} g</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">
                Finished Wt (g)
              </Label>
              <Input
                type="number"
                step="0.001"
                className="tabular text-right"
                value={finishedWt || ""}
                onChange={(e) =>
                  setFinishedWt(
                    e.target.value === "" ? 0 : e.target.valueAsNumber || 0,
                  )
                }
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Wastage (%)</Label>
              <Input
                type="number"
                step="0.1"
                className="tabular text-right"
                value={wastage || ""}
                onChange={(e) =>
                  setWastage(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)
                }
              />
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Wastage weight</span>
              <span className="tabular">{wt(wastageWt)} g</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Credited (finished + wastage)</span>
              <span className="tabular">{wt(credited)} g</span>
            </div>
            <div className="mt-1 flex justify-between border-t pt-1 font-medium">
              <span>Unreconciled balance</span>
              <span
                className={cn(
                  "tabular",
                  Math.abs(remaining) > 0.001 ? "text-destructive" : "text-emerald-600",
                )}
              >
                {wt(remaining)} g
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Receive</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
