import {
  ChevronRight,
  Code2,
  FileText,
  FolderOpen,
  PencilLine,
  Eye,
} from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import type {
  EidosLiteMarkdownEditingMode,
  SpaceTreeEntry,
} from "../shared/contracts"
import type { PluginEditorChoice } from "../shared/plugins"
import { useEidosLiteI18n } from "./i18n"
import { isMarkdownTextFile } from "./text-editor-options"
import { PluginFileActions } from "./plugin-manager"

export function SpaceEntryOpenMenuItems({
  entry,
  editingModeShortcut,
  onOpen,
  pluginEditors,
  hasPluginEditors,
}: {
  entry: SpaceTreeEntry
  editingModeShortcut?: string
  onOpen(mode?: EidosLiteMarkdownEditingMode | "preview"): void
  pluginEditors?: ReactNode
  hasPluginEditors?: boolean
}) {
  const { t } = useEidosLiteI18n()
  const [openWithVisible, setOpenWithVisible] = useState(false)
  const html = /\.html?$/iu.test(entry.relativePath)

  if (entry.kind === "directory") return null

  const hasAnyPluginEditors = hasPluginEditors ?? Boolean(pluginEditors)
  const showOpenWith =
    isMarkdownTextFile(entry.relativePath) || html || hasAnyPluginEditors

  return (
    <>
      <button type="button" role="menuitem" onClick={() => onOpen()}>
        <FolderOpen aria-hidden="true" />
        {t("Open")}
      </button>
      {showOpenWith ? (
        <div
          className="space-context-menu-submenu-trigger"
          role="none"
          onPointerEnter={() => setOpenWithVisible(true)}
          onPointerLeave={() => setOpenWithVisible(false)}
        >
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openWithVisible}
            onClick={() => setOpenWithVisible(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault()
                setOpenWithVisible(true)
              }
            }}
          >
            <FileText aria-hidden="true" />
            {t("Open with")}
            {!html && editingModeShortcut && editingModeShortcut !== "—" ? (
              <kbd className="space-context-menu-shortcut" aria-hidden="true">
                {editingModeShortcut}
              </kbd>
            ) : null}
            <ChevronRight
              className="space-context-menu-submenu-chevron"
              aria-hidden="true"
            />
          </button>
          {openWithVisible ? (
            <div
              className="space-context-menu-submenu"
              role="menu"
              aria-label={`${t("Open with")} ${entry.name}`}
            >
              {(isMarkdownTextFile(entry.relativePath) || html) && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onOpen("source")}
                  >
                    <Code2 aria-hidden="true" />
                    {t("Source")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onOpen(html ? "preview" : "wysiwyg")}
                  >
                    {html ? (
                      <Eye aria-hidden="true" />
                    ) : (
                      <PencilLine aria-hidden="true" />
                    )}
                    {t(html ? "Preview" : "Rich text")}
                  </button>
                </>
              )}
              {pluginEditors}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

export function SpaceEntryOpenActions({
  entry,
  selectedEditor,
  editingModeShortcut,
  onOpen,
  onSelectPluginEditor,
}: {
  entry: SpaceTreeEntry
  selectedEditor: string
  editingModeShortcut?: string
  onOpen(mode?: EidosLiteMarkdownEditingMode | "preview"): void
  onSelectPluginEditor(editor: string): void
}) {
  const [choices, setChoices] = useState<PluginEditorChoice[]>([])

  useEffect(() => {
    if (entry.kind !== "file" || !window.eidosLite?.pluginEditors) return
    let active = true
    const refresh = () => {
      void window.eidosLite
        .pluginEditors(entry.relativePath)
        .then((value) => {
          if (active) setChoices(value)
        })
        .catch(() => {})
    }
    refresh()
    const unsubscribe = window.eidosLite.onPluginEvent?.(({ event }) => {
      if (event.observation === "host.catalog") refresh()
    })
    window.addEventListener("eidos-plugins-changed", refresh)
    return () => {
      active = false
      unsubscribe?.()
      window.removeEventListener("eidos-plugins-changed", refresh)
    }
  }, [entry.kind, entry.relativePath])

  return (
    <SpaceEntryOpenMenuItems
      entry={entry}
      hasPluginEditors={choices.length > 0}
      pluginEditors={
        entry.kind === "file" && choices.length > 0 ? (
          <PluginFileActions
            relativePath={entry.relativePath}
            selected={selectedEditor}
            initialChoices={choices}
            onSelect={onSelectPluginEditor}
          />
        ) : undefined
      }
      editingModeShortcut={editingModeShortcut}
      onOpen={onOpen}
    />
  )
}
