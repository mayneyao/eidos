import { CHECK_LIST, CODE, INLINE_CODE, TRANSFORMERS } from "@lexical/markdown"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"

import { CodeHighlightPlugin } from "./CodeHighlightPlugin"
import { ComponentPickerMenuPlugin } from "./ComponentPickerMenuPlugin"
import { SQLPlugin } from "./SQLPlugin"

export const AllPlugins = () => {
  return (
    <>
      <SQLPlugin />
      <CodeHighlightPlugin />
      <HistoryPlugin />
      <AutoFocusPlugin />
      <ListPlugin />
      <CheckListPlugin />
      <CodeHighlightPlugin />
      <LinkPlugin />
      <ComponentPickerMenuPlugin />
      <MarkdownShortcutPlugin
        transformers={[CHECK_LIST, CODE, INLINE_CODE, ...TRANSFORMERS]}
      />
    </>
  )
}
