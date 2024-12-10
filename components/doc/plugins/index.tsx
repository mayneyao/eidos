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

import { BuiltInBlocks } from "../blocks"
import { useExtBlocks } from "../hooks/use-ext-blocks"
import { useEnabledExtDocPlugins } from "../hooks/use-ext-plugins"
import { AIToolsPlugin } from "./AIToolsPlugin"
// import { AIToolsPlugin } from "./AIToolsPlugin"
import AutoLinkPlugin from "./AutoLinkPlugin"
import { CodeHighlightPlugin } from "./CodeHighlightPlugin"
import { ComponentPickerMenuPlugin } from "./ComponentPickerMenuPlugin"
import { DatabasePlugin } from "./DatabasePlugin"
import DragDropPaste from "./DragDropPaste"
import AdvancedListPlugin from "./DraggableBlockPlugin/advanced-list"
import FloatingLinkEditorPlugin from "./FloatingLinkEditorPlugin"
import ImagesPlugin from "./ImagesPlugin"
import ListMaxIndentLevelPlugin from "./ListMaxIndentLevelPlugin"
import { SQLPlugin } from "./SQLPlugin"
import { ShortcutPlugin } from "./ShortcutPlugin"
import { TableOfContentsPlugin } from "./TableOfContentsPlugin"
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
    ...BuiltInBlocks.map((block) => block.transform).filter(Boolean),
  ] as Transformer[]
  return (
    <>
      <AdvancedListPlugin />
      <HorizontalRulePlugin />
      <TableOfContentsPlugin />
      <SQLPlugin />
      <CodeHighlightPlugin />
      <HistoryPlugin />
      <HashtagPlugin />
      <ListPlugin />
      <DatabasePlugin />
      {/* <TablePlugin /> */}
      {/* TabIndentationPlugin let you type `Tab` to indent a list item, ListMaxIndentLevelPlugin let you control the max indent level */}
      <TabIndentationPlugin />
      {/* don't be a dick, don't nest lists too deep */}
      <ListMaxIndentLevelPlugin maxDepth={18} />
      <CheckListPlugin />
      <AIToolsPlugin />
      <LinkPlugin />
      <ShortcutPlugin />
      <AutoLinkPlugin />
      <ImagesPlugin />
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
