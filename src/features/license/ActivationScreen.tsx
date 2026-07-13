import { useState } from "react"
import { Copy, Check, ShieldAlert } from "lucide-react"
import { Logo } from "@/components/Logo"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { LicenseResult } from "@/lib/license"

const REASON_TEXT: Record<string, string> = {
  "wrong-machine": "This license was issued for a different computer. Ask for a license for THIS machine id.",
  expired: "This license has expired. Ask for a renewed license.",
  "bad-signature": "This license key isn't valid. Check you pasted it fully and correctly.",
  malformed: "That doesn't look like a license key. Paste the full key you were given.",
  error: "Could not read that license key. Paste the full key you were given.",
}

export function ActivationScreen({
  machineId,
  expired,
  onActivate,
}: {
  machineId: string
  expired?: boolean
  onActivate: (license: string) => Promise<LicenseResult>
}) {
  const [license, setLicense] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(machineId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy — select the Machine ID and copy it manually.")
    }
  }

  const submit = async () => {
    if (!license.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await onActivate(license)
      if (!r.valid) setError(REASON_TEXT[r.reason] ?? "This license key isn't valid.")
      else toast.success(`Activated${r.store ? ` for ${r.store}` : ""}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-lg rounded-xl border bg-card p-7 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Logo className="size-11" />
          <div>
            <h1 className="text-lg font-semibold">Activate Jewel-ERP</h1>
            <p className="text-sm text-muted-foreground">
              {expired ? "Your license has expired — enter a renewed key to continue." : "This copy needs a license to run on this computer."}
            </p>
          </div>
        </div>

        {expired && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>Your access has stopped. Contact your provider with the Machine ID below to renew.</span>
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Your Machine ID — send this to get your license
        </label>
        <div className="mb-5 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm tracking-wide">
            {machineId}
          </code>
          <Button variant="outline" size="icon" onClick={() => void copyId()} title="Copy Machine ID">
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
          </Button>
        </div>

        <label className="mb-1 block text-xs font-medium text-muted-foreground">Paste your license key</label>
        <Textarea
          value={license}
          onChange={(e) => {
            setLicense(e.target.value)
            setError(null)
          }}
          rows={3}
          placeholder="Paste the license key you were given…"
          className="font-mono text-xs"
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <Button className="mt-4 w-full" disabled={busy || !license.trim()} onClick={() => void submit()}>
          {busy ? "Checking…" : "Activate"}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          This license unlocks the app on this computer only. Your shop data stays on this machine.
        </p>
      </div>
    </div>
  )
}
