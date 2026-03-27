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
} from "@eidos.space/lexical"
import { useEffect } from "react"

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

  return null
}

export default PersistentIdPlugin
