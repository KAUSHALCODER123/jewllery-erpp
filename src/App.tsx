import { lazy, Suspense, useEffect, useState, type ComponentType } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Gem } from "lucide-react"
import { AppLayout } from "@/components/AppLayout"
import { LoginPage } from "@/features/auth/LoginPage"
import { authService } from "@/services/authService"
import { useSession } from "@/stores/useSession"
import { Toaster } from "@/components/ui/sonner"

// Route pages are code-split so heavy deps (xlsx in Reports, jsbarcode in
// Item Master/Stock Audit) don't bloat the initial bundle.
const named = <T,>(p: Promise<Record<string, T>>, key: string) =>
  p.then((m) => ({ default: m[key] as ComponentType }))

const Dashboard = lazy(() => named(import("@/pages/Dashboard"), "Dashboard"))
const InventoryPage = lazy(() => named(import("@/features/items/InventoryPage"), "InventoryPage"))
const CustomersPage = lazy(() => named(import("@/features/customers/CustomersPage"), "CustomersPage"))
const PosPage = lazy(() => named(import("@/features/pos/PosPage"), "PosPage"))
const GirviPage = lazy(() => named(import("@/features/girvi/GirviPage"), "GirviPage"))
const KarigarPage = lazy(() => named(import("@/features/karigar/KarigarPage"), "KarigarPage"))
const OrdersPage = lazy(() => named(import("@/features/orders/OrdersPage"), "OrdersPage"))
const DayBookPage = lazy(() => named(import("@/features/daybook/DayBookPage"), "DayBookPage"))
const PurchasePage = lazy(() => named(import("@/features/purchase/PurchasePage"), "PurchasePage"))
const SchemesPage = lazy(() => named(import("@/features/schemes/SchemesPage"), "SchemesPage"))
const ReportsPage = lazy(() => named(import("@/features/reports/ReportsPage"), "ReportsPage"))
const ReceiptPage = lazy(() => named(import("@/features/receipt/ReceiptPage"), "ReceiptPage"))
const StockAuditPage = lazy(() => named(import("@/features/audit/StockAuditPage"), "StockAuditPage"))
const RefiningPage = lazy(() => named(import("@/features/refining/RefiningPage"), "RefiningPage"))
const SettingsPage = lazy(() => named(import("@/features/settings/SettingsPage"), "SettingsPage"))

function App() {
  const [ready, setReady] = useState(false)
  const user = useSession((s) => s.user)

  // First-run bootstrap: ensure a default firm + owner account exist.
  useEffect(() => {
    void authService.bootstrap().finally(() => setReady(true))
  }, [])

  return (
    <>
      {!ready ? (
        <div className="flex h-screen w-screen items-center justify-center text-muted-foreground">
          <Gem className="size-6 animate-pulse text-primary" />
        </div>
      ) : !user ? (
        <LoginPage />
      ) : (
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="flex h-screen w-screen items-center justify-center text-muted-foreground">
                <Gem className="size-6 animate-pulse text-primary" />
              </div>
            }
          >
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="billing" element={<PosPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="audit" element={<StockAuditPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="receipt" element={<ReceiptPage />} />
              <Route path="purchase" element={<PurchasePage />} />
              <Route path="refining" element={<RefiningPage />} />
              <Route path="schemes" element={<SchemesPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="girvi" element={<GirviPage />} />
              <Route path="karigar" element={<KarigarPage />} />
              <Route path="daybook" element={<DayBookPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
          </Suspense>
        </BrowserRouter>
      )}
      <Toaster richColors position="bottom-right" />
    </>
  )
}

export default App
