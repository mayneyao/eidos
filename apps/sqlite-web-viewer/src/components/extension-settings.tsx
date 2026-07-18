import { useEffect, useRef, useState, type FormEvent } from "react"
import { Plus, Settings2, X } from "lucide-react"

import { BUILT_IN_SQLITE_EXTENSIONS } from "../files/file-validation"

interface ExtensionSettingsProps {
  customExtensions: readonly string[]
  onAdd(value: string): void
  onClose(): void
  onRemove(extension: string): void
  persistenceAvailable: boolean
}

export function ExtensionSettings({
  customExtensions,
  onAdd,
  onClose,
  onRemove,
  persistenceAvailable,
}: ExtensionSettingsProps) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        !panelRef.current?.contains(target) &&
        !target.closest("[data-extension-settings-trigger]")
      ) {
        onClose()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [onClose])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    try {
      onAdd(draft)
      setDraft("")
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <aside
      aria-label="SQLite file suffix settings"
      className="extension-settings-panel"
      ref={panelRef}
      role="dialog"
    >
      <div className="extension-settings-heading">
        <div>
          <Settings2 aria-hidden size={15} />
          <strong>SQLite file suffixes</strong>
        </div>
        <button
          aria-label="Close file suffix settings"
          className="icon-button compact-icon-button"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden size={14} />
        </button>
      </div>
      <p className="extension-settings-intro">
        Suffixes control which files can be picked. Every file must still pass
        the SQLite header check before it opens.
      </p>
      <section className="extension-group" aria-labelledby="built-in-suffixes">
        <div className="extension-group-label" id="built-in-suffixes">
          <span>Built in</span>
          <small>Always available</small>
        </div>
        <div className="extension-chip-list">
          {BUILT_IN_SQLITE_EXTENSIONS.map((extension) => (
            <code key={extension}>{extension}</code>
          ))}
        </div>
      </section>
      <section className="extension-group" aria-labelledby="custom-suffixes">
        <div className="extension-group-label" id="custom-suffixes">
          <span>Custom</span>
          <small>
            {persistenceAvailable
              ? "Saved in this browser"
              : "Storage unavailable · this tab only"}
          </small>
        </div>
        {customExtensions.length > 0 ? (
          <div className="custom-extension-list">
            {customExtensions.map((extension) => (
              <div key={extension}>
                <code>{extension}</code>
                <button
                  aria-label={`Remove ${extension}`}
                  onClick={() => onRemove(extension)}
                  title={`Remove ${extension}`}
                  type="button"
                >
                  <X aria-hidden size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="extension-empty">No custom suffixes yet.</p>
        )}
        <form className="extension-form" onSubmit={submit}>
          <label htmlFor="custom-sqlite-extension">Add a file suffix</label>
          <div>
            <input
              aria-describedby={error ? "extension-input-error" : undefined}
              aria-invalid={Boolean(error)}
              autoComplete="off"
              id="custom-sqlite-extension"
              onChange={(event) => setDraft(event.target.value)}
              placeholder=".anki2"
              ref={inputRef}
              spellCheck={false}
              value={draft}
            />
            <button disabled={!draft.trim()} type="submit">
              <Plus aria-hidden size={13} />
              Add
            </button>
          </div>
          {error && (
            <p className="extension-form-error" id="extension-input-error">
              {error}
            </p>
          )}
        </form>
      </section>
    </aside>
  )
}
