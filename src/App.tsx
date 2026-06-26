import { useEffect, useState } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Gem } from "lucide-react"
import { AppLayout } from "@/components/AppLayout"
import { Dashboard } from "@/pages/Dashboard"
import { InventoryPage } from "@/features/items/InventoryPage"
import { CustomersPage } from "@/features/customers/CustomersPage"
import { PosPage } from "@/features/pos/PosPage"
import { GirviPage } from "@/features/girvi/GirviPage"
import { KarigarPage } from "@/features/karigar/KarigarPage"
import { OrdersPage } from "@/features/orders/OrdersPage"
import { DayBookPage } from "@/features/daybook/DayBookPage"
import { PurchasePage } from "@/features/purchase/PurchasePage"
import { SchemesPage } from "@/features/schemes/SchemesPage"
import { ReportsPage } from "@/features/reports/ReportsPage"
import { ReceiptPage } from "@/features/receipt/ReceiptPage"
import { StockAuditPage } from "@/features/audit/StockAuditPage"
import { RefiningPage } from "@/features/refining/RefiningPage"
import { SettingsPage } from "@/features/settings/SettingsPage"
import { LoginPage } from "@/features/auth/LoginPage"
import { authService } from "@/services/authService"
import { useSession } from "@/stores/useSession"
import { Toaster } from "@/components/ui/sonner"

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
        </BrowserRouter>
      )}
      <Toaster richColors position="bottom-right" />
    </>
  )
}

export default App
