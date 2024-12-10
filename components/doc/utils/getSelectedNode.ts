/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { $isAtNodeEnd } from "@lexical/selection"
import { ElementNode, RangeSelection, TextNode, LexicalNode } from "lexical"

export function findFirstBlockElement(node: LexicalNode): ElementNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if (current.getType() === 'paragraph' ||
      current.getType() === 'heading' ||
      current.getType() === 'list' ||
      current.getType() === 'listitem' ||
      current.getType() === 'quote') {
      return current as ElementNode;
    }
    current = current.getParent();
  }
  return null;
}

export function getSelectedNode(
  selection: RangeSelection
): TextNode | ElementNode {
  const anchor = selection.anchor
  const focus = selection.focus
  const anchorNode = selection.anchor.getNode()
  const focusNode = selection.focus.getNode()
  if (anchorNode === focusNode) {
    return anchorNode
  }
  const isBackward = selection.isBackward()
  if (isBackward) {
    return $isAtNodeEnd(focus) ? anchorNode : focusNode
  } else {
    return $isAtNodeEnd(anchor) ? anchorNode : focusNode
  }
}
