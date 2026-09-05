import { $createCodeNode, $isCodeNode, CodeNode } from "@lexical/code-core"
import { $createTextNode, $isTextNode } from "lexical"
import {
  defineMarkdownPlugin,
  type MarkdownBlockSyntax,
  type MarkdownInlineSyntax,
} from "@eidos.space/markdown/plugin-api"

// A consumer-owned grammar. No imports from the package source tree.
const syntax: MarkdownBlockSyntax = {
  id: "consumer.note",
  scan(source) {
    return Array.from(
      source.matchAll(/^:::note\n[\s\S]*?\n:::$/gmu),
      (match) => ({
        start: match.index,
        end: match.index + match[0].length,
      })
    )
  },
  import(source) {
    return $createCodeNode("consumer-note").append(
      $createTextNode(source.split("\n").slice(1, -1).join("\n"))
    )
  },
  export(node) {
    return $isCodeNode(node) && node.getLanguage() === "consumer-note"
      ? `:::note\n${node.getTextContent()}\n:::`
      : null
  },
}

export const notePlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "consumer.notes",
  version: "1",
  nodes: [CodeNode],
  blockSyntax: [syntax],
})

export const quoteNotePlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "consumer.quote-note",
  version: "1",
  nodes: [CodeNode],
  blockSyntax: [
    {
      id: "consumer.quote-note.syntax",
      matchParsedBlock: (block) =>
        block.type === "blockquote" && block.source.startsWith("> NOTE:"),
      import: (source) =>
        $createCodeNode("consumer-quote-note").append($createTextNode(source)),
      export: (node) =>
        $isCodeNode(node) && node.getLanguage() === "consumer-quote-note"
          ? node.getTextContent()
          : null,
    },
  ],
})

const badgeSyntax: MarkdownInlineSyntax = {
  id: "consumer.badge.syntax",
  scan(source) {
    return [...source.matchAll(/\^\^\w+\^\^/gu)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }))
  },
  import(source) {
    return $createTextNode(source).setMode("token")
  },
  export(node) {
    return $isTextNode(node) && node.getMode() === "token"
      ? node.getTextContent()
      : null
  },
}
export const badgePlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "consumer.badge",
  version: "1",
  inlineSyntax: [badgeSyntax],
})
