import { useMemo, useState } from "react"
import { toast } from "sonner"
import { RotateCcw } from "lucide-react"
import type { PaymentMode, ReturnDisposition, SalesInvoice, SalesItem } from "@/db/types"
import { customersService, salesReturnsService, salesService, todayStr } from "@/services/dbService"
import { useLiveData } from "@/db/useLiveData"
import { useSession } from "@/stores/useSession"
import { formatAmount } from "@/lib/format"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const REASONS = ["Customer exchange", "Size/design issue", "Quality issue", "Billing correction", "Other"]

export function SalesReturnsPage() {
  const user = useSession((s) => s.user)
  const invoices = useLiveData(() => salesService.getInvoices(), [], [])
  const returns = useLiveData(() => salesReturnsService.getAll(), [], [])
  const customers = useLiveData(() => customersService.getAll(), [], [])
  const names = useMemo(() => new Map(customers.map((c) => [c.id!, c.name])), [customers])
  const [query, setQuery] = useState("")
  const [target, setTarget] = useState<SalesInvoice | null>(null)
  const filtered = invoices.filter((i) => `${i.invoiceNo} ${names.get(i.customerId) ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  return <>
    <PageHeader title="Sales Returns / Credit Notes" subtitle="Return sold items without changing the original invoice" />
    <div className="flex-1 space-y-4 overflow-auto p-4">
      <Input className="max-w-sm" placeholder="Search invoice or customer…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-28" /></TableRow></TableHeader><TableBody>
        {filtered.map((i) => <TableRow key={i.id}><TableCell className="font-medium">{i.invoiceNo}</TableCell><TableCell>{i.date}</TableCell><TableCell>{names.get(i.customerId) ?? "—"}</TableCell><TableCell className="text-right">₹{formatAmount(i.netAmount)}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => setTarget(i)}><RotateCcw className="mr-1 size-3.5" />Return</Button></TableCell></TableRow>)}
      </TableBody></Table></div>
      <section><h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Credit-note history</h2><div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Credit Note</TableHead><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Customer Credit</TableHead></TableRow></TableHeader><TableBody>{returns.map((r) => <TableRow key={r.id}><TableCell className="font-medium">{r.returnNo}</TableCell><TableCell>{invoices.find((i) => i.id === r.invoiceId)?.invoiceNo ?? r.invoiceId}</TableCell><TableCell>{r.date}</TableCell><TableCell>{r.reason}</TableCell><TableCell className="text-right">₹{formatAmount(r.totalAmount)}</TableCell><TableCell className="text-right">₹{formatAmount(r.customerCredit)}</TableCell></TableRow>)}</TableBody></Table></div></section>
    </div>
    <ReturnDialog invoice={target} userName={user?.name} onOpenChange={(o) => !o && setTarget(null)} />
  </>
}

function ReturnDialog({ invoice, userName, onOpenChange }: { invoice: SalesInvoice | null; userName?: string; onOpenChange: (o: boolean) => void }) {
  const full = useLiveData(() => invoice?.id ? salesService.getFull(invoice.id) : Promise.resolve(null), [invoice?.id], null)
  const prior = useLiveData(() => invoice?.id ? salesReturnsService.getByInvoice(invoice.id) : Promise.resolve([]), [invoice?.id], [])
  const [selected, setSelected] = useState<Record<number, { checked: boolean; disposition: ReturnDisposition }>>({})
  const [reason, setReason] = useState(REASONS[0]), [notes, setNotes] = useState(""), [refund, setRefund] = useState(0)
  const [mode, setMode] = useState<PaymentMode>("cash"), [saving, setSaving] = useState(false)
  if (!invoice) return null
  const lines = full?.items ?? []
  const chosen = lines.filter((x) => selected[x.id!]?.checked)
  const estimate = chosen.reduce((s, x) => s + x.finalAmount, 0)
  const save = async () => {
    if (!chosen.length) return toast.error("Select at least one item")
    setSaving(true)
    try {
      const r = await salesReturnsService.create({ invoiceId: invoice.id!, date: todayStr(), reason, refundAmount: refund, refundMode: refund ? mode : undefined, notes: notes || undefined, createdBy: userName, items: chosen.map((x: SalesItem) => ({ salesItemId: x.id!, netWt: x.netWt, disposition: selected[x.id!].disposition })) })
      toast.success(`${r.returnNo} created · ₹${formatAmount(r.totalAmount)}`); onOpenChange(false); setSelected({}); setRefund(0)
    } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
  }
  return <Dialog open onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Return from {invoice.invoiceNo}</DialogTitle><DialogDescription>The original invoice stays unchanged. Already returned lines cannot be returned twice. {prior.length ? `${prior.length} credit note(s) already exist.` : ""}</DialogDescription></DialogHeader>
    <div className="max-h-72 overflow-auto rounded border"><Table><TableHeader><TableRow><TableHead className="w-10"/><TableHead>Item</TableHead><TableHead className="text-right">Net wt</TableHead><TableHead className="text-right">Value</TableHead><TableHead>After return</TableHead></TableRow></TableHeader><TableBody>{lines.map((x) => <TableRow key={x.id}><TableCell><input type="checkbox" checked={!!selected[x.id!]?.checked} onChange={(e) => setSelected((s) => ({ ...s, [x.id!]: { checked: e.target.checked, disposition: s[x.id!]?.disposition ?? "restock" } }))} /></TableCell><TableCell>{x.description}</TableCell><TableCell className="text-right">{x.netWt.toFixed(3)} g</TableCell><TableCell className="text-right">₹{formatAmount(x.finalAmount)}</TableCell><TableCell><Select value={selected[x.id!]?.disposition ?? "restock"} onValueChange={(v) => setSelected((s) => ({ ...s, [x.id!]: { checked: s[x.id!]?.checked ?? false, disposition: v as ReturnDisposition } }))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="restock">Restock</SelectItem><SelectItem value="repair">Send for repair</SelectItem><SelectItem value="melt">Melt</SelectItem><SelectItem value="scrap">Scrap</SelectItem></SelectContent></Select></TableCell></TableRow>)}</TableBody></Table></div>
    <div className="grid grid-cols-3 gap-3"><div><Label>Reason</Label><Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div><div><Label>Immediate refund ₹</Label><Input type="number" min={0} max={estimate} value={refund || ""} onChange={(e) => setRefund(Math.max(0, e.target.valueAsNumber || 0))}/></div><div><Label>Refund mode</Label><Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["cash","upi","card","cheque"].map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}</SelectContent></Select></div><div className="col-span-3"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}/></div></div>
    <DialogFooter><span className="mr-auto text-sm text-muted-foreground">Selected item value ≈ ₹{formatAmount(estimate)}</span><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>Create Credit Note</Button></DialogFooter>
  </DialogContent></Dialog>
}
