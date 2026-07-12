import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useLicense, TRIAL_DAYS } from "./useLicense"

const STATUS_TEXT: Record<string, (s: ReturnType<typeof useLicense>["status"]) => string> = {
  licensed: (s) => `Licensed to ${s.store ?? "this shop"} · valid until ${s.exp} (${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left)`,
  trial: (s) => `Free trial — ${s.trialDaysLeft} of ${TRIAL_DAYS} days left. Activate a license to keep using the app.`,
  grace: (s) => `Expired on ${s.exp}. Still usable for a few more days — renew now to avoid a lock-out.`,
  expired: (s) => `Expired on ${s.exp}. Enter a renewed license to continue.`,
  unlicensed: () => "Not licensed on this computer.",
  checking: () => "Checking…",
}

export function LicensePanel() {
  const { status, activate } = useLicense()
  const [license, setLicense] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const tone =
    status.state === "licensed" ? "text-primary"
    : status.state === "trial" ? "text-amber-600 dark:text-amber-400"
    : "text-destructive"

  const copyId = async () => {
    if (!status.machineId) return
    try {
      await navigator.clipboard.writeText(status.machineId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy — select and copy the Machine ID manually.")
    }
  }

  const submit = async () => {
    if (!license.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await activate(license)
      if (r.valid) {
        toast.success("License updated")
        setLicense("")
      } else {
        setError(
          r.reason === "wrong-machine" ? "This license is for a different computer."
          : r.reason === "expired" ? "That license has already expired."
          : "That license key isn't valid.",
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Label className="text-xs text-muted-foreground">Status</Label>
        <p className={"text-sm font-medium " + tone}>{(STATUS_TEXT[status.state] ?? STATUS_TEXT.checking)(status)}</p>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">This computer's Machine ID</Label>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm tracking-wide">
            {status.machineId ?? "…"}
          </code>
          <Button variant="outline" size="icon" onClick={() => void copyId()} title="Copy Machine ID">
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Share this with your provider to get or renew a license.</p>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Enter / renew license key</Label>
        <Textarea
          value={license}
          onChange={(e) => {
            setLicense(e.target.value)
            setError(null)
          }}
          rows={3}
          placeholder="Paste a license key…"
          className="mt-1 font-mono text-xs"
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <Button className="mt-3" disabled={busy || !license.trim()} onClick={() => void submit()}>
          {busy ? "Checking…" : "Apply license"}
        </Button>
      </div>
    </div>
  )
}
