import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"

import type { MarkdownPluginBehaviorProps } from "../../plugin-system/plugin-api"
import { CodeHighlightPlugin } from "../../plugins/code-highlight-plugin"
import { ListItemShortcutsPlugin } from "../../plugins/list-item-shortcuts-plugin"

/** Standard editing behavior is installed by the syntax owner, not the shell. */
export function CommonmarkBehaviors({
  codeHighlightTokenizer,
  onError,
}: MarkdownPluginBehaviorProps) {
  return (
    <>
      <ListBehaviors />
      <ThematicBreakBehaviors />
      <CodeBehaviors
        codeHighlightTokenizer={codeHighlightTokenizer}
        onError={onError}
      />
    </>
  )
}

export function ListBehaviors() {
  return (
    <>
      <ListPlugin />
      <ListItemShortcutsPlugin />
      <TabIndentationPlugin />
    </>
  )
}

export function ThematicBreakBehaviors() {
  return <HorizontalRulePlugin />
}

export function CodeBehaviors({
  codeHighlightTokenizer,
  onError,
}: Pick<MarkdownPluginBehaviorProps, "codeHighlightTokenizer" | "onError">) {
  return (
    <>
      {codeHighlightTokenizer === false ? null : (
        <CodeHighlightPlugin
          onError={onError}
          tokenizer={codeHighlightTokenizer}
        />
      )}
    </>
  )
}
