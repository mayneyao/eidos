import { useState } from "react"
import type { SpaceVersionTextContentDiff } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export function VersionTextRecovery({
  content,
  onRestore,
}: {
  content: SpaceVersionTextContentDiff
  onRestore?(): Promise<string[]>
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
      {onRestore &&
      (content.after.state === "utf8" || content.before.state === "utf8") ? (
        <button
          disabled={busy}
          title={t(
            "Restoring keeps copies of your current file and unsaved draft beside the document."
          )}
          onClick={async () => {
            setBusy(true)
            setError(null)
            setStatus(null)
            try {
              const paths = await onRestore()
              setStatus(
                `${t("Version restored. Recovery copies:")} ${paths.join(", ")}`
              )
            } catch (cause) {
              setError(String(cause))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t(
            busy
              ? "Restoring…"
              : content.after.state === "absent"
                ? "Restore before deletion"
                : "Restore this version"
          )}
        </button>
      ) : null}
      {(["before", "after"] as const).map((side) => {
        const state = content[side]
        return state.state === "utf8" ? (
          <button
            key={side}
            disabled={busy}
            onClick={() => void save(state.content)}
          >
            {t(side === "before" ? "Save before copy" : "Save after copy")}
          </button>
        ) : null
      })}
      {status ? <span role="status">{status}</span> : null}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  )
}
