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
import { useSiteLocale } from "./site/locale"
import { chineseEditorLabels } from "./site/editor-labels"
import { PresetSelect } from "./site/preset-select"
import { presetFromSearch, presets, updatePresetUrl } from "./site/presets"
import { presetSample } from "./site/preset-samples"

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
      : presetSample(presetFromSearch())

  if (isLocalTestHost) testWindow.__EIDOS_MARKDOWN_TEST_VALUE__ = value
  return value
}

export function App({ theme = "light" }: { theme?: "light" | "dark" }) {
  const { locale, t, href } = useSiteLocale()
  const [preset, setPreset] = useState(() => presetFromSearch())
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [previousDraft, setPreviousDraft] = useState<string | null>(null)
  useEffect(() => {
    const syncPreset = () => setPreset(presetFromSearch())
    window.addEventListener("popstate", syncPreset)
    return () => window.removeEventListener("popstate", syncPreset)
  }, [])
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
      void imageStore
        .sweepUnusedImages(`${markdown}\n${previousDraft ?? ""}`)
        .catch(console.error)
    }, 1_000)
    return () => window.clearTimeout(handle)
  }, [imageStore, markdown, previousDraft])

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
          <h1>{t("Markdown Editor Playground", "Markdown 编辑器交互体验")}</h1>
          <p className="playground-preset-description">
            {presets.find((entry) => entry.id === preset)?.[locale]}
          </p>
        </div>
        <div className="playground-actions">
          <PresetSelect
            value={preset}
            onChange={(next) => {
              setPreset(next)
              updatePresetUrl(next)
            }}
          />
          <a
            className="playground-mode-trigger"
            href={`${href("/spec")}?preset=${preset}`}
          >
            {t("Syntax reference", "语法对照")}
          </a>
          <ShortcutReference />
          <button
            type="button"
            className="playground-mode-trigger"
            disabled={readOnly}
            onClick={() => {
              setPreviousDraft(markdown)
              handleMarkdownChange(presetSample(preset))
            }}
          >
            {t("Load preset example", "载入预设示例")}
          </button>
          {previousDraft !== null && (
            <button
              type="button"
              className="playground-mode-trigger"
              disabled={readOnly}
              onClick={() => {
                handleMarkdownChange(previousDraft)
                setPreviousDraft(null)
              }}
            >
              {t("Restore previous draft", "恢复之前的草稿")}
            </button>
          )}
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
        </div>
      </header>
      <div className="playground-content">
        {viewMode === "visual" ? (
          <MarkdownEditor
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
