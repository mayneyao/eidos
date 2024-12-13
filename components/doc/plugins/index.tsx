import { useEffect } from "react"
import { Transformer } from "@lexical/markdown"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import LexicalClickableLinkPlugin from "@lexical/react/LexicalClickableLinkPlugin"
import { HashtagPlugin } from "@lexical/react/LexicalHashtagPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"

import { BuiltInBlocks } from "../blocks"
import { useExtBlocks } from "../hooks/use-ext-blocks"
import { useEnabledExtDocPlugins } from "../hooks/use-ext-plugins"
import { AIToolsPlugin } from "./AIToolsPlugin"
// import { AIToolsPlugin } from "./AIToolsPlugin"
import AutoLinkPlugin from "./AutoLinkPlugin"
import { CodeHighlightPlugin } from "./CodeHighlightPlugin"
import { ComponentPickerMenuPlugin } from "./ComponentPickerMenuPlugin"
import DragDropPaste from "./DragDropPaste"
import AdvancedListPlugin from "./DraggableBlockPlugin/advanced-list"
import FloatingLinkEditorPlugin from "./FloatingLinkEditorPlugin"
import ListMaxIndentLevelPlugin from "./ListMaxIndentLevelPlugin"
import { ShortcutPlugin } from "./ShortcutPlugin"
import TableCellResizer from "./TableCellResizer"
import TableHoverActionsPlugin from "./TableHoverActionsPlugin"
import { allTransformers } from "./const"

export const AllPlugins = ({
  disableExtPlugins = false,
}: {
  disableExtPlugins?: boolean
}) => {
  const extBlocks = useExtBlocks()
  const { loading } = useEnabledExtDocPlugins(disableExtPlugins)
  const extPlugins =
    disableExtPlugins || loading ? [] : (window as any).__DOC_EXT_PLUGINS

  useEffect(() => {
    ;(window as any).__DOC_EXT_PLUGINS = []
  }, [disableExtPlugins])

  const __allTransformers = [
    ...allTransformers,
    ...extBlocks.map((block) => block.transform),
  ] as Transformer[]
  return (
    <>
      <AdvancedListPlugin />
      <HorizontalRulePlugin />
      <CodeHighlightPlugin />
      <HistoryPlugin />
      <HashtagPlugin />
      <ListPlugin />
      <TablePlugin />
      <TableCellResizer />
      {/* TabIndentationPlugin let you type `Tab` to indent a list item, ListMaxIndentLevelPlugin let you control the max indent level */}
      <TabIndentationPlugin />
      {/* don't be a dick, don't nest lists too deep */}
      <ListMaxIndentLevelPlugin maxDepth={18} />
      <CheckListPlugin />
      <AIToolsPlugin />
      <LinkPlugin />
      <ShortcutPlugin />
      <AutoLinkPlugin />
      <DragDropPaste />
      <LexicalClickableLinkPlugin />
      <ComponentPickerMenuPlugin />
      <MarkdownShortcutPlugin transformers={__allTransformers} />
      <FloatingLinkEditorPlugin />
      {BuiltInBlocks.map((block) => (
        <block.plugin key={block.name} />
      ))}
      {extBlocks.map((block) => (
        <block.plugin key={block.name} />
      ))}
      {extPlugins.map((plugin: any) => (
        <plugin.plugin key={plugin.name} />
      ))}
    </>
  )
}
