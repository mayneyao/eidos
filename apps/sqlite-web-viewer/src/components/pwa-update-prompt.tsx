import { LoaderCircle, RefreshCw } from "lucide-react"

export interface PwaUpdatePromptProps {
  error?: string | null
  open: boolean
  updating: boolean
  onDismiss(): void
  onUpdate(): void
}

export function PwaUpdatePrompt({
  error,
  open,
  updating,
  onDismiss,
  onUpdate,
}: PwaUpdatePromptProps) {
  if (!open) return null

  return (
    <aside
      aria-busy={updating}
      aria-label="SQLite Viewer update available"
      aria-live="polite"
      className="pwa-update-prompt"
      role="status"
    >
      <span className="pwa-update-icon" aria-hidden>
        {updating ? (
          <LoaderCircle className="spin" size={15} />
        ) : (
          <RefreshCw size={15} />
        )}
      </span>
      <div className="pwa-update-copy">
        <strong>New version ready</strong>
        <p>
          Reload to update SQLite Viewer. The current database will close, but
          your local file stays unchanged.
        </p>
        {error ? (
          <p className="pwa-update-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="pwa-update-actions">
        <button
          className="pwa-update-later"
          disabled={updating}
          onClick={onDismiss}
          type="button"
        >
          Later
        </button>
        <button
          className="pwa-update-now"
          disabled={updating}
          onClick={onUpdate}
          type="button"
        >
          {updating ? "Updating…" : "Reload to update"}
        </button>
      </div>
    </aside>
  )
}
