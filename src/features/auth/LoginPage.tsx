import { useEffect, useState } from "react"
import { Gem, LogIn } from "lucide-react"
import { toast } from "sonner"
import type { Company } from "@/db/systemDb"
import { authService } from "@/services/authService"
import { ACTIVE_COMPANY_KEY, activeCompanyId } from "@/db/database"
import {
  useSession,
  financialYearOptions,
  currentFinancialYear,
} from "@/stores/useSession"
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

export function LoginPage() {
  const setSession = useSession((s) => s.setSession)
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState<string>("")
  const [fy, setFy] = useState(currentFinancialYear())
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const fyOpts = financialYearOptions()

  useEffect(() => {
    void authService.listCompanies().then((cs) => {
      setCompanies(cs)
      if (cs[0]?.id) setCompanyId(String(cs[0].id))
    })
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return toast.error("Select a company")
    setBusy(true)
    try {
      const user = await authService.login(username, password)
      const cid = Number(companyId)
      const company = companies.find((c) => c.id === cid)!
      setSession({ user, companyId: cid, company, financialYear: fy })

      // Point the business DB at the chosen firm; reload if it differs from the
      // DB the singleton booted with.
      const previous = activeCompanyId()
      localStorage.setItem(ACTIVE_COMPANY_KEY, String(cid))
      if (cid !== previous) window.location.reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <form
        onSubmit={submit}
        className="w-[360px] space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-col items-center gap-1 pb-2">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/15">
            <Gem className="size-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Jewel-ERP</h1>
          <p className="text-xs text-muted-foreground">Jewellery Store Management</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Company / Firm</Label>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select firm" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Financial Year</Label>
          <Select value={fy} onValueChange={setFy}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fyOpts.map((f) => (
                <SelectItem key={f} value={f}>
                  FY {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Username</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          <LogIn className="size-4" /> {busy ? "Signing in…" : "Login"}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          First time? Use <span className="font-medium">admin / admin</span>, then
          change it in Settings.
        </p>
      </form>
    </div>
  )
}
