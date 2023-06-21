import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"

import AutoLinkPlugin from "./AutoLinkPlugin"
import { CodeHighlightPlugin } from "./CodeHighlightPlugin"
import { ComponentPickerMenuPlugin } from "./ComponentPickerMenuPlugin"
import FloatingLinkEditorPlugin from "./FloatingLinkEditorPlugin"
import ImagesPlugin from "./ImagesPlugin"
import ListMaxIndentLevelPlugin from "./ListMaxIndentLevelPlugin"
import { SQLPlugin } from "./SQLPlugin"
import { allTransformers } from "./const"
import DragDropPaste from "./DragDropPaste"

export const AllPlugins = () => {
  return (
    <>
      <SQLPlugin />
      <CodeHighlightPlugin />
      <HistoryPlugin />
      <AutoFocusPlugin />
      <ListPlugin />
      {/* TabIndentationPlugin let you type `Tab` to indent a list item, ListMaxIndentLevelPlugin let you control the max indent level */}
      <TabIndentationPlugin />
      {/* don't be a dick, don't nest lists too deep */}
      <ListMaxIndentLevelPlugin maxDepth={18} />
      <CheckListPlugin />
      <LinkPlugin />
      <AutoLinkPlugin />
      <ImagesPlugin />
      <DragDropPaste />
      {/* {!isEditable && <LexicalClickableLinkPlugin />} */}
      <ComponentPickerMenuPlugin />
      <MarkdownShortcutPlugin transformers={allTransformers} />
      <FloatingLinkEditorPlugin />
    </>
  )
}
