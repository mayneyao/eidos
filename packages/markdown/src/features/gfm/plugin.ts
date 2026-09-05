import {
  defineMarkdownPlugin,
  type MarkdownPlugin,
} from "../../plugin-system/plugin-api"
import { commonmarkPlugin } from "../commonmark/plugin"
import { gfmSyntaxPlugins } from "./individual-plugins"
import { composeMarkdownGrammar } from "../../core/markdown-grammar"

const members: readonly MarkdownPlugin[] = gfmSyntaxPlugins

/** Backward-compatible bundle; individual plugins own every contribution. */
export const gfmPlugin: MarkdownPlugin = defineMarkdownPlugin({
  grammar: composeMarkdownGrammar(
    gfmSyntaxPlugins.map((plugin) => plugin.grammar)
  ),
  apiVersion: 1,
  id: "eidos.gfm",
  version: "1.0.0",
  requires: [commonmarkPlugin.id],
  conflicts: members.map((plugin) => plugin.id),
  features: members.flatMap((plugin) => plugin.features ?? []),
  nodes: members.flatMap((plugin) => plugin.nodes ?? []),
  transformers: members.flatMap((plugin) => plugin.transformers ?? []),
  toolbar: members.flatMap((plugin) => plugin.toolbar ?? []),
  insertions: members.flatMap((plugin) => plugin.insertions ?? []),
  behaviors: members.flatMap((plugin) => plugin.behaviors ?? []),
})
