import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"

/** GFM tables deliberately exclude non-Markdown merge and cell-color state. */
export function GfmBehaviors() {
  return (
    <>
      <CheckListPlugin />
      <TablePlugin hasCellMerge={false} hasCellBackgroundColor={false} />
    </>
  )
}
