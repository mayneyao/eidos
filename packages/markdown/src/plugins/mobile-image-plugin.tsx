import { useEffect, useRef, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $setSelection,
  HISTORY_PUSH_TAG,
  type BaseSelection,
} from "lexical"
import { $isEfmBlockNode, $isEfmInlineNode } from "../nodes/efm-semantic-node"
import { markdownImageSource } from "../markdown/image-source"
import { isDeniedEfmUri } from "../markdown/efm-uri"
import { resizeImageSource } from "../markdown/resize-image-source"
import type { MarkdownEditorLabels } from "../types"

/** Touch-only image actions; scrolling cancels the long press. */
export function MobileImagePlugin({
  labels,
}: {
  labels: MarkdownEditorLabels
}) {
  const [editor] = useLexicalComposerContext()
  const [key, setKey] = useState<string | null>(null)
  const [url, setUrl] = useState("")
  const [alt, setAlt] = useState("")
  const [title, setTitle] = useState("")
  const [error, setError] = useState("")
  const selection = useRef<BaseSelection | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let origin: { x: number; y: number; id: number } | null = null
    let consumed = false
    const cancel = () => {
      clearTimeout(timer)
      origin = null
    }
    const down = (event: PointerEvent) => {
      cancel()
      consumed = false
      if (
        event.pointerType === "mouse" ||
        !event.isPrimary ||
        !editor.isEditable()
      )
        return
      const target =
        event.target instanceof Element
          ? event.target.closest(
              "[data-efm-image-block], .eme-efm-image, .eme-efm-image-unavailable"
            )
          : null
      if (!target) return
      // Do not move the caret or summon the keyboard before the hold completes.
      // Pointer cancellation still lets the browser take over a scrolling gesture.
      event.preventDefault()
      origin = { x: event.clientX, y: event.clientY, id: event.pointerId }
      selection.current = editor
        .getEditorState()
        .read(() => $getSelection()?.clone() ?? null)
      timer = setTimeout(() => open(target), 500)
    }
    const open = (target: Element) => {
      if (!editor.isEditable()) return
      editor.read(() => {
        const node = $getNearestNodeFromDOMNode(target)
        if (
          (!$isEfmBlockNode(node) && !$isEfmInlineNode(node)) ||
          node.getData().kind !== "image"
        )
          return
        const data = node.getData()
        consumed = true
        setUrl(data.url ?? "")
        setAlt(data.alt ?? "")
        setTitle(data.title ?? "")
        setError("")
        setKey(node.getKey())
      })
    }
    const move = (event: PointerEvent) => {
      if (
        origin &&
        (event.pointerId !== origin.id ||
          Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8)
      )
        cancel()
    }
    const click = (event: MouseEvent) => {
      if (!consumed) return
      consumed = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const context = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest(
              "[data-efm-image-block], .eme-efm-image, .eme-efm-image-unavailable"
            )
          : null
      if (!target) return
      event.preventDefault()
      cancel()
      if (!consumed) open(target)
    }
    const unregister = editor.registerRootListener((root, previous) => {
      previous?.removeEventListener("pointerdown", down, true)
      previous?.removeEventListener("click", click, true)
      previous?.removeEventListener("contextmenu", context)
      root?.addEventListener("pointerdown", down, true)
      root?.addEventListener("click", click, true)
      root?.addEventListener("contextmenu", context)
    })
    window.addEventListener("pointermove", move, true)
    window.addEventListener("pointerup", cancel, true)
    window.addEventListener("pointercancel", cancel, true)
    window.addEventListener("scroll", cancel, true)
    return () => {
      cancel()
      unregister()
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", cancel, true)
      window.removeEventListener("pointercancel", cancel, true)
      window.removeEventListener("scroll", cancel, true)
    }
  }, [editor])
  useEffect(() => {
    if (key) dialog.current?.showModal()
  }, [key])
  const finish = (action: "cancel" | "save" | "delete") => {
    if (
      action === "save" &&
      (!url.trim() || isDeniedEfmUri(url.trim()) || /[<>\r\n]/u.test(url))
    ) {
      setError(labels.invalidImageUrl)
      return
    }
    dialog.current?.close()
    editor.update(
      () => {
        const node = key ? $getNodeByKey(key) : null
        if (
          (!$isEfmBlockNode(node) && !$isEfmInlineNode(node)) ||
          node.getData().kind !== "image"
        )
          return
        if (action === "delete") {
          if ($isEfmInlineNode(node)) {
            node.selectPrevious()
            node.remove()
          } else {
            const paragraph = $createParagraphNode()
            node.replace(paragraph)
            paragraph.selectStart()
          }
        } else {
          if (action === "save") {
            const data = node.getData()
            let source = markdownImageSource(url.trim(), alt, title)
            if (data.width) source = resizeImageSource(source, data.width)
            node.setData({
              ...data,
              kind: "image",
              url: url.trim(),
              resolvedUrl: undefined,
              alt,
              title,
              source,
            })
          }
          if (selection.current) $setSelection(selection.current.clone())
          else node.selectNext()
        }
      },
      { tag: HISTORY_PUSH_TAG }
    )
    setKey(null)
    editor.getRootElement()?.focus({ preventScroll: true })
  }
  return key ? (
    <dialog
      ref={dialog}
      className="eme-mobile-image-sheet"
      aria-label={labels.imageSettings}
      onCancel={(event) => {
        event.preventDefault()
        finish("cancel")
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          finish("save")
        }}
      >
        <header>
          <strong>{labels.imageSettings}</strong>
          <button
            type="button"
            autoFocus
            onClick={() => finish("cancel")}
            aria-label={labels.closeImageSettings}
          >
            ×
          </button>
        </header>
        <label>
          {labels.imageUrl}
          <input value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
        <label>
          {labels.imageAlt}
          <input value={alt} onChange={(event) => setAlt(event.target.value)} />
        </label>
        <label>
          {labels.imageTitle}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={() => finish("delete")}>
            {labels.deleteImage}
          </button>
          <button type="submit">{labels.saveImage}</button>
        </footer>
      </form>
    </dialog>
  ) : null
}
