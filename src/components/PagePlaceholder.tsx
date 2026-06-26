import { Construction } from "lucide-react"

/** Temporary screen for modules that arrive in later phases. */
export function PagePlaceholder({
  title,
  phase,
}: {
  title: string
  phase: string
}) {
  return (
    <>
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <h1 className="text-sm font-semibold">{title}</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Construction className="size-8 text-primary/60" />
        <p className="text-sm">{title} — coming in {phase}.</p>
      </div>
    </>
  )
}
