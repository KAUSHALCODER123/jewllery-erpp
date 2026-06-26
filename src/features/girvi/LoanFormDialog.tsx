import { useEffect, useState } from "react"
import { Plus, Trash2, Upload, ImageOff, Fingerprint } from "lucide-react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PledgedItem } from "@/db/types"
import { loansService, todayStr } from "@/services/dbService"
import { formatAmount, wt } from "@/lib/format"
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
import { CustomerCombobox } from "@/components/CustomerCombobox"
import { NumCell, TextCell } from "@/features/pos/GridCells"

interface PledgeRow extends PledgedItem {
  id: string
}

const rid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p${Date.now()}${Math.floor(Math.random() * 1e6)}`

const newRow = (): PledgeRow => ({
  id: rid(),
  description: "",
  grossWt: 0,
  netWt: 0,
  purity: "22K",
  estimatedValue: 0,
})

export function LoanFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState<PledgeRow[]>([newRow()])
  const [image, setImage] = useState<string | undefined>(undefined)
  const [thumbprint, setThumbprint] = useState<string | undefined>(undefined)
  const [interestMode, setInterestMode] = useState<"monthly" | "daywise">("monthly")
  const [loanAmount, setLoanAmount] = useState(0)
  const [interestRate, setInterestRate] = useState(2)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setCustomerId(null)
      setDate(todayStr())
      setRows([newRow()])
      setImage(undefined)
      setThumbprint(undefined)
      setInterestMode("monthly")
      setLoanAmount(0)
      setInterestRate(2)
    }
  }, [open])

  const totalGross = rows.reduce((s, r) => s + r.grossWt, 0)
  const totalNet = rows.reduce((s, r) => s + r.netWt, 0)
  const totalValue = rows.reduce((s, r) => s + r.estimatedValue, 0)

  const updateRow = (id: string, patch: Partial<PledgeRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const onImage = (file?: File) => {
    if (!file) return
    if (file.size > 3_000_000) {
      toast.error("Image too large (max 3 MB)")
      return
    }
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  const onThumbprint = (file?: File) => {
    if (!file) return
    if (file.size > 3_000_000) {
      toast.error("Thumbprint too large (max 3 MB)")
      return
    }
    const reader = new FileReader()
    reader.onload = () => setThumbprint(reader.result as string)
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (customerId == null) return toast.error("Select a customer")
    const pledged = rows.filter((r) => r.description.trim() || r.grossWt > 0)
    if (pledged.length === 0) return toast.error("Add at least one pledged item")
    if (loanAmount <= 0) return toast.error("Enter the loan amount")

    setSaving(true)
    try {
      const loan = await loansService.add({
        customerId,
        date,
        itemsPledged: pledged.map(({ id: _id, ...rest }) => rest),
        grossWt: Number(totalGross.toFixed(3)),
        netWt: Number(totalNet.toFixed(3)),
        loanAmount,
        interestRate,
        collateralImage: image,
        collateralThumbprint: thumbprint,
        interestMode,
      })
      toast.success(`Loan ${loan.loanNo} created`)
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not create loan: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Girvi (Gold Loan)</DialogTitle>
          <DialogDescription>
            Pledge collateral against a cash loan at a monthly interest rate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Customer</Label>
              <CustomerCombobox
                value={customerId}
                onChange={setCustomerId}
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Pledged items + collateral image + thumbprint */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Pledged Items
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRows((rs) => [...rs, newRow()])}
                >
                  <Plus className="size-4" /> Row
                </Button>
              </div>
              <div className="rounded-md border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
                      <th>Description</th>
                      <th className="w-16">Purity</th>
                      <th className="w-20 text-right">Gross</th>
                      <th className="w-20 text-right">Net</th>
                      <th className="w-24 text-right">Est. Value</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t [&>td]:px-1 [&>td]:py-0.5">
                        <td>
                          <TextCell
                            value={r.description}
                            onChange={(v) => updateRow(r.id, { description: v })}
                            placeholder="e.g. Gold bangle"
                          />
                        </td>
                        <td>
                          <TextCell
                            value={r.purity}
                            onChange={(v) => updateRow(r.id, { purity: v })}
                          />
                        </td>
                        <td>
                          <NumCell
                            value={r.grossWt}
                            onChange={(v) => updateRow(r.id, { grossWt: v })}
                          />
                        </td>
                        <td>
                          <NumCell
                            value={r.netWt}
                            onChange={(v) => updateRow(r.id, { netWt: v })}
                          />
                        </td>
                        <td>
                          <NumCell
                            value={r.estimatedValue}
                            step={1}
                            onChange={(v) => updateRow(r.id, { estimatedValue: v })}
                          />
                        </td>
                        <td>
                          <button
                            onClick={() =>
                              setRows((rs) =>
                                rs.length > 1
                                  ? rs.filter((x) => x.id !== r.id)
                                  : rs,
                              )
                            }
                            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove row"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/40 font-medium [&>td]:px-2 [&>td]:py-1">
                      <td colSpan={2} className="text-muted-foreground">
                        Totals
                      </td>
                      <td className="text-right tabular">{wt(totalGross)}</td>
                      <td className="text-right tabular">{wt(totalNet)}</td>
                      <td className="text-right tabular">
                        {formatAmount(totalValue)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Collateral photo */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Collateral Photo
              </Label>
              <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/30 hover:bg-muted">
                {image ? (
                  <img
                    src={image}
                    alt="Collateral"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImageOff className="size-6" />
                    <span className="text-[11px]">No photo</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onImage(e.target.files?.[0])}
                />
              </label>
              {image && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setImage(undefined)}
                >
                  Remove photo
                </Button>
              )}
              {!image && (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Upload className="size-3" /> Click box to upload
                </p>
              )}
            </div>

            {/* Borrower Thumbprint */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Borrower Thumbprint
              </Label>
              <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/30 hover:bg-muted">
                {thumbprint ? (
                  <img
                    src={thumbprint}
                    alt="Thumbprint"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Fingerprint className="size-6" />
                    <span className="text-[11px]">No thumbprint</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onThumbprint(e.target.files?.[0])}
                />
              </label>
              {thumbprint && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setThumbprint(undefined)}
                >
                  Remove thumbprint
                </Button>
              )}
              {!thumbprint && (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Upload className="size-3" /> Click box to upload
                </p>
              )}
            </div>
          </div>

          {/* Loan terms */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Loan Amount (₹)
              </Label>
              <Input
                type="number"
                className="tabular text-right"
                value={loanAmount || ""}
                onChange={(e) =>
                  setLoanAmount(
                    e.target.value === "" ? 0 : e.target.valueAsNumber || 0,
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Interest (% / month)
              </Label>
              <Input
                type="number"
                step="0.1"
                className="tabular text-right"
                value={interestRate || ""}
                onChange={(e) =>
                  setInterestRate(
                    e.target.value === "" ? 0 : e.target.valueAsNumber || 0,
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Interest Mode
              </Label>
              <Select
                value={interestMode}
                onValueChange={(v) => setInterestMode(v as "monthly" | "daywise")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Interest Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="daywise">Day-wise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end pb-2">
              <p className="text-[11px] text-muted-foreground leading-none">
                ≈ {formatAmount((loanAmount * interestRate) / 100)} interest / month
                {interestMode === "daywise" && " (day-wise accrual)"}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            Create Loan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
