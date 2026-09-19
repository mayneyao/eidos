import { useEffect, useRef, useState } from "react"

import { useEidosFileUI } from "./context"
import { Textarea } from "./ui/primitives"

export function EidosFileMarkdownSourceEditor({
  cacheKey,
  content,
  disabled,
  onChange,
  focusRequestToken = 0,
}: {
  cacheKey: string
  content: string
  disabled: boolean
  onChange: (content: string) => void
  focusRequestToken?: number
}) {
  const {
    renderMarkdownEditor,
    renderMarkdownSourceEditor,
    translate: t,
  } = useEidosFileUI()
  const [draft, setDraft] = useState(content)
  const fallbackRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (focusRequestToken > 0) fallbackRef.current?.focus()
  }, [focusRequestToken])

  useEffect(() => setDraft(content), [content])

  const hostEditor = (renderMarkdownEditor ?? renderMarkdownSourceEditor)?.({
    cacheKey,
    focusRequestToken,
    content: draft,
    disabled,
    onChange: (nextContent) => {
      setDraft(nextContent)
      onChange(nextContent)
    },
  })

  return (
    <div
      className={`min-h-0 flex-1${
        disabled ? " pointer-events-none opacity-60" : ""
      }`}
      aria-disabled={disabled || undefined}
      aria-label={t("Markdown content")}
      data-eidos-file-markdown-source-editor={hostEditor ? "host" : "fallback"}
    >
      {hostEditor ?? (
        <Textarea
          ref={fallbackRef}
          autoFocus
          value={draft}
          disabled={disabled}
          aria-label={t("Markdown content")}
          className="h-full min-h-0 resize-none overflow-auto rounded-none border-0 bg-transparent px-0 py-2 font-mono text-[15px] leading-7 shadow-none focus-visible:ring-0"
          onChange={(event) => {
            const nextContent = event.currentTarget.value
            setDraft(nextContent)
            onChange(nextContent)
          }}
        />
      )}
    </div>
  )
}
