import { useEffect, useId, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getRoot } from "lexical"
import { useEfmSourceBlockContext } from "../ui/efm-source-block-context"
import { findSourceTextRange } from "../ui/source-text-match"
import { revealTextMatch } from "../ui/document-find"
import type { MarkdownEditorNavigationTarget } from "../types"
import type { MarkdownInputMode } from "../core/document-contract"

export function RequestedTextSearchPlugin({
  target,
  markdown,
  inputProfile,
  syntaxFeatures,
  onUnavailable,
}: {
  target?: MarkdownEditorNavigationTarget
  markdown: string
  inputProfile: MarkdownInputMode
  syntaxFeatures: ReadonlySet<string>
  onUnavailable?: () => void
}) {
  const [editor] = useLexicalComposerContext()
  const { codec } = useEfmSourceBlockContext()
  const fallback = useRef(onUnavailable)
  const applied = useRef<string | null>(null)
  fallback.current = onUnavailable
  const id = `eme-source-match-${useId().replace(/[^a-z0-9]/gi, "")}`
  useEffect(() => {
    const match = target?.textSearch
    if (!match || applied.current === match.requestId) return
    let timer = 0
    const frame = requestAnimationFrame(() => {
      applied.current = match.requestId
      const normalize = (value: string) =>
        value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n")
      const start = normalize(markdown.slice(0, match.start)).length
      const end = normalize(markdown.slice(0, match.end)).length
      const analysis = codec.analyze(markdown, { inputProfile, syntaxFeatures })
      const segments = [
        ...analysis.segments.filter((s) => s.projection?.placement !== "end"),
        ...analysis.segments.filter((s) => s.projection?.placement === "end"),
      ]
      const nodes = editor.getEditorState().read(() =>
        $getRoot()
          .getChildren()
          .map((node) => node.getKey())
      )
      const index = segments.findIndex((s) => start >= s.start && end <= s.end)
      const segment = segments[index]
      const element =
        index >= 0 && nodes.length === segments.length
          ? editor.getElementByKey(nodes[index]!)
          : null
      const range =
        element && segment
          ? findSourceTextRange(
              element,
              segment.source,
              start - segment.start,
              end - segment.start
            )
          : null
      if (
        !range ||
        !globalThis.CSS?.highlights ||
        typeof Highlight === "undefined"
      ) {
        fallback.current?.()
        return
      }
      CSS.highlights.set(id, new Highlight(range))
      revealTextMatch(range)
      editor.getRootElement()?.focus({ preventScroll: true })
      timer = window.setTimeout(() => CSS.highlights.delete(id), 5000)
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      globalThis.CSS?.highlights?.delete(id)
    }
  }, [editor, codec, target, markdown, inputProfile, syntaxFeatures, id])
  return (
    <style>{`::highlight(${id}) { background-color: var(--eme-highlight); text-decoration: underline; }`}</style>
  )
}
