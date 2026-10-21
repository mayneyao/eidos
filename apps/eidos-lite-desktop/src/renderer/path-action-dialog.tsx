import { useEffect, useId, useRef, useState } from "react"
import {
  FileText,
  LayoutTemplate,
  LoaderCircle,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react"
import type { SpaceTreeEntry } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

type PathDialogAction =
  | "create-file"
  | "create-folder"
  | "create-linked-note"
  | "delete"

type FileKind = "eidos" | "text"
export type FileTemplateId =
  | "eidos"
  | "files-index"
  | "text"
  | `plugin:${string}`

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
  onSubmit(
    value: string,
    template?: FileTemplateId,
    contentFieldName?: string
  ): void
}) {
  const { t } = useEidosLiteI18n()
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
  const [includeContent, setIncludeContent] = useState(false)
  const contentHintId = useId()
  const titleId = useId()
  const [templates, setTemplates] = useState<
    Array<{ key: string; title: string; extension: string }>
  >([])
  const [pluginTemplate, setPluginTemplate] = useState<string | null>(null)
  useEffect(() => {
    if (state.action !== "create-file" || !window.eidosLite?.listPlugins) return
    let active = true
    const refresh = () =>
      void window.eidosLite
        .listPlugins()
        .then((listing) => {
          if (active)
            setTemplates(
              listing.plugins
                .filter((p) => p.enabled && !p.unavailable)
                .flatMap((p) =>
                  (p.manifest.fileTemplates ?? []).map((item) => ({
                    key: `${p.manifest.id}/${item.id}`,
                    title: item.title,
                    extension: item.extension,
                  }))
                )
            )
        })
        .catch(() => {})
    refresh()
    const unsubscribe = window.eidosLite.onPluginEvent?.(({ event }) => {
      if (event.observation === "host.catalog") refresh()
    })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [state.action])
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (state.action !== "create-file") return
    const input = nameInput.current
    if (!input) return
    const extension = input.value.lastIndexOf(".")
    input.setSelectionRange(0, extension > 0 ? extension : input.value.length)
  }, [state.action])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return
      event.preventDefault()
      onCancel()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [busy, onCancel])
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

  const currentTemplateId: FileTemplateId = (() => {
    if (pluginTemplate) return `plugin:${pluginTemplate}`
    if (selectedKind === "eidos") {
      return "eidos"
    }
    return "text"
  })()

  const handleSelectKind = (kind: FileKindOption) => {
    if (!pluginTemplate && kind.id === selectedKind) return
    setPluginTemplate(null)
    setSelectedKind(kind.id)
    setValue((current) => {
      const extension = current.lastIndexOf(".")
      const name = extension > 0 ? current.slice(0, extension) : current
      return `${name || "Untitled"}.${kind.id === "eidos" ? "eidos" : "md"}`
    })
  }

  const typeOptions = [
    ...fileKinds.map((kind) => ({
      id: kind.id,
      title: kind.label,
      extension: kind.id === "eidos" ? ".eidos" : ".md",
      icon: (kind.id === "eidos" ? Table2 : FileText) as LucideIcon,
      select: () => handleSelectKind(kind),
    })),
    ...templates.map((template) => ({
      id: `plugin:${template.key}`,
      title: template.title,
      extension: template.extension,
      icon: LayoutTemplate as LucideIcon,
      select: () => {
        if (pluginTemplate === template.key) return
        setPluginTemplate(template.key)
        setSelectedKind("text")
        setValue((current) => {
          const extension = current.lastIndexOf(".")
          const name = extension > 0 ? current.slice(0, extension) : current
          return `${name || "Untitled"}${template.extension}`
        })
      },
    })),
  ]
  const selectedType = pluginTemplate
    ? `plugin:${pluginTemplate}`
    : selectedKind

  return (
    <div
      className="path-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <form
        className="path-dialog"
        data-action={state.action}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={config.title}
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          if (state.action === "create-file") {
            if (currentTemplateId === "eidos" && includeContent) {
              onSubmit(value, currentTemplateId, t("Content"))
            } else {
              onSubmit(value, currentTemplateId)
            }
          } else {
            onSubmit(value)
          }
        }}
      >
        <header>
          <strong id={titleId}>{config.title}</strong>
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
            {state.action === "create-file" ? (
              <div className="path-dialog-types">
                <p className="path-dialog-section-label">{t("Type")}</p>
                <div
                  className="path-dialog-templates"
                  role="radiogroup"
                  aria-label={t("File type")}
                  onKeyDown={(event) => {
                    if (
                      busy ||
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                        "Home",
                        "End",
                      ].includes(event.key)
                    )
                      return
                    event.preventDefault()
                    const index = typeOptions.findIndex(
                      (item) => item.id === selectedType
                    )
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? typeOptions.length - 1
                          : (index +
                              (event.key === "ArrowLeft" ||
                              event.key === "ArrowUp"
                                ? -1
                                : 1) +
                              typeOptions.length) %
                            typeOptions.length
                    typeOptions[next]!.select()
                    event.currentTarget
                      .querySelectorAll<HTMLButtonElement>('[role="radio"]')
                      [next]?.focus()
                  }}
                >
                  {typeOptions.map((option) => {
                    const Icon = option.icon
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selectedType === option.id}
                        aria-label={`${option.title} (${option.extension})`}
                        title={`${option.title} (${option.extension})`}
                        tabIndex={selectedType === option.id ? 0 : -1}
                        disabled={busy}
                        className="path-dialog-template-btn"
                        onClick={option.select}
                      >
                        <Icon aria-hidden="true" />
                        <span>{option.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

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
            {state.action === "create-file" &&
            !pluginTemplate &&
            selectedKind === "eidos" ? (
              <div className="path-dialog-advanced">
                <label className="path-dialog-option-label">
                  <input
                    type="checkbox"
                    checked={includeContent}
                    onChange={(event) =>
                      setIncludeContent(event.target.checked)
                    }
                    disabled={busy}
                    aria-describedby={contentHintId}
                  />
                  <span>{t("Include Markdown content")}</span>
                </label>
                <p id={contentHintId} className="path-dialog-option-hint">
                  {t(
                    "Adds a Text field for record content, editable with the Markdown editor."
                  )}
                </p>
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
