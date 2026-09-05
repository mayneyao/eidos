import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"
import { ListItemNode, ListNode } from "@lexical/list"
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table"
import { STRIKETHROUGH } from "@lexical/markdown"
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
import { EfmInlineNode } from "../../nodes/efm-semantic-node"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"
import { TABLE, createTableTransformer } from "../../markdown/table-transformer"
import { RICH_CHECK_LIST } from "../../markdown/markdown-transformers"
import { gfmInsertions } from "./insertions"

function TableBehavior() {
  return <TablePlugin hasCellMerge={false} hasCellBackgroundColor={false} />
}
function TaskListBehavior() {
  return <CheckListPlugin />
}

export const tablePlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.table",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.gfmTable],
  nodes: [TableNode, TableRowNode, TableCellNode],
  grammar: {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
    htmlExtensions: [gfmTableHtml()],
  },
  transformers: [
    { order: 10, transformer: TABLE, configure: createTableTransformer },
  ],
  insertions: gfmInsertions.filter((entry) => entry.labelKey === "table"),
  behaviors: [{ id: "markdown.table.behavior", component: TableBehavior }],
})

export const taskListPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.task-list",
  version: "1.0.0",
  requires: ["markdown.list"],
  features: [MARKDOWN_FEATURES.gfmTaskList],
  nodes: [ListNode, ListItemNode],
  grammar: {
    extensions: [gfmTaskListItem()],
    mdastExtensions: [gfmTaskListItemFromMarkdown()],
    htmlExtensions: [gfmTaskListItemHtml()],
  },
  transformers: [{ order: 20, transformer: RICH_CHECK_LIST }],
  insertions: gfmInsertions.filter((entry) => entry.labelKey === "checkList"),
  behaviors: [
    { id: "markdown.task-list.behavior", component: TaskListBehavior },
  ],
})

export const strikethroughPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.strikethrough",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.gfmStrikethrough],
  grammar: {
    extensions: [gfmStrikethrough()],
    mdastExtensions: [gfmStrikethroughFromMarkdown()],
    htmlExtensions: [gfmStrikethroughHtml()],
  },
  transformers: [{ order: 160, transformer: STRIKETHROUGH }],
  toolbar: [
    {
      id: "format.strikethrough",
      order: 120,
      glyph: "S",
      labelKey: "strikethrough",
      format: "strikethrough",
    },
  ],
})

export const autolinkPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.autolink",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.gfmAutolink],
  nodes: [EfmInlineNode],
  grammar: {
    extensions: [gfmAutolinkLiteral()],
    mdastExtensions: [gfmAutolinkLiteralFromMarkdown()],
    htmlExtensions: [gfmAutolinkLiteralHtml()],
  },
})

/** GFM tag filtering is additive; core HTML sanitization cannot be disabled. */
export const tagFilterPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.tag-filter",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.gfmTagFilter],
  grammar: { htmlExtensions: [gfmTagfilterHtml()] },
})

export const gfmSyntaxPlugins = [
  tablePlugin,
  taskListPlugin,
  strikethroughPlugin,
  autolinkPlugin,
  tagFilterPlugin,
] as const
