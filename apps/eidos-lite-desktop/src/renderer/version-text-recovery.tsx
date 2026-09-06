import { useState } from "react"
import type { SpaceVersionTextContentDiff } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export function VersionTextRecovery({
  content,
}: {
  content: SpaceVersionTextContentDiff
}) {
  const { t } = useEidosLiteI18n()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const save = async (text: string) => {
    setBusy(true)
    setStatus(null)
    setError(null)
    try {
      const saved = await window.eidosLite.saveTextDraftCopy(content.path, text)
      if (saved)
        setStatus(
          t("Historical copy saved. Current files and drafts are unchanged.")
        )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="version-text-recovery">
      <span>{t("Recover one file")}</span>
      {(["before", "after"] as const).map((side) => {
        const state = content[side]
        return state.state === "utf8" ? (
          <button
            key={side}
            disabled={busy}
            onClick={() => void save(state.content)}
          >
            {t(
              side === "before"
                ? "Save before as a copy"
                : "Save after as a copy"
            )}
          </button>
        ) : null
      })}
      {status ? <span role="status">{status}</span> : null}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  )
}
