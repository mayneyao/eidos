import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import LexicalClickableLinkPlugin from "@lexical/react/LexicalClickableLinkPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"

import AutoLinkPlugin from "./AutoLinkPlugin"
import { CodeHighlightPlugin } from "./CodeHighlightPlugin"
import { ComponentPickerMenuPlugin } from "./ComponentPickerMenuPlugin"
import DragDropPaste from "./DragDropPaste"
import FloatingLinkEditorPlugin from "./FloatingLinkEditorPlugin"
import ImagesPlugin from "./ImagesPlugin"
import ListMaxIndentLevelPlugin from "./ListMaxIndentLevelPlugin"
import { SQLPlugin } from "./SQLPlugin"
import { allTransformers } from "./const"

export const AllPlugins = () => {
  return (
    <>
      <SQLPlugin />
      <CodeHighlightPlugin />
      <HistoryPlugin />
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
      <LexicalClickableLinkPlugin />
      <ComponentPickerMenuPlugin />
      <MarkdownShortcutPlugin transformers={allTransformers} />
      <FloatingLinkEditorPlugin />
    </>
  )
}
