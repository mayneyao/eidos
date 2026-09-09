import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  applySourceTextareaCommand,
  markdownShortcutAriaKeys,
  MarkdownEditor,
  matchesMarkdownShortcut,
  resolveMarkdownShortcuts,
  SOURCE_TEXTAREA_SHORTCUT_IDS,
  sourceTextareaCommandForEvent,
} from "@eidos.space/markdown"

import { PlaygroundOpfsImageStore } from "./opfs-image-store"
import { ShortcutReference } from "./shortcut-reference"
import "@eidos.space/markdown/styles.css"
import { useSiteLocale } from "./locale"
import { chineseEditorLabels } from "./editor-labels"
import { PLAYGROUND_MARKDOWN } from "./sample-markdown"
import logo from "../../../packages/markdown/assets/markdown-logo.svg?url&no-inline"

type TestablePlaygroundWindow = Window & {
  __EIDOS_MARKDOWN_TEST_DOCUMENT__?: string
  __EIDOS_MARKDOWN_TEST_PASTE_DELAY_MS__?: number
  __EIDOS_MARKDOWN_TEST_SET_DOCUMENT__?(markdown: string): void
  __EIDOS_MARKDOWN_TEST_VALUE__?: string
}

const PLAYGROUND_SHORTCUTS = resolveMarkdownShortcuts()

