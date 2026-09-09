import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"
import { ListItemNode, ListNode } from "@lexical/list"
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table"
import { STRIKETHROUGH } from "@lexical/markdown"
import { GFM_GRAMMARS } from "./grammar"
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
  grammar: GFM_GRAMMARS.table,
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
  grammar: GFM_GRAMMARS.taskList,
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
  grammar: GFM_GRAMMARS.strikethrough,
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
  grammar: GFM_GRAMMARS.autolink,
})

/** GFM tag filtering is additive; core HTML sanitization cannot be disabled. */
export const tagFilterPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.tag-filter",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.gfmTagFilter],
  grammar: GFM_GRAMMARS.tagFilter,
})

export const gfmSyntaxPlugins = [
  tablePlugin,
  taskListPlugin,
  strikethroughPlugin,
  autolinkPlugin,
  tagFilterPlugin,
] as const
