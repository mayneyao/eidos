import type { Klass, LexicalNode } from "lexical"

import type { MarkdownShortcutDefinition } from "../shortcuts/shortcut-registry"
import {
  DEFAULT_MARKDOWN_SHORTCUTS,
  markdownShortcutConflicts,
  resolveMarkdownShortcuts,
} from "../shortcuts/shortcut-registry"
import {
  MARKDOWN_PLUGIN_API_VERSION,
  type CompiledMarkdownPluginBehavior,
  type CompiledMarkdownPluginInsertion,
  type CompiledMarkdownPluginToolbarItem,
  type CompiledMarkdownPlugins,
  type MarkdownPlugin,
  type MarkdownTransformerContribution,
} from "./plugin-api"

interface OrderedPlugin {
  index: number
  plugin: MarkdownPlugin
}

const BUILT_IN_INSERTION_IDS = new Set([
  "bullet-list",
  "check-list",
  "code",
  "divider",
  "footnote",
  "frontmatter",
  "heading-1",
  "heading-2",
  "heading-3",
  "html",
  "image",
  "inline-math",
  "math",
  "number-list",
  "quote",
  "table",
])

function isNamespacedId(id: string): boolean {
  return /^[a-z0-9]+(?:[._/-][a-z0-9]+)+$/u.test(id)
}

function pluginNodeType(node: Klass<LexicalNode>): string | null {
  const candidate = node as unknown as { getType?: () => string }
  return typeof candidate.getType === "function" ? candidate.getType() : null
}

function resolvePluginOrder(
  plugins: readonly MarkdownPlugin[]
): OrderedPlugin[] {
  const byId = new Map<string, OrderedPlugin>()
  plugins.forEach((plugin, index) => {
    if (plugin.apiVersion !== MARKDOWN_PLUGIN_API_VERSION) {
      throw new Error(
        `Markdown plugin "${plugin.id}" uses unsupported API version ${plugin.apiVersion}.`
      )
    }
    if (!isNamespacedId(plugin.id)) {
      throw new Error(`Markdown plugin ID "${plugin.id}" is not namespaced.`)
    }
    if (!plugin.version.trim()) {
      throw new Error(`Markdown plugin "${plugin.id}" needs a version.`)
    }
    if (byId.has(plugin.id)) {
      throw new Error(`Markdown plugin "${plugin.id}" is registered twice.`)
    }
    byId.set(plugin.id, { index, plugin })
  })

  const edges = new Map<string, Set<string>>()
  const indegree = new Map<string, number>()
  for (const { plugin } of byId.values()) {
    edges.set(plugin.id, new Set())
    indegree.set(plugin.id, 0)
  }

  const addEdge = (from: string, to: string) => {
    if (from === to || edges.get(from)?.has(to)) return
    edges.get(from)?.add(to)
    indegree.set(to, (indegree.get(to) ?? 0) + 1)
  }

  for (const { plugin } of byId.values()) {
    for (const required of plugin.requires ?? []) {
      if (!byId.has(required)) {
        throw new Error(
          `Markdown plugin "${plugin.id}" requires missing plugin "${required}".`
        )
      }
      addEdge(required, plugin.id)
    }
    for (const conflict of plugin.conflicts ?? []) {
      if (byId.has(conflict)) {
        throw new Error(
          `Markdown plugins "${plugin.id}" and "${conflict}" conflict.`
        )
      }
    }
    for (const before of plugin.before ?? []) {
      if (byId.has(before)) addEdge(plugin.id, before)
    }
    for (const after of plugin.after ?? []) {
      if (byId.has(after)) addEdge(after, plugin.id)
    }
  }

  const ready = [...byId.values()]
    .filter(({ plugin }) => indegree.get(plugin.id) === 0)
    .sort((left, right) => left.index - right.index)
  const resolved: OrderedPlugin[] = []

  while (ready.length > 0) {
    const current = ready.shift()!
    resolved.push(current)
    for (const nextId of edges.get(current.plugin.id) ?? []) {
      const nextDegree = (indegree.get(nextId) ?? 0) - 1
      indegree.set(nextId, nextDegree)
      if (nextDegree === 0) {
        ready.push(byId.get(nextId)!)
        ready.sort((left, right) => left.index - right.index)
      }
    }
  }

  if (resolved.length !== plugins.length) {
    const cyclic = [...byId.keys()].filter((id) => (indegree.get(id) ?? 0) > 0)
    throw new Error(
      `Markdown plugin ordering contains a cycle: ${cyclic.join(", ")}.`
    )
  }
  return resolved
}

