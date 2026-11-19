import { useCallback, useEffect, useState } from "react"
import notes from "../../RELEASE_NOTES.md?raw"
import chineseNotes from "../../RELEASE_NOTES.zh-CN.md?raw"
import metadata from "../../package.json"
import demoReceipts from "../../release-demos.json"
import {
  demoLinkLabel,
  demoSections,
  isReleaseDemo,
  type NotesLocale,
  type ReleaseDemo,
} from "../shared/release-demos"
import { useEidosLiteI18n } from "./i18n"
import { renderSafeMarkdown } from "./markdown-preview"
import {
  closeCurrentPage,
  navigateCurrentWindow,
  NAVIGATION_EVENT,
  parseNavigationHash,
} from "./navigation-history"

const storageKey = "eidos-lite:whats-new:acknowledged"
export const releaseVersion = metadata.version
const releaseDemos = (
  Array.isArray(demoReceipts) ? (demoReceipts as unknown[]) : []
).filter((demo): demo is ReleaseDemo =>
  isReleaseDemo(demo, `lite-v${releaseVersion}`)
)

function DemoVideo({
  demo,
  locale,
}: {
  demo: ReleaseDemo
  locale: NotesLocale
}) {
  const [failed, setFailed] = useState(false)
  const { src, poster, width, height, alt, caption } = demo.media
  return (
    <figure className="whats-new-demo">
      {failed ? (
        <img
          src={poster}
          alt={alt[locale]}
          width={width}
          height={height}
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      ) : (
        <video
          src={src}
          poster={poster}
          width={width}
          height={height}
          aria-label={alt[locale]}
          controls
          playsInline
          preload="none"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>
        <a href={src} data-markdown-external="true">
          {demoLinkLabel[locale]}
        </a>
        {" · "}
        {caption[locale]}
      </figcaption>
    </figure>
  )
}

export function hasUnseenRelease(
  previous: string | null,
  current: string
): boolean {
  return previous !== null && previous !== current
}

export function useWhatsNew() {
  const isOpen = () => {
    const location = parseNavigationHash(window.location.hash)?.location
    return typeof location === "object" && location?.type === "whats-new"
  }
  const [open, setOpen] = useState(isOpen)
  const [unread, setUnread] = useState(false)
  const close = useCallback(closeCurrentPage, [])
  useEffect(() => {
    const refresh = () => setOpen(isOpen())
    window.addEventListener("popstate", refresh)
    window.addEventListener(NAVIGATION_EVENT, refresh)
    return () => {
      window.removeEventListener("popstate", refresh)
      window.removeEventListener(NAVIGATION_EVENT, refresh)
    }
  }, [])
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
      navigateCurrentWindow({ type: "whats-new" })
    })
    return () => {
      window.removeEventListener("storage", refresh)
      unsubscribe()
    }
  }, [])
  return {
    open,
    unread,
    close,
    dismiss: acknowledge,
    show: () => {
      acknowledge()
      navigateCurrentWindow({ type: "whats-new" })
    },
  }
}

export function WhatsNewPage({ standalone = false }: { standalone?: boolean }) {
  const { t, locale } = useEidosLiteI18n()
  useEffect(() => {
    if (!standalone) return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        document.title = t("Release notes")
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [standalone, t])
  useEffect(() => {
    if (!standalone) return
    try {
      localStorage.setItem(storageKey, releaseVersion)
    } catch {
      /* Storage can be unavailable. */
    }
  }, [standalone])
  const readLocale = (): "en" | "zh" | null => {
    const location = parseNavigationHash(window.location.hash)?.location
    return typeof location === "object" &&
      location?.type === "whats-new" &&
      location.lang
      ? location.lang === "zh-CN"
        ? "zh"
        : "en"
      : null
  }
  const [selectedLocale, setSelectedLocale] = useState(readLocale)
  useEffect(() => {
    const refresh = () => setSelectedLocale(readLocale())
    window.addEventListener("popstate", refresh)
    window.addEventListener(NAVIGATION_EVENT, refresh)
    return () => {
      window.removeEventListener("popstate", refresh)
      window.removeEventListener(NAVIGATION_EVENT, refresh)
    }
  }, [])
  const notesLocale = selectedLocale ?? (locale === "zh" ? "zh" : "en")
  const languages =
    notesLocale === "zh"
      ? "**中文** · [English](#whats-new-en)"
      : "[中文](#whats-new-zh) · **English**"
  const fallback =
    locale !== "en" && locale !== "zh" && selectedLocale === null
      ? `${t("Release notes are available in English and Chinese.")}\n\n`
      : ""
  const content = `# Eidos Lite ${releaseVersion}\n\n${t("Current version")} · ${languages}\n\n${fallback}${notesLocale === "zh" ? chineseNotes : notes}\n\n[${t("View full release notes")} ↗](https://github.com/mayneyao/eidos/releases/tag/lite-v${releaseVersion})\n`
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
        if (standalone) return
        navigateCurrentWindow(
          {
            type: "whats-new",
            lang: href === "#whats-new-zh" ? "zh-CN" : "en",
          },
          true
        )
      }}
    >
      <div className="markdown-preview-scroll">
        <article
          className="markdown-document"
          onClick={(event) => {
            if (!(event.target instanceof Element)) return
            const link = event.target.closest<HTMLAnchorElement>(
              "a[data-markdown-external='true']"
            )
            if (!link) return
            event.preventDefault()
            void window.eidosLite.openExternalUrl(link.href)
          }}
        >
          {demoSections(content, releaseDemos, notesLocale).map(
            (section, index) =>
              Array.isArray(section) ? (
                <div
                  className="whats-new-prose"
                  key={index}
                  dangerouslySetInnerHTML={{
                    __html: renderSafeMarkdown(section),
                  }}
                />
              ) : (
                <DemoVideo
                  key={section.scenarioId}
                  demo={section}
                  locale={notesLocale}
                />
              )
          )}
        </article>
      </div>
    </section>
  )
}
