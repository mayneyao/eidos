import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $insertNodes,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  type RangeSelection,
} from "lexical"
import { $setBlocksType } from "@lexical/selection"
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text"
import { $createCodeNode } from "@lexical/code-core"
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
} from "@lexical/list"
import type {
  CompiledMarkdownPluginToolbarItem,
  CompiledMarkdownPluginInsertion,
} from "../plugin-system/plugin-api"
import type { MarkdownEditorLabels, MarkdownEditorProps } from "../types"
import { $createLinkNode } from "@lexical/link"
import { $createEfmBlockNode } from "../nodes/efm-semantic-node"
import { pastedImageData } from "./clipboard-image-plugin"
import { isDeniedEfmUri, normalizeEfmUri } from "../markdown/efm-uri"

function ToolIcon({
  name,
}: {
  name: "undo" | "redo" | "indent" | "outdent" | "keyboard" | "image" | "file"
}) {
  const paths = {
    undo: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12",
    redo: "m15 5 5 5-5 5M20 10H10a6 6 0 0 0 0 12",
    indent: "M10 5h11M10 12h11M10 19h11M3 8l4 4-4 4",
    outdent: "M10 5h11M10 12h11M10 19h11m-3-11-4 4 4 4",
    keyboard:
      "M4 3h16v12H4zM7 7h.01M11 7h.01M15 7h.01M18 7h.01M8 11h8m-8 8 4 3 4-3",
    image: "M3 4h18v18H3zM3 17l5-5 4 4 3-3 6 6M15 9h.01",
    file: "M14 3H5v20h14V8zM14 3v5h5M8 13h8M8 17h6",
  }
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  )
}

