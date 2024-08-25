import { ReactNode } from "react"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  DecoratorNode,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical"

import { FileComponent } from "./component"

export type SerializedFileNode = Spread<
  {
    src: string
    fileName: string
  },
  SerializedLexicalNode
>

export class FileNode extends DecoratorNode<ReactNode> {
  __src: string
  __fileName: string

  static getType(): string {
    return "file"
  }

  static clone(node: FileNode): FileNode {
    return new FileNode(node.__src, node.__fileName, node.__key)
  }

  constructor(src: string, fileName: string, key?: NodeKey) {
    super(key)
    this.__src = src
    this.__fileName = fileName
  }

  setSrc(src: string): void {
    const writable = this.getWritable()
    writable.__src = src
  }

  setFileName(fileName: string): void {
    const writable = this.getWritable()
    writable.__fileName = fileName
  }

  createDOM(): HTMLElement {
    return document.createElement("div")
  }

  updateDOM(): false {
    return false
  }

  static importJSON(data: SerializedFileNode): FileNode {
    const node = $createFileNode({
      src: data.src,
      fileName: data.fileName,
    })
    return node
  }

  exportJSON() {
    return {
      src: this.__src,
      fileName: this.__fileName,
      type: "file",
      version: 1,
    }
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode {
    const nodeKey = this.getKey()
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents className={className} nodeKey={nodeKey}>
        <FileComponent
          url={this.__src}
          fileName={this.__fileName}
          nodeKey={this.__key}
        />
      </BlockWithAlignableContents>
    )
  }

  getTextContent(): string {
    return this.__fileName
  }
}

export function $createFileNode(data: {
  src: string
  fileName: string
}): FileNode {
  return new FileNode(data.src, data.fileName)
}

export function $isFileNode(
  node: LexicalNode | null | undefined
): node is FileNode {
  return node instanceof FileNode
}
