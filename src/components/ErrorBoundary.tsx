import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * App-wide last-resort error boundary. Without it, any render-time throw or a
 * failed lazy-chunk load (common on the desktop build right after an update)
 * white-screens the whole app with no way back. Here we catch it, show a
 * recover/reload panel, and keep the shop running.
 *
 * A chunk that 404s after a new build is treated specially: a hard reload pulls
 * the fresh bundle, so we surface that as the primary action.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a breadcrumb for support; never throws further.
    console.error("Unhandled UI error", error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  private reload = () => window.location.reload()

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isChunkError = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i.test(
      `${error.name} ${error.message}`,
    )

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="size-10 text-destructive" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">
            {isChunkError ? "Update available — please reload" : "Something went wrong"}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {isChunkError
              ? "A newer version of the app is ready. Reload to load the latest — your data is safe."
              : "The screen hit an unexpected error. Your saved data is safe. Try again, or reload the app."}
          </p>
        </div>
        <div className="flex gap-2">
          {!isChunkError && (
            <Button variant="outline" onClick={this.reset}>
              <RotateCcw className="size-4" />
              Try again
            </Button>
          )}
          <Button onClick={this.reload}>Reload app</Button>
        </div>
        {import.meta.env.DEV && (
          <pre className="mt-2 max-h-48 max-w-2xl overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
            {error.stack ?? error.message}
          </pre>
        )}
      </div>
    )
  }
}