/** Uses the same Lexical commands as the desktop editor, with persistent touch targets. */
export function MobileToolbarPlugin({
  items,
  labels,
  insertions,
  onDismissKeyboard,
  onImportFiles,
  onError,
  baseUri,
}: {
  items: readonly CompiledMarkdownPluginToolbarItem[]
  labels: MarkdownEditorLabels
  insertions: readonly CompiledMarkdownPluginInsertion[]
  onDismissKeyboard?: () => void
  onImportFiles?: MarkdownEditorProps["onImportFiles"]
  onError: (error: Error) => void
  baseUri?: string
}) {
  const [editor] = useLexicalComposerContext()
  const panelId = useId()
  const [panel, setPanel] = useState<"insert" | "format" | null>(null)
  const [bottom, setBottom] = useState(0)
  const importing = useRef<AbortController | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  useEffect(() => () => importing.current?.abort(), [])
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () =>
      setBottom(
        viewport
          ? Math.max(
              0,
              window.innerHeight - viewport.height - viewport.offsetTop
            )
          : 0
      )
    update()
    viewport?.addEventListener("resize", update)
    viewport?.addEventListener("scroll", update)
    return () => {
      viewport?.removeEventListener("resize", update)
      viewport?.removeEventListener("scroll", update)
    }
  }, [])
  const supports = (key: keyof MarkdownEditorLabels) =>
    insertions.some((item) => item.labelKey === key)
  const selection = useRef<RangeSelection | null>(null)
  const [active, setActive] = useState<ReadonlySet<string>>(new Set())
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) =>
        editorState.read(() => {
          const current = $getSelection()
          if (!$isRangeSelection(current)) return
          selection.current = current.clone()
          setActive(
            new Set(
              items
                .filter((item) =>
                  item.isActive
                    ? item.isActive(current)
                    : item.format
                      ? current.hasFormat(item.format)
                      : false
                )
                .map((item) => item.id)
            )
          )
        })
      ),
    [editor, items]
  )
  useEffect(() => {
    const closePanel = () => setPanel(null)
    const unregister = editor.registerRootListener((root, previous) => {
      previous?.removeEventListener("focus", closePanel)
      root?.addEventListener("focus", closePanel)
    })
    return () => {
      editor.getRootElement()?.removeEventListener("focus", closePanel)
      unregister()
    }
  }, [editor])
  const run = (action: () => void) => {
    setPanel(null)
    editor.focus(() =>
      editor.update(() => {
        if (selection.current) $setSelection(selection.current.clone())
        action()
      })
    )
  }
  const dismissKeyboard = () => {
    editor.blur()
    onDismissKeyboard?.()
  }
  const importFiles = async (kind: "image" | "file") => {
    if (!onImportFiles || importing.current) return
    const controller = new AbortController()
    importing.current = controller
    const saved = selection.current?.clone()
    setImportBusy(true)
    try {
      const files = await onImportFiles({ kind, signal: controller.signal })
      if (
        controller.signal.aborted ||
        !editor.isEditable() ||
        files.length === 0
      )
        return
      for (const file of files) {
        const uri = normalizeEfmUri(file.markdownUrl)
        if (!uri || isDeniedEfmUri(uri) || /[\r\n<>]/u.test(file.markdownUrl))
          throw new Error("Invalid attachment destination")
      }
      setPanel(null)
      editor.focus(() =>
        editor.update(() => {
          if (controller.signal.aborted || !editor.isEditable()) return
          if (
            saved &&
            $getNodeByKey(saved.anchor.key) &&
            $getNodeByKey(saved.focus.key)
          )
            $setSelection(saved.clone())
          else $getRoot().selectEnd()
          $insertNodes(
            files.map((file) =>
              kind === "image"
                ? $createEfmBlockNode(
                    pastedImageData(
                      { markdownUrl: file.markdownUrl, alt: file.name },
                      new File([], file.name, { type: file.mediaType }),
                      baseUri
                    )
                  )
                : $createParagraphNode().append(
                    $createLinkNode(file.markdownUrl).append(
                      $createTextNode(file.name)
                    )
                  )
            )
          )
        })
      )
    } catch (cause) {
      if (!controller.signal.aborted)
        onError(cause instanceof Error ? cause : new Error(String(cause)))
    } finally {
      if (!controller.signal.aborted) setImportBusy(false)
      if (importing.current === controller) importing.current = null
    }
  }
  const toggle = (next: "insert" | "format") => {
    editor.getEditorState().read(() => {
      const current = $getSelection()
      if ($isRangeSelection(current)) selection.current = current.clone()
    })
    setPanel(panel === next ? null : next)
    dismissKeyboard()
  }
  const button = (
    label: string,
    glyph: ReactNode,
    action: () => void,
    pressed?: boolean
  ) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => run(action)}
    >
      {glyph}
      {panel && label !== labels.undo && label !== labels.redo && (
        <span>{label}</span>
      )}
    </button>
  )
  return (
    <div
      className="eme-mobile-dock"
      style={{ bottom }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setPanel(null)
          editor.focus()
        }
      }}
    >
      <div
        className="eme-mobile-toolbar"
        role="toolbar"
        aria-label="Markdown"
        onPointerDown={(event) => event.preventDefault()}
      >
        <div className="eme-mobile-tools">
          <button
            type="button"
            aria-label={labels.insertBlock}
            aria-expanded={panel === "insert"}
            aria-controls={panelId}
            onClick={() => toggle("insert")}
          >
            ＋
          </button>
          <button
            type="button"
            aria-label={labels.textFormat}
            aria-expanded={panel === "format"}
            aria-controls={panelId}
            onClick={() => toggle("format")}
          >
            Aa
          </button>
          {button(labels.undo, <ToolIcon name="undo" />, () =>
            editor.dispatchCommand(UNDO_COMMAND, undefined)
          )}
          {button(labels.redo, <ToolIcon name="redo" />, () =>
            editor.dispatchCommand(REDO_COMMAND, undefined)
          )}
          <button
            type="button"
            aria-label={labels.outdent}
            onClick={() =>
              run(() => {
                editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)
              })
            }
          >
            <ToolIcon name="outdent" />
          </button>
          <button
            type="button"
            aria-label={labels.indent}
            onClick={() =>
              run(() => {
                editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)
              })
            }
          >
            <ToolIcon name="indent" />
          </button>
        </div>
        <button
          type="button"
          className="eme-mobile-dismiss"
          aria-label={panel ? labels.closeFind : labels.hideKeyboard}
          onClick={() => {
            setPanel(null)
            dismissKeyboard()
          }}
        >
          {panel ? "×" : <ToolIcon name="keyboard" />}
        </button>
      </div>
      {panel && (
        <section
          id={panelId}
          className="eme-mobile-panel"
          aria-label={
            panel === "insert" ? labels.insertBlock : labels.textFormat
          }
        >
          <p>{panel === "insert" ? labels.basicBlocks : labels.textFormat}</p>
          <div className="eme-mobile-panel-grid">
            {panel === "format" ? (
              items.map((item) =>
                button(
                  item.labelKey
                    ? labels[item.labelKey]
                    : (item.label ?? item.id),
                  item.glyph,
                  () => {
                    if (item.execute) item.execute(editor)
                    else if (item.format)
                      editor.dispatchCommand(FORMAT_TEXT_COMMAND, item.format)
                  },
                  active.has(item.id)
                )
              )
            ) : (
              <>
                {onImportFiles &&
                  (["image", "file"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      disabled={importBusy}
                      aria-label={
                        kind === "image" ? labels.image : labels.attachFile
                      }
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => void importFiles(kind)}
                    >
                      <ToolIcon name={kind} />
                      <span>
                        {kind === "image" ? labels.image : labels.attachFile}
                      </span>
                    </button>
                  ))}
                {button(labels.paragraph, "T", () =>
                  $setBlocksType($getSelection(), $createParagraphNode)
                )}
                {supports("heading1") &&
                  button(labels.heading1, "H₁", () =>
                    $setBlocksType($getSelection(), () =>
                      $createHeadingNode("h1")
                    )
                  )}
                {supports("heading2") &&
                  button(labels.heading2, "H₂", () =>
                    $setBlocksType($getSelection(), () =>
                      $createHeadingNode("h2")
                    )
                  )}
                {supports("heading3") &&
                  button(labels.heading3, "H₃", () =>
                    $setBlocksType($getSelection(), () =>
                      $createHeadingNode("h3")
                    )
                  )}
                {supports("numberedList") &&
                  button(labels.numberedList, "1.", () =>
                    editor.dispatchCommand(
                      INSERT_ORDERED_LIST_COMMAND,
                      undefined
                    )
                  )}
                {supports("bulletList") &&
                  button(labels.bulletList, "• ≡", () =>
                    editor.dispatchCommand(
                      INSERT_UNORDERED_LIST_COMMAND,
                      undefined
                    )
                  )}
                {supports("checkList") &&
                  button(labels.checkList, "☑", () =>
                    editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
                  )}
                {supports("quote") &&
                  button(labels.quote, "❯", () =>
                    $setBlocksType($getSelection(), $createQuoteNode)
                  )}
                {supports("codeBlock") &&
                  button(labels.codeBlock, "</>", () =>
                    $setBlocksType($getSelection(), $createCodeNode)
                  )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
