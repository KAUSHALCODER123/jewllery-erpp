import { useEffect } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Landmark,
  Hammer,
  BookOpen,
  Users,
  Gem,
  Truck,
  PiggyBank,
  FileBarChart,
  Settings,
  LogOut,
  HandCoins,
  ClipboardList,
  ScanLine,
  Flame,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSession } from "@/stores/useSession"
import { Button } from "@/components/ui/button"

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Keyboard accelerator hint (wired up in later phases). */
  hint?: string
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/billing", label: "Billing / POS", icon: ShoppingCart, hint: "F2" },
  { to: "/inventory", label: "Item Master", icon: Package, hint: "F3" },
  { to: "/audit", label: "Stock Audit", icon: ScanLine },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/receipt", label: "Receipt (Udhari)", icon: HandCoins },
  { to: "/purchase", label: "Purchase", icon: Truck },
  { to: "/refining", label: "Refining (Ghalai)", icon: Flame },
  { to: "/schemes", label: "Gold Schemes", icon: PiggyBank },
  { to: "/orders", label: "Order Booking", icon: ClipboardList },
  { to: "/girvi", label: "Girvi (Loans)", icon: Landmark },
  { to: "/karigar", label: "Karigar", icon: Hammer },
  { to: "/daybook", label: "Day Book", icon: BookOpen },
  { to: "/reports", label: "Reports & GST", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: Settings },
]

export function AppLayout() {
  const user = useSession((s) => s.user)
  const company = useSession((s) => s.company)
  const financialYear = useSession((s) => s.financialYear)
  const logout = useSession((s) => s.logout)
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "F1":
          e.preventDefault()
          navigate("/")
          break
        case "F2":
          e.preventDefault()
          navigate("/billing")
          break
        case "F3":
          e.preventDefault()
          navigate("/inventory")
          break
        case "F4":
          e.preventDefault()
          navigate("/schemes")
          break
        case "F6":
          e.preventDefault()
          navigate("/girvi")
          break
        default:
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [navigate])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <Gem className="size-5 text-primary" />
          <span className="font-semibold tracking-tight">Jewel-ERP</span>
        </div>
        <div className="border-b px-4 py-2">
          <p className="truncate text-xs font-medium">{company?.name ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground">FY {financialYear ?? "—"}</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map(({ to, label, icon: Icon, hint }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {hint && (
                <kbd className="rounded border bg-muted px-1 text-[10px] text-muted-foreground">
                  {hint}
                </kbd>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t p-2">
          <div className="flex items-center justify-between px-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{user?.name}</p>
              <p className="text-[11px] capitalize text-muted-foreground">
                {user?.role}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Logout"
              onClick={logout}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main work area (single-window philosophy) */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
