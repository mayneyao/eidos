import { useEffect, useRef, useState } from "react"
import { CircleHelp, LoaderCircle, X } from "lucide-react"
import type { SpaceTreeEntry } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

type PathDialogAction =
  | "create-file"
  | "create-folder"
  | "create-linked-note"
  | "delete"

type FileKind = "eidos" | "text"
type FileTemplateId = "eidos" | "files-index" | "text"

interface FileKindOption {
  id: FileKind
  label: string
}

export interface PathDialogState {
  action: PathDialogAction
  entry: SpaceTreeEntry | null
  entries?: SpaceTreeEntry[]
  linkedNotePath?: string
}

export function PathActionDialog({
  state,
  busy,
  onCancel,
  onSubmit,
}: {
  state: PathDialogState
  busy: boolean
  onCancel(): void
  onSubmit(value: string, template?: FileTemplateId): void
}) {
  const { t, locale } = useEidosLiteI18n()
  const config = {
    "create-linked-note": {
      title: t("Create linked note?"),
      label: t("Note path"),
      initial: state.linkedNotePath ?? "",
      action: t("Create"),
    },
    "create-file": {
      title: t("New File"),
      label: t("File name"),
      initial: "Untitled.eidos",
      action: t("Create"),
    },
    "create-folder": {
      title: t("New folder"),
      label: t("Folder name"),
      initial: t("New folder"),
      action: t("Create"),
    },
    delete: {
      title:
        state.entries && state.entries.length > 1
          ? t("Move {count} items to Trash?", {
              count: state.entries.length,
            })
          : t("Move {name} to Trash?", {
              name: state.entry?.name ?? t("item"),
            }),
      label: "",
      initial: "",
      action: t("Move to Trash"),
    },
  }[state.action]
  const [value, setValue] = useState(config.initial)
  const [selectedKind, setSelectedKind] = useState<FileKind>("eidos")
  const [isFileTable, setIsFileTable] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (state.action !== "create-file") return
    const input = nameInput.current
    if (!input) return
    const extension = input.value.lastIndexOf(".")
    input.setSelectionRange(0, extension > 0 ? extension : input.value.length)
  }, [state.action])
  const destructive = state.action === "delete"

  const fileKinds: FileKindOption[] = [
    {
      id: "eidos",
      label: "Eidos",
    },
    {
      id: "text",
      label: "Text",
    },
  ]

  const trimmed = value.trim().toLowerCase()
  const isFilesEidosName =
    trimmed === "files.eidos" ||
    trimmed === "_files.eidos" ||
    trimmed === "_fs_meta.eidos" ||
    trimmed.endsWith("._files.eidos") ||
    trimmed.endsWith(".files.eidos")

  const effectiveKind: FileKind = (() => {
    if (
      trimmed.endsWith(".eidos") ||
      (!trimmed.includes(".") && trimmed.length > 0)
    ) {
      return "eidos"
    }
    if (trimmed.endsWith(".md") || trimmed.endsWith(".txt")) {
      return "text"
    }
    return selectedKind
  })()

  const effectiveIsFileTable =
    effectiveKind === "eidos" && (isFileTable || isFilesEidosName)

  const currentTemplateId: FileTemplateId = (() => {
    if (effectiveKind === "eidos") {
      return effectiveIsFileTable ? "files-index" : "eidos"
    }
    return "text"
  })()

  const handleSelectKind = (kind: FileKindOption) => {
    setSelectedKind(kind.id)
    setValue((current) => {
      const extension = current.lastIndexOf(".")
      const name = extension > 0 ? current.slice(0, extension) : current
      return `${name || "Untitled"}.${kind.id === "eidos" ? "eidos" : "md"}`
    })
  }

  const handleToggleFileTable = () => {
    if (effectiveIsFileTable) {
      setIsFileTable(false)
      if (isFilesEidosName || value.trim() === "files.eidos") {
        setValue("Untitled.eidos")
      }
    } else {
      setIsFileTable(true)
      if (value.trim() === "Untitled.eidos") {
        setValue("files.eidos")
      }
    }
  }

  return (
    <div className="path-dialog-backdrop" role="presentation">
      <form
        className="path-dialog"
        data-action={state.action}
        aria-label={config.title}
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          if (state.action === "create-file") {
            onSubmit(value, currentTemplateId)
          } else {
            onSubmit(value)
          }
        }}
      >
        <header>
          <strong>{config.title}</strong>
          {state.action === "create-file" ? (
            <div
              className="path-dialog-templates"
              role="radiogroup"
              aria-label={t("File type")}
            >
              {fileKinds.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={`path-dialog-template-btn ${effectiveKind === tpl.id ? "active" : ""}`}
                  onClick={() => handleSelectKind(tpl)}
                  disabled={busy}
                  role="radio"
                  aria-checked={effectiveKind === tpl.id}
                >
                  <span>{tpl.label}</span>
                </button>
              ))}
            </div>
          ) : null}
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

        {destructive ? (
          <p>
            {t(
              state.entries && state.entries.length > 1
                ? "These items will leave this Space and can be recovered from the system Trash."
                : "The item will leave this Space and can be recovered from the system Trash."
            )}
          </p>
        ) : (
          <div className="path-dialog-fields">
            <label>
              <span>{config.label}</span>
              <input
                ref={nameInput}
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={busy}
                readOnly={state.action === "create-linked-note"}
              />
            </label>
            {state.action === "create-file" ? (
              <div
                className="path-dialog-metadata"
                data-visible={effectiveKind === "eidos"}
                aria-hidden={effectiveKind !== "eidos"}
              >
                <label className="path-dialog-metadata-label">
                  <input
                    type="checkbox"
                    checked={effectiveIsFileTable}
                    onChange={handleToggleFileTable}
                    disabled={busy || effectiveKind !== "eidos"}
                  />
                  <span>{t("Manage folder file metadata")}</span>
                </label>
                <button
                  type="button"
                  className="path-dialog-hint-help-btn"
                  disabled={busy || effectiveKind !== "eidos"}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const docUrl = locale.startsWith("zh")
                      ? "https://docs.eidos.space/zh-cn/user-guide/file-metadata/"
                      : "https://docs.eidos.space/user-guide/file-metadata/"
                    void window.eidosLite?.openExternalUrl(docUrl)
                  }}
                  title={t(
                    "Manage file metadata directly in the current folder with custom fields and visual views."
                  )}
                  aria-label={t("Learn more in documentation")}
                >
                  <CircleHelp className="path-dialog-hint-help-icon" />
                </button>
              </div>
            ) : state.action === "create-linked-note" ? (
              <div className="path-dialog-hint">
                <p>
                  {t(
                    "This note does not exist. Create an empty Markdown file at this path? Existing folders are required."
                  )}
                </p>
              </div>
            ) : null}
          </div>
        )}
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>
            {t("Cancel")}
          </button>
          <button
            type="submit"
            className={destructive ? "danger-action" : "primary-action"}
            disabled={busy || (!destructive && !value.trim())}
          >
            {busy ? <LoaderCircle className="spin" /> : null}
            {busy ? t("Working…") : config.action}
          </button>
        </footer>
      </form>
    </div>
  )
}
