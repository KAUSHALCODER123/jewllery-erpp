import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Refiner } from "@/db/types"
import { refinersService } from "@/services/dbService"
import { REFINING_CHARGE_TYPES } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

type ChargeType = "none" | "per_gram" | "flat" | "percentage"

export function RefinerFormDialog({
  open,
  onOpenChange,
  editRefiner,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editRefiner?: Refiner | null
  onSaved?: (r: Refiner) => void
}) {
  const [name, setName] = useState("")
  const [kind, setKind] = useState<"internal" | "external">("external")
  const [contact, setContact] = useState("")
  const [address, setAddress] = useState("")
  const [chargeType, setChargeType] = useState<ChargeType>("none")
  const [chargeRate, setChargeRate] = useState(0)
  const [gstPct, setGstPct] = useState(0)
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!open) return
    setName(editRefiner?.name ?? "")
    setKind(editRefiner?.kind ?? "external")
    setContact(editRefiner?.contact ?? "")
    setAddress(editRefiner?.address ?? "")
    setChargeType((editRefiner?.chargeType as ChargeType) ?? "none")
    setChargeRate(editRefiner?.chargeRate ?? 0)
    setGstPct(editRefiner?.gstPct ?? 0)
    setNotes(editRefiner?.notes ?? "")
  }, [open, editRefiner])

  const unit = REFINING_CHARGE_TYPES.find((c) => c.value === chargeType)?.unit ?? ""

  const save = async () => {
    if (!name.trim()) return toast.error("Enter the refiner's name")
    const payload = {
      name: name.trim(),
      kind,
      contact: contact.trim() || undefined,
      address: address.trim() || undefined,
      chargeType: chargeType === "none" ? undefined : chargeType,
      chargeRate: chargeType === "none" ? undefined : chargeRate,
      gstPct: chargeType === "none" ? undefined : gstPct,
      notes: notes.trim() || undefined,
    }
    try {
      if (editRefiner?.id) {
        await refinersService.update(editRefiner.id, payload)
        toast.success(`Updated ${name}`)
      } else {
        const created = await refinersService.add(payload)
        toast.success(`Added refiner ${name}`)
        onSaved?.(created)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editRefiner ? "Edit Refiner" : "New Refiner"}</DialogTitle>
          <DialogDescription>
            An internal team or an external refinery. Default charges pre-fill a new job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "internal" | "external")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal (own workshop)</SelectItem>
                  <SelectItem value="external">External refinery</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contact</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="phone / person" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="optional" />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <Label className="text-xs font-medium text-muted-foreground">Default charges (optional)</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Basis</Label>
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
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Rate {unit && `(${unit})`}</Label>
                <Input
                  type="number"
                  step="0.01"
                  disabled={chargeType === "none"}
                  className="tabular text-right"
                  value={chargeRate || ""}
                  onChange={(e) => setChargeRate(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">GST %</Label>
                <Input
                  type="number"
                  step="0.1"
                  disabled={chargeType === "none"}
                  className="tabular text-right"
                  value={gstPct || ""}
                  onChange={(e) => setGstPct(e.target.value === "" ? 0 : e.target.valueAsNumber || 0)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>{editRefiner ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
