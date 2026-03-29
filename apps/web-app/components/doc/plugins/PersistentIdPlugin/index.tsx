/**
 * Persistent ID Plugin for Eidos Editor
 *
 * This plugin automatically assigns persistent IDs to all nodes in the document.
 * These IDs survive serialization, copy-paste, and collaboration.
 *
 * Based on Lexical NodeState API:
 * @see https://lexical.dev/docs/concepts/node-state
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  registerPersistentIdPlugin,
  createPersistentIdPlugin,
  $ensureNodePersistentId,
} from "@eidos.space/lexical"
import { useEffect } from "react"
import { $getRoot, $isElementNode, $getNodeByKey } from "lexical"

import { uuidv7 } from "@/lib/utils"

export interface PersistentIdPluginProps {
  /**
   * Whether to enable the plugin
   * @default true
   */
  enabled?: boolean

  /**
   * Whether to generate IDs for all node types
   * If false, only generates IDs for specific node types
   * @default true
   */
  allNodeTypes?: boolean

  /**
   * Specific node types to generate IDs for (when allNodeTypes is false)
   */
  nodeTypes?: string[]

  /**
   * Custom ID generator function
   * By default uses uuidv7 from @/lib/utils
   */
  idGenerator?: () => string
}

/**
 * Persistent ID Plugin
 *
 * Usage:
 * ```tsx
 * <PersistentIdPlugin />
 * // or with custom options:
 * <PersistentIdPlugin
 *   allNodeTypes={false}
 *   nodeTypes={["paragraph", "heading", "list"]}
 * />
 * ```
 */
export function PersistentIdPlugin({
  enabled = true,
  allNodeTypes = true,
  nodeTypes,
  idGenerator,
}: PersistentIdPluginProps) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!enabled) return

    // Use uuidv7 from the project as the ID generator
    const generateId = idGenerator || (() => uuidv7().replace(/-/g, ""))

    let unregister: (() => void) | null = null

    if (allNodeTypes && !nodeTypes) {
      // Use default plugin with all node types
      unregister = registerPersistentIdPlugin(editor)
    } else {
      // Use custom plugin with specific options
      const customPlugin = createPersistentIdPlugin({
        allNodeTypes: allNodeTypes ?? false,
        nodeTypes: nodeTypes || [],
        idGenerator: generateId,
      })
      unregister = customPlugin(editor)
    }

    return () => {
      if (unregister) {
        unregister()
      }
    }
  }, [editor, enabled, allNodeTypes, nodeTypes, idGenerator])

  // Initialize persistent IDs for existing nodes (for old documents)
  useEffect(() => {
    if (!enabled) return

    // Schedule a one-time update to ensure all existing nodes have IDs
    // This handles migration of old documents that don't have persistent IDs
    const timeoutId = setTimeout(() => {
      editor.getEditorState().read(() => {
        const root = $getRoot()
        const nodesWithoutId: string[] = []

        // Traverse all nodes to find those without IDs
        const traverse = (node: any) => {
          if (node.getType() === "root") {
            if ($isElementNode(node)) {
              node.getChildren().forEach(traverse)
            }
            return
          }
          // Check if node needs an ID (this is a read-only check)
          // We'll collect keys and then do a write operation
          nodesWithoutId.push(node.getKey())
          if ($isElementNode(node)) {
            node.getChildren().forEach(traverse)
          }
        }

        traverse(root)

        if (nodesWithoutId.length > 0) {
          // Schedule an update to add IDs to nodes that need them
          editor.update(
            () => {
              let addedCount = 0
              for (const key of nodesWithoutId) {
                const node = $getNodeByKey(key)
                if (node && node.getType() !== "root") {
                  const id = $ensureNodePersistentId(node)
                  if (id) addedCount++
                }
              }
              if (addedCount > 0) {
                console.log(
                  `[PersistentIdPlugin] Added persistent IDs to ${addedCount} existing nodes`
                )
              }
            },
            { discrete: true }
          )
        }
      })
    }, 100) // Small delay to ensure editor is fully initialized

    return () => clearTimeout(timeoutId)
  }, [editor, enabled])

  return null
}

export default PersistentIdPlugin
