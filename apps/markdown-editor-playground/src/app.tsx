import { useCallback, useEffect, useMemo, useState } from "react"
import { MarkdownEditor } from "@eidos.space/markdown"

import { PLAYGROUND_MARKDOWN } from "./sample-markdown"
import { PlaygroundOpfsImageStore } from "./opfs-image-store"
import { ShortcutReference } from "./shortcut-reference"

type TestablePlaygroundWindow = Window & {
  __EIDOS_MARKDOWN_TEST_DOCUMENT__?: string
  __EIDOS_MARKDOWN_TEST_PASTE_DELAY_MS__?: number
  __EIDOS_MARKDOWN_TEST_SET_DOCUMENT__?(markdown: string): void
  __EIDOS_MARKDOWN_TEST_VALUE__?: string
}

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
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [readOnly, setReadOnly] = useState(false)
  const imageStore = useMemo(() => new PlaygroundOpfsImageStore(), [])

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
    <main className="playground-shell">
      <header className="playground-header">
        <h1>Markdown Editor Playground</h1>
        <div className="playground-actions">
          <ShortcutReference />
          <label className="playground-switch">
            <span>Read only</span>
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
        <MarkdownEditor
          documentKey="playground"
          markdown={markdown}
          baseUri={window.location.href}
          ariaLabel="Markdown playground editor"
          readOnly={readOnly}
          onMarkdownChange={handleMarkdownChange}
          onPasteImage={persistPastedImage}
          resolveImageUrl={resolveImageUrl}
          onOpenExternalUrl={(url) => {
            window.open(url, "_blank", "noopener,noreferrer")
          }}
        />
      </div>
    </main>
  )
}
