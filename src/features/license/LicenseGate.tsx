import type { ReactNode } from "react"
import { Gem } from "lucide-react"
import { useLicense } from "./useLicense"
import { ActivationScreen } from "./ActivationScreen"

/**
 * Wraps the whole app: blocks it behind the activation screen when there's no
 * valid license (and the trial is over), otherwise renders the app with a slim
 * banner while on trial / in the post-expiry grace window / expiring soon.
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  const { status, activate } = useLicense()

  if (status.state === "checking") {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-muted-foreground">
        <Gem className="size-6 animate-pulse text-primary" />
      </div>
    )
  }

  if (status.state === "unlicensed" || status.state === "expired") {
    return (
      <ActivationScreen
        machineId={status.machineId ?? "…"}
        expired={status.state === "expired"}
        onActivate={activate}
      />
    )
  }

  // licensed / trial / grace → run the app, with a banner when attention is due.
  let banner: { tone: "warn" | "danger"; text: string } | null = null
  if (status.state === "trial") {
    banner = { tone: "warn", text: `Trial — ${status.trialDaysLeft} day${status.trialDaysLeft === 1 ? "" : "s"} left. Activate to keep using the app.` }
  } else if (status.state === "grace") {
    banner = { tone: "danger", text: `License expired — renew within ${GRACE_LEFT(status.daysLeft)} day(s) or the app will lock.` }
  } else if (status.state === "licensed" && (status.daysLeft ?? 999) <= 15) {
    banner = { tone: "warn", text: `License expires in ${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"}. Renew soon.` }
  }

  if (!banner) return <>{children}</>

  return (
    <div className="flex h-screen w-screen flex-col">
      <div
        className={
          "shrink-0 px-4 py-1.5 text-center text-xs font-medium " +
          (banner.tone === "danger"
            ? "bg-destructive/15 text-destructive"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-400")
        }
      >
        {banner.text}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

/** Days remaining in the grace window (daysLeft is negative once expired). */
function GRACE_LEFT(daysLeft?: number): number {
  return Math.max(0, 7 + (daysLeft ?? 0))
}
