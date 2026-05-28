/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as React from "react"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  BaseImageNode,
  $isBaseImageNode,
  createImageTransformer,
  type ImagePayload as BaseImagePayload,
  type SerializedImageNode as BaseSerializedImageNode,
  IMAGE_NODE_TRANSFORMER as BASE_IMAGE_NODE_TRANSFORMER,
} from "@eidos.space/lexical"
import {
  $applyNodeReplacement,
  createEditor,
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type Spread,
} from "lexical"

import ImageComponent from "./component"

export type SerializedImageNode = Spread<
  {
    caption?: {
      editorState: string
    }
  },
  BaseSerializedImageNode
>

export type ImagePayload = BaseImagePayload & {
  caption?: LexicalEditor
}

export class ImageNode extends BaseImageNode {
  __caption: LexicalEditor

  static getType(): string {
    return "image"
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText || "",
      node.__maxWidth || 500,
      node.__width,
      node.__height,
      node.__showCaption,
      node.__caption,
      node.__captionsEnabled,
      node.__format,
      node.__key
    )
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    const {
      altText,
      height,
      width,
      maxWidth,
      caption,
      src,
      showCaption,
      captionsEnabled,
    } = serializedNode
    const node = $createImageNode({
      altText,
      height,
      maxWidth,
      showCaption,
      src,
      width,
      captionsEnabled,
    })
    node.setFormat(serializedNode.format)

    // Safely handle caption with persistent ID state
    if (caption?.editorState) {
      const nestedEditor = node.__caption
      try {
        const editorState = nestedEditor.parseEditorState(caption.editorState)
        if (!editorState.isEmpty()) {
          nestedEditor.setEditorState(editorState)
        }
      } catch (error) {
        console.warn("Failed to parse caption editor state:", error)
      }
    }
    return node
  }

  constructor(
    src: string,
    altText: string,
    maxWidth: number,
    width?: number,
    height?: number,
    showCaption?: boolean,
    caption?: LexicalEditor,
    captionsEnabled?: boolean,
    format?: ElementFormatType,
    key?: NodeKey
  ) {
    super(
      src,
      altText,
      maxWidth,
      width,
      height,
      showCaption,
      captionsEnabled,
      format,
      key
    )
    this.__caption = caption || createEditor()
  }

  setWidthAndHeight(
    width: number | "inherit",
    height: number | "inherit"
  ): void {
    const writable = this.getWritable()
    writable.__width = width as any
    writable.__height = height as any
  }

  setSrc(src: string) {
    const writable = this.getWritable()
    writable.__src = src
  }

  setShowCaption(showCaption: boolean): void {
    const writable = this.getWritable()
    writable.__showCaption = showCaption
  }

  decorate(editor: LexicalEditor, config: EditorConfig): JSX.Element {
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
        <ImageComponent
          src={this.__src}
          altText={this.__altText}
          width={this.__width as any}
          height={this.__height as any}
          maxWidth={this.__maxWidth}
          nodeKey={this.getKey()}
          showCaption={this.__showCaption || false}
          caption={this.__caption}
          captionsEnabled={this.__captionsEnabled || false}
          resizable={true}
        />
      </BlockWithAlignableContents>
    )
  }
}

export function $createImageNode({
  altText,
  height,
  maxWidth = 500,
  captionsEnabled,
  src,
  width,
  showCaption,
  caption,
  format,
  key,
}: ImagePayload & { format?: ElementFormatType; key?: NodeKey }): ImageNode {
  return $applyNodeReplacement(
    new ImageNode(
      src || "",
      altText || "",
      maxWidth,
      width,
      height,
      showCaption,
      caption,
      captionsEnabled,
      format,
      key
    )
  )
}

export function $isImageNode(
  node: LexicalNode | null | undefined
): node is ImageNode {
  return node instanceof ImageNode
}

export const IMAGE_NODE_TRANSFORMER = createImageTransformer(
  ImageNode,
  (src, altText) => $createImageNode({ src, altText })
)
