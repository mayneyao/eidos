import { XIcon, RefreshCwIcon } from "lucide-react"

interface ErrorStateProps {
  error: string
  onRetry: () => void
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <XIcon className="h-6 w-6 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <RefreshCwIcon className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  )
}
