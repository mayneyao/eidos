import {
  ChevronRight,
  Code2,
  FileText,
  FolderOpen,
  PencilLine,
} from "lucide-react"
import { useState } from "react"

import type {
  EidosLiteMarkdownEditingMode,
  SpaceTreeEntry,
} from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"
import { isMarkdownTextFile } from "./text-editor-options"

export function SpaceEntryOpenMenuItems({
  entry,
  onOpen,
}: {
  entry: SpaceTreeEntry
  onOpen(markdownEditingMode?: EidosLiteMarkdownEditingMode): void
}) {
  const { t } = useEidosLiteI18n()
  const [openWithVisible, setOpenWithVisible] = useState(false)

  if (entry.kind === "directory") return null

  return (
    <>
      <button type="button" role="menuitem" onClick={() => onOpen()}>
        <FolderOpen aria-hidden="true" />
        {t("Open")}
      </button>
      {isMarkdownTextFile(entry.relativePath) ? (
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
                onClick={() => onOpen("wysiwyg")}
              >
                <PencilLine aria-hidden="true" />
                {t("Rich text")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