async function waitForPasteTestDelay(signal: AbortSignal): Promise<void> {
  const delay = (window as TestablePlaygroundWindow)
    .__EIDOS_MARKDOWN_TEST_PASTE_DELAY_MS__
  if (!delay) return
  await new Promise<void>((resolve, reject) => {
    const handle = window.setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, delay)
    const abort = () => {
      window.clearTimeout(handle)
      reject(new DOMException("Operation aborted", "AbortError"))
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}

function initialMarkdown(): string {
  const testWindow = window as TestablePlaygroundWindow
  const isLocalTestHost =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost"
  const value =
    isLocalTestHost &&
    typeof testWindow.__EIDOS_MARKDOWN_TEST_DOCUMENT__ === "string"
      ? testWindow.__EIDOS_MARKDOWN_TEST_DOCUMENT__
      : PLAYGROUND_MARKDOWN

  if (isLocalTestHost) testWindow.__EIDOS_MARKDOWN_TEST_VALUE__ = value
  return value
}

export function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("markdown-site-theme")
      if (saved === "light" || saved === "dark") return saved
    } catch {
      /* Storage is optional. */
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  })
  useEffect(() => {
    try {
      localStorage.setItem("markdown-site-theme", theme)
    } catch {
      /* Storage is optional. */
    }
  }, [theme])
  const embedded =
    new URLSearchParams(window.location.search).get("layout") === "embedded"
  const { locale, t } = useSiteLocale()
  const preset = "eidos" as const
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [readOnly, setReadOnly] = useState(false)
  const [viewMode, setViewMode] = useState<"visual" | "source">("visual")
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const pendingSourceSelectionRef = useRef<{
    end: number
    start: number
  } | null>(null)
  const imageStore = useMemo(() => new PlaygroundOpfsImageStore(), [])

  useLayoutEffect(() => {
    const selection = pendingSourceSelectionRef.current
    const source = sourceRef.current
    if (!selection || !source || viewMode !== "source") return
    pendingSourceSelectionRef.current = null
    source.focus({ preventScroll: true })
    source.setSelectionRange(selection.start, selection.end)
  }, [markdown, viewMode])

  useEffect(() => {
    const testWindow = window as TestablePlaygroundWindow
    const isLocalTestHost =
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost"
    if (!isLocalTestHost) return
    testWindow.__EIDOS_MARKDOWN_TEST_SET_DOCUMENT__ = (value) => {
      testWindow.__EIDOS_MARKDOWN_TEST_VALUE__ = value
      setMarkdown(value)
    }
    return () => {
      delete testWindow.__EIDOS_MARKDOWN_TEST_SET_DOCUMENT__
    }
  }, [])

  useEffect(() => () => imageStore.dispose(), [imageStore])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void imageStore.sweepUnusedImages(markdown).catch(console.error)
    }, 1_000)
    return () => window.clearTimeout(handle)
  }, [imageStore, markdown])

  const persistPastedImage = useCallback(
    async (
      request: Parameters<PlaygroundOpfsImageStore["persistImage"]>[0]
    ) => {
      await waitForPasteTestDelay(request.signal)
      return imageStore.persistImage(request)
    },
    [imageStore]
  )
  const resolveImageUrl = useCallback(
    (request: Parameters<PlaygroundOpfsImageStore["resolveImageUrl"]>[0]) =>
      imageStore.resolveImageUrl(request),
    [imageStore]
  )

  function handleMarkdownChange(value: string) {
    setMarkdown(value)
    if (
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost"
    ) {
      ;(window as TestablePlaygroundWindow).__EIDOS_MARKDOWN_TEST_VALUE__ =
        value
    }
  }

  return (
    <main
      id="site-main"
      className="playground-shell"
      data-theme={theme}
      tabIndex={-1}
    >
      <header className="playground-header">
        <div className="playground-identity">
          <img src={logo} alt="" width="24" height="24" />
          <h1>{t("Markdown Editor Playground", "Markdown 编辑器交互体验")}</h1>
        </div>
        <div className="playground-actions">
          <ShortcutReference />
          <button
            type="button"
            className="playground-mode-trigger"
            aria-pressed={viewMode === "source"}
            onClick={() =>
              setViewMode((current) =>
                current === "visual" ? "source" : "visual"
              )
            }
          >
            {viewMode === "visual"
              ? t("View source", "查看源码")
              : t("View editor", "返回编辑器")}
          </button>
          <label className="playground-switch">
            <span>{t("Read only", "只读")}</span>
            <input
              type="checkbox"
              role="switch"
              checked={readOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
            />
            <span className="playground-switch-track" aria-hidden="true" />
          </label>
          <button
            type="button"
            className="playground-mode-trigger"
            aria-label={
              theme === "light"
                ? t("Switch to dark theme", "切换到深色主题")
                : t("Switch to light theme", "切换到浅色主题")
            }
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? t("Dark", "深色") : t("Light", "浅色")}
          </button>
        </div>
      </header>
      <div
        className="playground-content"
        data-markdown-selection-canvas={embedded ? "" : undefined}
        style={
          embedded ? { overflowY: "auto", padding: "100px 80px 0" } : undefined
        }
      >
        {viewMode === "visual" ? (
          <MarkdownEditor
            layout={embedded ? "embedded" : "document"}
            profile={preset}
            theme={theme}
            documentKey="playground"
            markdown={markdown}
            baseUri={window.location.href}
            ariaLabel={t(
              "Markdown playground editor",
              "Markdown 交互体验编辑器"
            )}
            placeholder={t("Write with Markdown…", "用 Markdown 开始书写…")}
            labels={locale === "zh" ? chineseEditorLabels : undefined}
            readOnly={readOnly}
            onMarkdownChange={handleMarkdownChange}
            onPasteImage={persistPastedImage}
            resolveImageUrl={resolveImageUrl}
            onOpenExternalUrl={(url) => {
              window.open(url, "_blank", "noopener,noreferrer")
            }}
          />
        ) : (
          <section
            className="playground-source"
            aria-label={t("Source editor", "源码编辑器")}
          >
            <textarea
              ref={sourceRef}
              autoFocus
              aria-label={t("Markdown source", "Markdown 源码")}
              aria-keyshortcuts={markdownShortcutAriaKeys(
                SOURCE_TEXTAREA_SHORTCUT_IDS,
                PLAYGROUND_SHORTCUTS
              )}
              value={markdown}
              readOnly={readOnly}
              spellCheck={false}
              onKeyDown={(event) => {
                if (readOnly) return
                const command = sourceTextareaCommandForEvent(
                  event,
                  (keyboardEvent, id) =>
                    matchesMarkdownShortcut(
                      keyboardEvent,
                      id,
                      PLAYGROUND_SHORTCUTS
                    )
                )
                if (!command) return
                event.preventDefault()
                const textarea = event.currentTarget
                const next = applySourceTextareaCommand(
                  {
                    value: textarea.value,
                    selectionStart: textarea.selectionStart,
                    selectionEnd: textarea.selectionEnd,
                  },
                  command
                )
                if (next.value !== textarea.value) {
                  pendingSourceSelectionRef.current = {
                    start: next.selectionStart,
                    end: next.selectionEnd,
                  }
                  handleMarkdownChange(next.value)
                } else {
                  textarea.setSelectionRange(
                    next.selectionStart,
                    next.selectionEnd
                  )
                }
              }}
              onChange={(event) => handleMarkdownChange(event.target.value)}
            />
          </section>
        )}
      </div>
    </main>
  )
}
