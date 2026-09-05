import { $createListItemNode, $createListNode } from "@lexical/list"
import { $createTableNodeWithDimensions } from "@lexical/table"
import { blockInsertion } from "../commonmark/insertions"
import type { MarkdownPluginInsertion } from "../../plugin-system/plugin-api"

export const gfmInsertions: readonly MarkdownPluginInsertion[] = [
  blockInsertion(
    {
      id: "eidos.gfm.check-list",
      order: 160,
      glyph: "☐",
      labelKey: "checkList",
    },
    () => $createListNode("check").append($createListItemNode(false))
  ),
  blockInsertion(
    { id: "eidos.gfm.table", order: 180, glyph: "▦", labelKey: "table" },
    () => $createTableNodeWithDimensions(3, 3, { rows: true, columns: false })
  ),
]
