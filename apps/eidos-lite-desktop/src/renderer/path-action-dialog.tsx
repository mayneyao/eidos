import { useEffect, useId, useRef, useState } from "react"
import { ChevronRight, CircleHelp, LoaderCircle, X } from "lucide-react"
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
  const [includeContent, setIncludeContent] = useState(false)
  const contentHintId = useId()
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

  const effectiveIsFileTable =
    !pluginTemplate &&
    selectedKind === "eidos" &&
    (isFileTable || isFilesEidosName)

  const currentTemplateId: FileTemplateId = (() => {
    if (pluginTemplate) return `plugin:${pluginTemplate}`
    if (selectedKind === "eidos") {
      return effectiveIsFileTable ? "files-index" : "eidos"
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
      select: () => handleSelectKind(kind),
    })),
    ...templates.map((template) => ({
      id: `plugin:${template.key}`,
      title: template.title,
      extension: template.extension,
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
            if (currentTemplateId === "eidos" && includeContent) {
              onSubmit(value, currentTemplateId, t("Content"))
            } else {
              onSubmit(
                effectiveIsFileTable ? "files.eidos" : value,
                currentTemplateId
              )
            }
          } else {
            onSubmit(value)
          }
        }}
      >
        <header>
          <strong>{config.title}</strong>
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
                  {typeOptions.map((option) => (
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
                      <span>{option.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <label>
              <span>{config.label}</span>
              <input
                ref={nameInput}
                autoFocus
                value={
                  state.action === "create-file" && effectiveIsFileTable
                    ? "files.eidos"
                    : value
                }
                onChange={(event) => setValue(event.target.value)}
                disabled={busy}
                readOnly={
                  state.action === "create-linked-note" ||
                  (state.action === "create-file" && effectiveIsFileTable)
                }
              />
            </label>
            {state.action === "create-file" ? (
              !pluginTemplate && selectedKind === "eidos" ? (
                <details className="path-dialog-options">
                  <summary>
                    <ChevronRight aria-hidden="true" />
                    {t("Advanced options")}
                  </summary>
                  <div className="path-dialog-options-fields">
                    <div className="path-dialog-metadata">
                      <label className="path-dialog-option-label">
                        <input
                          type="checkbox"
                          checked={effectiveIsFileTable}
                          onChange={handleToggleFileTable}
                          disabled={busy}
                        />
                        <span>{t("Manage folder file metadata")}</span>
                      </label>
                      <button
                        type="button"
                        className="path-dialog-hint-help-btn"
                        disabled={busy}
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
                    {!effectiveIsFileTable ? (
                      <div>
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
                        <p
                          id={contentHintId}
                          className="path-dialog-option-hint"
                        >
                          {t(
                            "Adds a Text field for record content. You can change the Content field in Table settings at any time."
                          )}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null
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
