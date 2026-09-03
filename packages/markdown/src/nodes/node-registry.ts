import type { Klass, LexicalNode } from "lexical"

import { EIDOS_MARKDOWN_PLUGIN_REGISTRY } from "../plugin-system/builtins"
import { EfmSourceBlockNode } from "./efm-source-block-node"

/** Nodes required by the editor kernel even when every optional plugin is off. */
export const MARKDOWN_EDITOR_CORE_NODES: readonly Klass<LexicalNode>[] = [
  EfmSourceBlockNode,
]

/** @deprecated Use `compileMarkdownPlugins(...).nodes` plus core nodes. */
export const MARKDOWN_EDITOR_NODES: readonly Klass<LexicalNode>[] = [
  ...MARKDOWN_EDITOR_CORE_NODES,
  ...EIDOS_MARKDOWN_PLUGIN_REGISTRY.nodes,
]
