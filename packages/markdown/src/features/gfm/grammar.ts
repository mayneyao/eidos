import { gfmTable, gfmTableHtml } from "micromark-extension-gfm-table"
import { gfmTableFromMarkdown } from "mdast-util-gfm-table"
import {
  gfmTaskListItem,
  gfmTaskListItemHtml,
} from "micromark-extension-gfm-task-list-item"
import { gfmTaskListItemFromMarkdown } from "mdast-util-gfm-task-list-item"
import {
  gfmStrikethrough,
  gfmStrikethroughHtml,
} from "micromark-extension-gfm-strikethrough"
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough"
import {
  gfmAutolinkLiteral,
  gfmAutolinkLiteralHtml,
} from "micromark-extension-gfm-autolink-literal"
import { gfmAutolinkLiteralFromMarkdown } from "mdast-util-gfm-autolink-literal"
import { gfmTagfilterHtml } from "micromark-extension-gfm-tagfilter"
import type { MarkdownGrammar } from "../../core/markdown-grammar"

export const GFM_GRAMMARS = {
  table: {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
    htmlExtensions: [gfmTableHtml()],
  },
  taskList: {
    extensions: [gfmTaskListItem()],
    mdastExtensions: [gfmTaskListItemFromMarkdown()],
    htmlExtensions: [gfmTaskListItemHtml()],
  },
  strikethrough: {
    extensions: [gfmStrikethrough()],
    mdastExtensions: [gfmStrikethroughFromMarkdown()],
    htmlExtensions: [gfmStrikethroughHtml()],
  },
  autolink: {
    extensions: [gfmAutolinkLiteral()],
    mdastExtensions: [gfmAutolinkLiteralFromMarkdown()],
    htmlExtensions: [gfmAutolinkLiteralHtml()],
  },
  tagFilter: { htmlExtensions: [gfmTagfilterHtml()] },
} satisfies Record<string, MarkdownGrammar>
