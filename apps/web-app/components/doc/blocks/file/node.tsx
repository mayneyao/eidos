import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  BaseFileNode,
  $isBaseFileNode,
  type SerializedFileNode,
} from "@eidos.space/lexical"
import type {
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical"

import { FileComponent } from "./component"

export class FileNode extends BaseFileNode {
  static getType(): string {
    return "file"
  }

  static clone(node: FileNode): FileNode {
    return new FileNode(
      node.__src,
      node.__fileName,
      node.getFormat(),
      node.getKey()
    )
  }

  constructor(
    src: string,
    fileName: string,
    format?: ElementFormatType,
    key?: NodeKey
  ) {
    super(src, fileName, format, key)
  }

  setSrc(src: string): void {
    const writable = this.getWritable()
    writable.__src = src
  }

  setFileName(fileName: string): void {
    const writable = this.getWritable()
    writable.__fileName = fileName
  }

  static importJSON(data: SerializedFileNode): FileNode {
    const node = $createFileNode({
      src: data.src,
      fileName: data.fileName,
    })
    node.setFormat(data.format)
    return node
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents
        format={this.getFormat()}
        className={className}
        nodeKey={this.getKey()}
      >
        <FileComponent
          url={this.__src}
          fileName={this.__fileName}
          nodeKey={this.getKey()}
        />
      </BlockWithAlignableContents>
    )
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
