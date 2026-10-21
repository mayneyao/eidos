import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { LoaderCircle, X } from "lucide-react"

import type { SpaceIgnoreRules } from "../shared/contracts"
import {
  appendIgnorePatterns,
  hasIgnorePattern,
  ignorePathPattern,
  removeIgnorePatterns,
  templateApplied,
  IGNORE_TEMPLATES,
  type IgnoreTemplate,
} from "./space-ignore-rules"
import { useEidosLiteI18n } from "./i18n"
import { formatUsageBytes } from "./usage-meter"

type IgnoreFile = "graftignore" | "gitignore"

export function SpaceIgnoreBuilderDialog({
  rules,
  largeFiles,
  onCancel,
  onSave,
}: {
  rules: SpaceIgnoreRules
  largeFiles: readonly { path: string; size: number }[]
  onCancel(): void
  onSave(rules: SpaceIgnoreRules): Promise<void>
}) {
  const { t } = useEidosLiteI18n()
  const titleId = useId()
  const [graftignore, setGraftignore] = useState(rules.graftignore)
  const [gitignore, setGitignore] = useState(rules.gitignore)
  const [activeFile, setActiveFile] = useState<IgnoreFile>("graftignore")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const editor = useRef<HTMLTextAreaElement>(null)
  const dirty =
    graftignore !== rules.graftignore || gitignore !== rules.gitignore
  useEffect(() => {
    editor.current?.focus()
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
  const toggleTemplate = (template: IgnoreTemplate) => {
    setActiveFile("graftignore")
    setGraftignore((current) =>
      templateApplied(current, template)
        ? removeIgnorePatterns(current, template.patterns, template.header)
        : appendIgnorePatterns(current, template.patterns, template.header)
            .content
    )
  }
  const toggleLargeFile = (path: string) => {
    setActiveFile("graftignore")
    const pattern = ignorePathPattern(path)
    setGraftignore((current) =>
      hasIgnorePattern(current, pattern)
        ? removeIgnorePatterns(current, [pattern])
        : appendIgnorePatterns(current, [pattern]).content
    )
  }
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
        className="path-dialog space-ignore-builder"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => void submit(event)}
      >
        <header>
          <strong id={titleId}>{t("Build ignore rules")}</strong>
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
        <div className="space-ignore-builder-body">
          <aside className="space-ignore-builder-options">
            <section>
              <h3>{t("Templates")}</h3>
              <div className="space-ignore-options">
                {IGNORE_TEMPLATES.map((template) => (
                  <label className="space-ignore-option" key={template.id}>
                    <input
                      type="checkbox"
                      checked={templateApplied(graftignore, template)}
                      disabled={busy}
                      onChange={() => toggleTemplate(template)}
                    />
                    <span>{t(template.label)}</span>
                    <small>
                      {t("{count} rules", {
                        count: template.patterns.length,
                      })}
                    </small>
                  </label>
                ))}
              </div>
            </section>
            {largeFiles.length > 0 ? (
              <section>
                <h3>{t("Large files")}</h3>
                <div className="space-ignore-options">
                  {largeFiles.map((file) => (
                    <label className="space-ignore-option" key={file.path}>
                      <input
                        type="checkbox"
                        checked={hasIgnorePattern(
                          graftignore,
                          ignorePathPattern(file.path)
                        )}
                        disabled={busy}
                        onChange={() => toggleLargeFile(file.path)}
                      />
                      <span title={file.path}>{file.path}</span>
                      <small>{formatUsageBytes(file.size)}</small>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
          <div className="space-ignore-editor-pane">
            <div
              className="space-ignore-tabs"
              role="tablist"
              aria-label={t("Ignore rules")}
            >
              {(
                [
                  ["graftignore", ".graftignore"],
                  ["gitignore", ".gitignore"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeFile === id}
                  onClick={() => setActiveFile(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              ref={editor}
              className="space-ignore-editor"
              aria-label={
                activeFile === "graftignore" ? ".graftignore" : ".gitignore"
              }
              value={activeFile === "graftignore" ? graftignore : gitignore}
              spellCheck={false}
              disabled={busy}
              placeholder={t("One pattern per line")}
              onChange={(event) =>
                activeFile === "graftignore"
                  ? setGraftignore(event.target.value)
                  : setGitignore(event.target.value)
              }
            />
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
