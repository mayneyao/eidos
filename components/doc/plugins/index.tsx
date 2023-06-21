import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"

import { CodeHighlightPlugin } from "./CodeHighlightPlugin"
import { ComponentPickerMenuPlugin } from "./ComponentPickerMenuPlugin"
import FloatingLinkEditorPlugin from "./FloatingLinkEditorPlugin"
import ListMaxIndentLevelPlugin from "./ListMaxIndentLevelPlugin"
import { SQLPlugin } from "./SQLPlugin"
import { allTransformers } from "./const"

export const AllPlugins = () => {
  return (
    <>
      <SQLPlugin />
      <CodeHighlightPlugin />
      <HistoryPlugin />
      <AutoFocusPlugin />
      <ListPlugin />
      <ListMaxIndentLevelPlugin maxDepth={3} />
      <CheckListPlugin />
      <LinkPlugin />
      {/* {!isEditable && <LexicalClickableLinkPlugin />} */}
      <ComponentPickerMenuPlugin />
      <MarkdownShortcutPlugin transformers={allTransformers} />
      <FloatingLinkEditorPlugin />
    </>
  )
}
