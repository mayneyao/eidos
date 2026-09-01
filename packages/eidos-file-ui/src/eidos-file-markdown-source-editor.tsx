import { useEffect, useState } from "react"

import { useEidosFileUI } from "./context"
import { Textarea } from "./ui/primitives"

export function EidosFileMarkdownSourceEditor({
  cacheKey,
  content,
  disabled,
  onChange,
}: {
  cacheKey: string
  content: string
  disabled: boolean
  onChange: (content: string) => void
}) {
  const { renderMarkdownSourceEditor, translate: t } = useEidosFileUI()
  const [draft, setDraft] = useState(content)

  useEffect(() => setDraft(content), [content])

  const hostEditor = renderMarkdownSourceEditor?.({
    cacheKey,
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
