import {
  DecoratorBlockNode,
  type SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import {
  $applyNodeReplacement,
  $getNodeByKey,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type Spread,
} from "lexical"
import { useEffect, useState, type JSX } from "react"

import { EfmBlockSelection } from "../ui/efm-block-selection"
import { useEfmSourceBlockContext } from "../ui/efm-source-block-context"
import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"

export type EfmSourceBlockKind =
  | "commonmark"
  | "frontmatter"
  | "footnote"
  | "image"
  | "math"
  | "raw-html"
  | "reference"

type SerializedEfmSourceBlockNode = Spread<
  {
    kind: EfmSourceBlockKind
    source: string
  },
  SerializedDecoratorBlockNode
>

const SOURCE_BLOCK_LABELS: Record<EfmSourceBlockKind, string> = {
  commonmark: "Markdown source",
  frontmatter: "YAML frontmatter",
  footnote: "Footnote",
  image: "Image",
  math: "Mathematics",
  "raw-html": "Raw HTML (source only)",
  reference: "Reference definition",
}

function EfmSourceBlockView({
  editor,
  kind,
  nodeKey,
  source,
}: {
  editor: LexicalEditor
  kind: EfmSourceBlockKind
  nodeKey: NodeKey
  source: string
}) {
  const { editBlockLabel, saveBlockLabel, cancelBlockEditLabel, readOnly } =
    useEfmSourceBlockContext()
  const { ariaKeys, matches } = useMarkdownShortcuts()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(source)

  useEffect(() => {
    if (readOnly) setEditing(false)
  }, [readOnly])

  const save = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isEfmSourceBlockNode(node)) node.setSource(draft)
    })
    setEditing(false)
  }

  return (
    <div
      className="eme-efm-source-block eme-efm-block-surface"
      data-efm-source-kind={kind}
      contentEditable={false}
    >
      <div className="eme-efm-source-header">
        <span className="eme-efm-source-label">
          {SOURCE_BLOCK_LABELS[kind]}
        </span>
        {editing || readOnly ? null : (
          <button
            type="button"
            className="eme-efm-source-action"
            onClick={() => {
              setDraft(source)
              setEditing(true)
            }}
          >
            {editBlockLabel}
          </button>
        )}
      </div>
      {editing ? (
        <div className="eme-efm-block-editor">
          <textarea
            aria-label={`${editBlockLabel}: ${SOURCE_BLOCK_LABELS[kind]}`}
            aria-keyshortcuts={ariaKeys([
              "block-editor.commit",
              "overlay.dismiss",
            ])}
            value={draft}
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (matches(event, "block-editor.commit")) {
                event.preventDefault()
                save()
                return
              }
              if (matches(event, "overlay.dismiss")) {
                event.preventDefault()
                setEditing(false)
              }
            }}
          />
          <div className="eme-efm-block-editor-actions">
            <button type="button" onClick={() => setEditing(false)}>
              {cancelBlockEditLabel}
            </button>
            <button type="button" data-primary="true" onClick={save}>
              {saveBlockLabel}
            </button>
          </div>
        </div>
      ) : (
        <pre className="eme-efm-source-code">
          <code>{source}</code>
        </pre>
      )}
    </div>
  )
}

/**
 * An opaque, source-preserving view for EFM constructs that Lexical cannot
 * model without changing their syntax semantics. The node is deliberately
 * non-executable: even raw HTML is rendered as text.
 */
export class EfmSourceBlockNode extends DecoratorBlockNode {
  __kind: EfmSourceBlockKind
  __source: string

  static getType(): string {
    return "efm-source-block"
  }

  static clone(node: EfmSourceBlockNode): EfmSourceBlockNode {
    return new EfmSourceBlockNode(node.__source, node.__kind, node.__key)
  }

  static importJSON(
    serializedNode: SerializedEfmSourceBlockNode
  ): EfmSourceBlockNode {
    return $createEfmSourceBlockNode(
      serializedNode.source,
      serializedNode.kind
    ).setFormat(serializedNode.format)
  }

  constructor(
    source: string,
    kind: EfmSourceBlockKind = "commonmark",
    key?: NodeKey
  ) {
    super(undefined, key)
    this.__kind = kind
    this.__source = source
  }

  exportJSON(): SerializedEfmSourceBlockNode {
    return {
      ...super.exportJSON(),
      kind: this.getKind(),
      source: this.getSource(),
      type: "efm-source-block",
      version: 1,
    }
  }

  getKind(): EfmSourceBlockKind {
    return this.getLatest().__kind
  }

  getSource(): string {
    return this.getLatest().__source
  }

  setSource(source: string): this {
    const writable = this.getWritable()
    writable.__source = source
    return writable
  }

  getTextContent(): string {
    return this.getSource()
  }

  decorate(editor: LexicalEditor): JSX.Element {
    const nodeKey = this.getKey()
    return (
      <>
        <EfmBlockSelection editor={editor} nodeKey={nodeKey} />
        <EfmSourceBlockView
          editor={editor}
          kind={this.getKind()}
          nodeKey={nodeKey}
          source={this.getSource()}
        />
      </>
    )
  }
}

export function $createEfmSourceBlockNode(
  source: string,
  kind: EfmSourceBlockKind = "commonmark"
): EfmSourceBlockNode {
  return $applyNodeReplacement(new EfmSourceBlockNode(source, kind))
}

export function $isEfmSourceBlockNode(
  node: LexicalNode | null | undefined
): node is EfmSourceBlockNode {
  return node instanceof EfmSourceBlockNode
}
