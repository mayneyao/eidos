import { LoaderCircle, RefreshCw } from "lucide-react"

import { useI18n } from "../i18n"

export interface PwaUpdatePromptProps {
  open: boolean
  hasUnsavedChanges: boolean
  updating: boolean
  error?: string | null
  onDismiss: () => void
  onUpdate: () => void
}

export function PwaUpdatePrompt({
  open,
  hasUnsavedChanges,
  updating,
  error,
  onDismiss,
  onUpdate,
}: PwaUpdatePromptProps) {
  const { t } = useI18n()

  if (!open) return null

  return (
    <aside
      className="pwa-update-prompt"
      aria-label={t("updateAvailableTitle")}
      aria-live="polite"
      role="status"
    >
      <span className="pwa-update-icon" aria-hidden="true">
        {updating ? (
          <LoaderCircle className="spin" size={15} />
        ) : (
          <RefreshCw size={15} />
        )}
      </span>
      <div className="pwa-update-copy">
        <strong>{t("updateAvailableTitle")}</strong>
        <p>
          {hasUnsavedChanges
            ? t("updateUnsavedBody")
            : t("updateAvailableBody")}
        </p>
        {error ? (
          <p className="pwa-update-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="pwa-update-actions">
        <button
          type="button"
          className="pwa-update-later"
          disabled={updating}
          onClick={onDismiss}
        >
          {t("updateLater")}
        </button>
        <button
          type="button"
          className="pwa-update-now"
          disabled={hasUnsavedChanges || updating}
          onClick={onUpdate}
        >
          {updating
            ? t("updatingApp")
            : hasUnsavedChanges
              ? t("updateSaveFirst")
              : t("updateNow")}
        </button>
      </div>
    </aside>
  )
}
