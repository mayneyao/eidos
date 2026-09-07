import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { MarkdownEditorLabels } from "../types"
import { findDocumentRanges, revealTextMatch } from "../ui/document-find"

export function DocumentFindPlugin({
  labels,
}: {
  labels: Pick<
    MarkdownEditorLabels,
    | "findInDocument"
    | "noTextMatches"
    | "previousMatch"
    | "nextMatch"
    | "closeFind"
  >
}) {
  const [editor] = useLexicalComposerContext()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const [revision, setRevision] = useState(0)
  const result = useMemo(() => {
    const root = editor.getRootElement()
    return open && root
      ? findDocumentRanges(root, query)
      : { ranges: [], limited: false }
  }, [editor, open, query, revision])
  const activeIndex = Math.min(index, Math.max(0, result.ranges.length - 1))
  const input = useRef<HTMLInputElement>(null)
  const id = `eme-find-${useId().replace(/[^a-z0-9]/gi, "")}`

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault()
        event.stopPropagation()
        setOpen(true)
        requestAnimationFrame(() => {
          input.current?.focus({ preventScroll: true })
          input.current?.select()
        })
      }
    }
    return editor.registerRootListener((root, previous) => {
      previous?.removeEventListener("keydown", handle, true)
      root?.addEventListener("keydown", handle, true)
    })
  }, [editor])

  useEffect(() => {
    if (!open) return
    input.current?.focus({ preventScroll: true })
    const root = editor.getRootElement()
    if (!root) return
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setRevision((current) => current + 1))
    })
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "class"],
    })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [editor, open])

  useEffect(() => {
    const highlights = globalThis.CSS?.highlights
    const active = result.ranges[activeIndex]
    if (active && typeof active.getBoundingClientRect === "function")
      revealTextMatch(active)
    if (!highlights || typeof Highlight === "undefined") return
    highlights.set(id, new Highlight(...result.ranges))
    highlights.set(`${id}-active`, new Highlight(...(active ? [active] : [])))
    return () => {
      highlights.delete(id)
      highlights.delete(`${id}-active`)
    }
  }, [id, activeIndex, result])

  const close = () => {
    setOpen(false)
    editor.getRootElement()?.focus({ preventScroll: true })
  }
  const navigate = (direction: number) =>
    setIndex((current) =>
      result.ranges.length
        ? (Math.min(current, result.ranges.length - 1) +
            direction +
            result.ranges.length) %
          result.ranges.length
        : 0
    )
  if (!open) return null
  return (
    <div
      className="eme-document-find"
      role="search"
      aria-label={labels.findInDocument}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === "Escape") {
          event.preventDefault()
          close()
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "f"
        ) {
          event.preventDefault()
          input.current?.focus({ preventScroll: true })
          input.current?.select()
        }
        event.stopPropagation()
      }}
    >
      <style>{`::highlight(${id}) { background-color: var(--eme-highlight); } ::highlight(${id}-active) { background-color: var(--eme-selection); text-decoration: underline; }`}</style>
      <input
        ref={input}
        aria-label={labels.findInDocument}
        placeholder={labels.findInDocument}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setIndex(0)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault()
            navigate(event.shiftKey ? -1 : 1)
          }
        }}
      />
      <span
        role="status"
        aria-live="polite"
        title={
          query && !result.ranges.length ? labels.noTextMatches : undefined
        }
      >
        {result.ranges.length
          ? `${activeIndex + 1} / ${result.ranges.length}${result.limited ? "+" : ""}`
          : query
            ? labels.noTextMatches
            : "0 / 0"}
      </span>
      <button
        type="button"
        aria-label={labels.previousMatch}
        title={`${labels.previousMatch} (Shift+Enter)`}
        disabled={!result.ranges.length}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => navigate(-1)}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M8 13V3m-4 4 4-4 4 4" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={labels.nextMatch}
        title={`${labels.nextMatch} (Enter)`}
        disabled={!result.ranges.length}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => navigate(1)}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M8 3v10m-4-4 4 4 4-4" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={labels.closeFind}
        title={`${labels.closeFind} (Esc)`}
        onClick={close}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="m4 4 8 8m0-8-8 8" />
        </svg>
      </button>
    </div>
  )
}
