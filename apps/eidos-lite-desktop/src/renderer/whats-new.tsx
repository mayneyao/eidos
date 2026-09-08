import { useEffect, useState } from "react"
import notes from "../../RELEASE_NOTES.md?raw"
import chineseNotes from "../../RELEASE_NOTES.zh-CN.md?raw"
import metadata from "../../package.json"
import { useEidosLiteI18n } from "./i18n"
import { MarkdownEditorSurface } from "./markdown-editor-surface"
import type { ResolvedAppearance } from "./app-appearance"

const storageKey = "eidos-lite:whats-new:acknowledged"
export const releaseVersion = metadata.version

export function hasUnseenRelease(
  previous: string | null,
  current: string
): boolean {
  return previous !== null && previous !== current
}

export function useWhatsNew() {
  const [open, setOpen] = useState(window.location.hash === "#/whats-new")
  const [unread, setUnread] = useState(false)
  const acknowledge = () => {
    try {
      localStorage.setItem(storageKey, releaseVersion)
    } catch {
      /* Storage can be unavailable. */
    }
    setUnread(false)
  }
  useEffect(() => {
    const refresh = () => {
      try {
        const previous = localStorage.getItem(storageKey)
        setUnread(hasUnseenRelease(previous, releaseVersion))
        if (previous === null) localStorage.setItem(storageKey, releaseVersion)
      } catch {
        setUnread(false)
      }
    }
    refresh()
    window.addEventListener("storage", refresh)
    const unsubscribe = window.eidosLite.onWhatsNew(() => {
      acknowledge()
      setOpen(true)
    })
    return () => {
      window.removeEventListener("storage", refresh)
      unsubscribe()
    }
  }, [])
  return {
    open,
    unread,
    close: () => setOpen(false),
    dismiss: acknowledge,
    show: () => {
      acknowledge()
      setOpen(true)
    },
  }
}

export function WhatsNewPage({
  theme = "light",
}: {
  theme?: ResolvedAppearance
}) {
  const { t, locale } = useEidosLiteI18n()
  const [selectedLocale, setSelectedLocale] = useState<"en" | "zh" | null>(null)
  const notesLocale = selectedLocale ?? locale
  const languages =
    notesLocale === "zh"
      ? "**中文** · [English](#whats-new-en)"
      : "[中文](#whats-new-zh) · **English**"
  const content = `# Eidos Lite ${releaseVersion}\n\n${t("Current version")} · ${languages}\n\n${notesLocale === "zh" ? chineseNotes : notes}\n\n[${t("View full release notes")} ↗](https://github.com/mayneyao/eidos/releases/tag/lite-v${releaseVersion})\n`
  return (
    <section
      className="whats-new-page"
      aria-label={t("What's new")}
      onClickCapture={(event) => {
        if (!(event.target instanceof Element)) return
        const href = event.target.closest("a")?.getAttribute("href")
        if (href !== "#whats-new-en" && href !== "#whats-new-zh") return
        event.preventDefault()
        event.stopPropagation()
        setSelectedLocale(href === "#whats-new-zh" ? "zh" : "en")
      }}
    >
      <MarkdownEditorSurface
        documentKey={`whats-new:${releaseVersion}:${notesLocale}`}
        relativePath="RELEASE_NOTES.md"
        content={content}
        editingMode="wysiwyg"
        theme={theme}
        layout="document"
        disabled
        autoFocus={false}
        onChange={() => {}}
      />
    </section>
  )
}
