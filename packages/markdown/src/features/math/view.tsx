import katex from "katex"
import { useMemo, useEffect, useRef, useState } from "react"
import { useMarkdownShortcuts } from "../../shortcuts/shortcut-context"

export function MathPreview({
  display,
  value,
}: {
  display: boolean
  value: string
}) {
  const rendered = useMemo(
    () =>
      katex.renderToString(value, {
        displayMode: display,
        output: "mathml",
        strict: "ignore",
        throwOnError: false,
        trust: false,
      }),
    [display, value]
  )
  return (
    <span
      className={display ? "eme-efm-math-display" : "eme-efm-math-inline"}
      data-efm-math-source={value}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  )
}

function MathComposer({
  draft,
  onCancel,
  onChange,
  onSave,
  saveBlockLabel,
}: {
  draft: string
  saveBlockLabel: string
  onCancel(): void
  onChange(value: string): void
  onSave(): void
}) {
  const { ariaKeys, label: shortcutLabel, matches } = useMarkdownShortcuts()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const commitShortcut = "composer.confirm" as const
  const commitHint = shortcutLabel(commitShortcut)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="eme-efm-math-composer"
      data-efm-editor-interactive="true"
      contentEditable={false}
    >
      <textarea
        ref={inputRef}
        aria-label="Edit inline equation"
        aria-keyshortcuts={ariaKeys([commitShortcut, "overlay.dismiss"])}
        rows={1}
        value={draft}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (matches(event, "overlay.dismiss")) {
            event.preventDefault()
            event.stopPropagation()
            onCancel()
            return
          }
          if (matches(event, commitShortcut)) {
            event.preventDefault()
            event.stopPropagation()
            onSave()
          }
        }}
      />
      <button
        type="button"
        data-primary="true"
        title={
          commitHint ? `${saveBlockLabel} (${commitHint})` : saveBlockLabel
        }
        onClick={onSave}
      >
        {saveBlockLabel}{" "}
        {commitHint ? <span aria-hidden="true">{commitHint}</span> : null}
      </button>
    </div>
  )
}

export function InlineMathView({
  value,
  onSave,
  readOnly,
  registerDraft,
  conflictMessage,
  saveBlockLabel,
}: {
  value: string
  onSave(value: string): void
  readOnly: boolean
  registerDraft(): () => void
  conflictMessage?: string
  saveBlockLabel: string
}) {
  const { ariaKeys, matches } = useMarkdownShortcuts()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (readOnly) setEditing(false)
  }, [readOnly])

  useEffect(() => {
    if (!editing) return
    return registerDraft()
  }, [editing, registerDraft])

  const startEditing = () => {
    if (readOnly) return
    setDraft(value)
    setEditing(true)
  }
  const save = () => {
    onSave(draft)
    setEditing(false)
  }

  return (
    <span className="eme-efm-inline-math" data-editing={editing || undefined}>
      <span
        className="eme-efm-math-preview-trigger"
        data-efm-editor-interactive="true"
        role={readOnly ? undefined : "button"}
        tabIndex={readOnly ? undefined : 0}
        aria-label={readOnly ? undefined : "Open inline equation editor"}
        aria-keyshortcuts={
          readOnly ? undefined : ariaKeys("inline-atom.activate")
        }
        onClick={startEditing}
        onKeyDown={(event) => {
          if (matches(event, "inline-atom.activate")) {
            event.preventDefault()
            startEditing()
          }
        }}
      >
        <MathPreview display={false} value={editing ? draft : value} />
      </span>
      {editing ? (
        <>
          <MathComposer
            saveBlockLabel={saveBlockLabel}
            draft={draft}
            onCancel={() => setEditing(false)}
            onChange={setDraft}
            onSave={save}
          />
          {conflictMessage ? (
            <span className="eme-efm-block-editor-error" role="alert">
              {conflictMessage}
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  )
}