/** Compiles and validates a complete plugin set for one editor session. */
export function compileMarkdownPlugins(
  plugins: readonly MarkdownPlugin[]
): CompiledMarkdownPlugins {
  const ordered = resolvePluginOrder(plugins)
  const nodes: Klass<LexicalNode>[] = []
  const nodeTypes = new Map<string, Klass<LexicalNode>>()
  const nodeClasses = new Set<Klass<LexicalNode>>()
  const transformers: Array<
    MarkdownTransformerContribution & {
      contributionIndex: number
      pluginIndex: number
    }
  > = []
  const transformerObjects = new Set<
    MarkdownTransformerContribution["transformer"]
  >()
  const behaviors: CompiledMarkdownPluginBehavior[] = []
  const behaviorIds = new Set<string>()
  const insertions: CompiledMarkdownPluginInsertion[] = []
  const insertionIds = new Set<string>()
  const shortcuts: Record<string, MarkdownShortcutDefinition> = {}
  const toolbar: CompiledMarkdownPluginToolbarItem[] = []
  const toolbarIds = new Set<string>()
  const features = new Set<string>()

  ordered.forEach(({ plugin }, pluginIndex) => {
    for (const feature of plugin.features ?? []) {
      if (!isNamespacedId(feature)) {
        throw new Error(`Markdown feature ID "${feature}" must be namespaced.`)
      }
      features.add(feature)
    }

    for (const node of plugin.nodes ?? []) {
      if (nodeClasses.has(node)) continue
      const type = pluginNodeType(node)
      const existing = type ? nodeTypes.get(type) : undefined
      if (existing && existing !== node) {
        throw new Error(
          `Markdown plugins register different Lexical nodes for type "${type}".`
        )
      }
      nodeClasses.add(node)
      if (type) nodeTypes.set(type, node)
      nodes.push(node)
    }

    for (const [contributionIndex, contribution] of (
      plugin.transformers ?? []
    ).entries()) {
      if (transformerObjects.has(contribution.transformer)) continue
      transformerObjects.add(contribution.transformer)
      transformers.push({ ...contribution, contributionIndex, pluginIndex })
    }

    for (const behavior of plugin.behaviors ?? []) {
      if (!isNamespacedId(behavior.id)) {
        throw new Error(
          `Markdown behavior ID "${behavior.id}" must be namespaced.`
        )
      }
      if (behaviorIds.has(behavior.id)) {
        throw new Error(
          `Markdown behavior "${behavior.id}" is registered more than once.`
        )
      }
      behaviorIds.add(behavior.id)
      behaviors.push({ ...behavior, pluginId: plugin.id })
    }

    for (const insertion of plugin.insertions ?? []) {
      if (insertionIds.has(insertion.id)) {
        throw new Error(
          `Markdown insertion "${insertion.id}" is registered more than once.`
        )
      }
      if (!insertion.label && !insertion.labelKey) {
        throw new Error(
          `Markdown insertion "${insertion.id}" needs label or labelKey.`
        )
      }
      if (
        !insertion.execute &&
        (!plugin.id.startsWith("eidos.") ||
          !BUILT_IN_INSERTION_IDS.has(insertion.id))
      ) {
        throw new Error(
          `Markdown insertion "${insertion.id}" needs an execute handler.`
        )
      }
      if (insertion.execute && !isNamespacedId(insertion.id)) {
        throw new Error(
          `Markdown insertion ID "${insertion.id}" must be namespaced.`
        )
      }
      insertionIds.add(insertion.id)
      insertions.push({ ...insertion, pluginId: plugin.id })
    }

    for (const [id, definition] of Object.entries(plugin.shortcuts ?? {})) {
      if (!isNamespacedId(id)) {
        throw new Error(`Markdown shortcut ID "${id}" must be namespaced.`)
      }
      if (id in DEFAULT_MARKDOWN_SHORTCUTS || shortcuts[id]) {
        throw new Error(`Markdown shortcut "${id}" is registered twice.`)
      }
      shortcuts[id] = definition
    }

    for (const item of plugin.toolbar ?? []) {
      if (!isNamespacedId(item.id)) {
        throw new Error(
          `Markdown toolbar action ID "${item.id}" must be namespaced.`
        )
      }
      if (toolbarIds.has(item.id)) {
        throw new Error(
          `Markdown toolbar action "${item.id}" is registered more than once.`
        )
      }
      if (!item.label && !item.labelKey) {
        throw new Error(
          `Markdown toolbar action "${item.id}" needs label or labelKey.`
        )
      }
      if (!item.format && !item.execute) {
        throw new Error(
          `Markdown toolbar action "${item.id}" needs format or execute.`
        )
      }
      toolbarIds.add(item.id)
      toolbar.push({ ...item, pluginId: plugin.id })
    }
  })

  for (const item of toolbar) {
    if (
      item.shortcutId &&
      !(item.shortcutId in DEFAULT_MARKDOWN_SHORTCUTS) &&
      !shortcuts[item.shortcutId]
    ) {
      throw new Error(
        `Markdown toolbar action "${item.id}" references missing shortcut "${item.shortcutId}".`
      )
    }
  }

  const shortcutConflicts = markdownShortcutConflicts(
    resolveMarkdownShortcuts({}, shortcuts)
  )
  if (shortcutConflicts.length > 0) {
    const [left, right] = shortcutConflicts[0]
    throw new Error(
      `Markdown shortcuts "${left}" and "${right}" use the same binding and scope.`
    )
  }

  return Object.freeze({
    behaviors: Object.freeze(behaviors),
    features,
    insertions: Object.freeze(
      insertions.sort(
        (left, right) => (left.order ?? 1_000) - (right.order ?? 1_000)
      )
    ),
    nodes: Object.freeze(nodes),
    plugins: Object.freeze(ordered.map(({ plugin }) => plugin)),
    shortcuts: Object.freeze(shortcuts),
    signature: ordered
      .map(({ plugin }) => `${plugin.id}@${plugin.version}`)
      .join("|"),
    toolbar: Object.freeze(
      toolbar.sort(
        (left, right) => (left.order ?? 1_000) - (right.order ?? 1_000)
      )
    ),
    transformers: Object.freeze(
      transformers
        .sort(
          (left, right) =>
            (left.order ?? 1_000) - (right.order ?? 1_000) ||
            left.pluginIndex - right.pluginIndex ||
            left.contributionIndex - right.contributionIndex
        )
        .map(({ transformer }) => transformer)
    ),
  })
}

/** Defines an immutable, eagerly validated plugin collection. */
export function defineMarkdownPlugins(
  plugins: readonly MarkdownPlugin[]
): readonly MarkdownPlugin[] {
  compileMarkdownPlugins(plugins)
  return Object.freeze([...plugins])
}
