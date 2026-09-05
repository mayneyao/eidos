import {
  $getState,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
  $setState,
  createState,
  type BaseSelection,
  type ElementNode,
  type LexicalNode,
} from "lexical"
import { $isListItemNode, $isListNode, type ListNode } from "@lexical/list"
import { $isCodeNode } from "@lexical/code-core"
import { $isQuoteNode } from "@lexical/rich-text"
import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CHECK_LIST,
  CODE,
  HEADING,
  HIGHLIGHT,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
  type ElementTransformer,
  type Transformer,
} from "@lexical/markdown"
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode"

import { TABLE } from "./table-transformer"

const richListSourceState = createState("eme-rich-list-source", {
  parse: (value) => (typeof value === "string" ? value : ""),
})

const richListFingerprintState = createState("eme-rich-list-fingerprint", {
  parse: (value) => (typeof value === "string" ? value : ""),
})

function nodeFingerprint(node: LexicalNode): unknown {
  const { $: _nodeState, ...serialized } = node.exportJSON() as Record<
    string,
    unknown
  >
  if (node.getType() === "listitem") delete serialized.value
  return [
    serialized,
    ...($isElementNode(node)
      ? node.getChildren().map((child) => nodeFingerprint(child))
      : []),
  ]
}

function richListFingerprint(list: ListNode): string {
  return JSON.stringify(nodeFingerprint(list))
}

/** Marks an imported rich list so untouched documents retain byte-stable source. */
export function $setRichListSource(list: ListNode, source: string): void {
  const fingerprint = richListFingerprint(list)
  $setState(list, richListSourceState, source)
  $setState(list, richListFingerprintState, fingerprint)
}

function codeFence(value: string): string {
  const longest = Math.max(
    0,
    ...Array.from(value.matchAll(/`+/gu), (match) => match[0].length)
  )
  return "`".repeat(Math.max(3, longest + 1))
}

function quoteMarkdown(value: string): string {
  return value
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n")
}

function nestedBlockMarkdown(
  node: LexicalNode,
  exportChildren: (node: ElementNode) => string
): string {
  if ($isParagraphNode(node)) return exportChildren(node)
  if ($isQuoteNode(node)) return quoteMarkdown(exportChildren(node))
  if ($isCodeNode(node)) {
    const value = node.getTextContent()
    const fence = codeFence(value)
    const language = node.getLanguage() ?? ""
    return `${fence}${language}\n${value}\n${fence}`
  }
  if ($isListNode(node)) return richListMarkdown(node, exportChildren)
  if ($isHorizontalRuleNode(node)) return "---"
  if ($isElementNode(node)) return exportChildren(node)
  if ($isDecoratorNode(node)) return node.getTextContent()
  return node.getTextContent()
}

function richListItemBlocks(
  item: ElementNode,
  exportChildren: (node: ElementNode) => string
): string[] {
  const children = item.getChildren()
  const firstBlockIndex = children.findIndex(
    (child) =>
      ($isElementNode(child) || $isDecoratorNode(child)) && !child.isInline()
  )
  if (firstBlockIndex < 0) return [exportChildren(item)]

  const blockChildren = children.slice(firstBlockIndex)
  const flattenedBlockText = blockChildren
    .map((child) =>
      $isElementNode(child) ? exportChildren(child) : child.getTextContent()
    )
    .join("")
  const flattenedItem = exportChildren(item)
  const leadingInline = flattenedItem.endsWith(flattenedBlockText)
    ? flattenedBlockText
      ? flattenedItem.slice(0, -flattenedBlockText.length)
      : flattenedItem
    : flattenedItem
  return [
    ...(leadingInline ? [leadingInline] : []),
    ...blockChildren.map((child) => nestedBlockMarkdown(child, exportChildren)),
  ]
}

function indentContinuation(value: string, indent: string): string {
  return value.replace(/\n/gu, `\n${indent}`)
}

function richListMarkdown(
  list: ListNode,
  exportChildren: (node: ElementNode) => string,
  selection?: BaseSelection | null
): string {
  const lines: string[] = []
  let number = list.getStart()
  for (const item of list.getChildren()) {
    if (!$isListItemNode(item)) continue
    if (
      selection &&
      !item.getChildren().some((child) => child.isSelected(selection))
    ) {
      number += 1
      continue
    }
    const prefix =
      list.getListType() === "number"
        ? `${number}. `
        : list.getListType() === "check"
          ? `- [${item.getChecked() ? "x" : " "}] `
          : "- "
    const continuation = " ".repeat(prefix.length)
    const blocks = richListItemBlocks(item, exportChildren)
    const [first = "", ...rest] = blocks
    lines.push(
      prefix +
        indentContinuation(first, continuation) +
        rest
          .map(
            (block) =>
              `\n\n${continuation}${indentContinuation(block, continuation)}`
          )
          .join("")
    )
    number += 1
  }
  return lines.join("\n")
}

function withRichListExport(
  transformer: ElementTransformer
): ElementTransformer {
  return {
    ...transformer,
    export: (node, exportChildren, selection) => {
      const builtIn = transformer.export?.(node, exportChildren, selection)
      if (builtIn === null || builtIn === undefined || !$isListNode(node)) {
        return builtIn ?? null
      }
      const source = $getState(node, richListSourceState)
      if (!source) return builtIn
      return selection == null &&
        $getState(node, richListFingerprintState) === richListFingerprint(node)
        ? source
        : richListMarkdown(node, exportChildren, selection)
    },
  }
}

export const RICH_CHECK_LIST = withRichListExport(CHECK_LIST)
export const RICH_UNORDERED_LIST = withRichListExport(UNORDERED_LIST)
export const RICH_ORDERED_LIST = withRichListExport(ORDERED_LIST)

export const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^ {0,3}((?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/u,
  replace: (parentNode, _children, _match, isImport) => {
    const rule = $createHorizontalRuleNode()
    if (isImport || parentNode.getNextSibling() !== null) {
      parentNode.replace(rule)
    } else {
      parentNode.insertBefore(rule)
    }
    if (!isImport) rule.selectNext()
  },
  type: "element",
}

/** Markdown syntax currently supported by the editor and its serializer. */
export const EIDOS_MARKDOWN_TRANSFORMERS: readonly Transformer[] = [
  TABLE,
  RICH_CHECK_LIST,
  HORIZONTAL_RULE,
  HEADING,
  QUOTE,
  RICH_UNORDERED_LIST,
  RICH_ORDERED_LIST,
  CODE,
  INLINE_CODE,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  HIGHLIGHT,
  LINK,
]
