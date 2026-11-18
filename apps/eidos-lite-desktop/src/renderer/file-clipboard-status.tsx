import { useEffect, useState } from "react"
import { Copy, LoaderCircle, X } from "lucide-react"
import type { EidosLiteFileClipboardStatus } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export function FileClipboardStatus() {
  const { t } = useEidosLiteI18n()
  const [status, setStatus] = useState<EidosLiteFileClipboardStatus | null>(
    null
  )
  useEffect(() => window.eidosLite.onFileClipboardStatus?.(setStatus), [])
  if (!status) return null
  const preparing = status.phase === "preparing"
  const label = t(
    preparing
      ? "Preparing system copy…"
      : status.phase === "completed"
        ? "Files copied"
        : "System copy was not completed"
  )
  return (
    <div className="file-clipboard-status" data-phase={status.phase}>
      {preparing ? (
        <LoaderCircle className="spin" aria-hidden="true" />
      ) : (
        <Copy aria-hidden="true" />
      )}
      <span role="status" aria-live="polite" title={label}>
        {label}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label={t(preparing ? "Cancel copy" : "Dismiss")}
        onClick={() => {
          if (preparing) window.eidosLite.cancelPathClipboard()
          else setStatus(null)
        }}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  )
}
