import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { LoaderCircle, X } from "lucide-react"

import type { SpaceIgnoreRules } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export function SpaceIgnoreDialog({
  rules,
  onCancel,
  onSave,
}: {
  rules: SpaceIgnoreRules
  onCancel(): void
  onSave(rules: SpaceIgnoreRules): Promise<void>
}) {
  const { t } = useEidosLiteI18n()
  const titleId = useId()
  const [graftignore, setGraftignore] = useState(rules.graftignore)
  const [gitignore, setGitignore] = useState(rules.gitignore)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const firstField = useRef<HTMLTextAreaElement>(null)
  const dirty =
    graftignore !== rules.graftignore || gitignore !== rules.gitignore
  useEffect(() => {
    firstField.current?.focus()
  }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return
      event.preventDefault()
      onCancel()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [busy, onCancel])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !dirty) return
    setBusy(true)
    setError("")
    try {
      await onSave({ graftignore, gitignore })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="path-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <form
        className="path-dialog space-ignore-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => void submit(event)}
      >
        <header>
          <strong id={titleId}>{t("Ignore rules")}</strong>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label={t("Cancel")}
            disabled={busy}
          >
            <X />
          </button>
        </header>
        <div className="space-ignore-body">
          <p>
            {t(
              "Files matching these patterns are excluded from version history. Use one pattern per line."
            )}
          </p>
          <div className="space-ignore-fields">
            <label className="space-ignore-field">
              <span>.graftignore</span>
              <textarea
                ref={firstField}
                value={graftignore}
                aria-label=".graftignore"
                spellCheck={false}
                disabled={busy}
                placeholder={t("One pattern per line")}
                onChange={(event) => setGraftignore(event.target.value)}
              />
            </label>
            <label className="space-ignore-field">
              <span>.gitignore</span>
              <textarea
                value={gitignore}
                aria-label=".gitignore"
                spellCheck={false}
                disabled={busy}
                placeholder={t("One pattern per line")}
                onChange={(event) => setGitignore(event.target.value)}
              />
            </label>
          </div>
          <p className="space-ignore-hint">
            {t(
              "Graft reads .graftignore first. .gitignore is also respected, so either file can exclude files."
            )}
          </p>
          {error ? (
            <p className="space-ignore-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer>
          <button
            type="button"
            className="quiet-action"
            onClick={onCancel}
            disabled={busy}
          >
            {t("Cancel")}
          </button>
          <button
            type="submit"
            className="primary-action"
            disabled={busy || !dirty}
          >
            {busy ? <LoaderCircle className="spin" /> : null}
            {busy ? t("Saving…") : t("Save")}
          </button>
        </footer>
      </form>
    </div>
  )
}
