import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import "./index.css"
import App from "./App.tsx"
import { ErrorBoundary } from "@/components/ErrorBoundary"

// DEV-only test bridge (window.__jewel) for Playwright end-to-end/"API" tests.
// import.meta.env.DEV is false in production builds, so this whole block —
// and the imported module — is tree-shaken out of the shipped desktop bundle.
if (import.meta.env.DEV) {
  void import("./testBridge").then((m) => m.installTestBridge())
}

/**
 * React Query handles async server-ish state. For purely local, reactive Dexie
 * reads we lean on `useLiveQuery`; React Query is here for mutations and any
 * future sync/remote layer.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
