/**
 * Persistent ID Plugin
 * Automatically assigns persistent IDs to nodes when they are created
 */

import {
  $getState,
  $setState,
  $getNodeByKey,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical"
import { persistentIdState, generatePersistentId } from "../node-state"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useEffect } from "react"

/**
 * React component version of the Persistent ID Plugin
 */
export function PersistentIdPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return registerPersistentIdPlugin(editor)
  }, [editor])

  return null
}

/**
 * Ensure a node has a persistent ID
 * This function should be called within an editor update
 */
export function $ensureNodePersistentId(node: LexicalNode): void {
  if (node.getType() === "root") return

  const existingId = $getState(node, persistentIdState)
  if (!existingId) {
    const id = generatePersistentId()
    $setState(node, persistentIdState, id)
  }
}

/**
 * Register the persistent ID plugin
 * This plugin automatically assigns persistent IDs to all new nodes.
 *
 * @param editor - The Lexical editor instance
 * @returns Unregister function
 */
export function registerPersistentIdPlugin(editor: LexicalEditor): () => void {
  // Track IDs seen in previous state to detect duplicates
  let previousIds = new Map<string, NodeKey>()

  // Process nodes that need IDs after each update
  const unregisterUpdateListener = editor.registerUpdateListener(
    ({ dirtyElements, dirtyLeaves, editorState, prevEditorState }) => {
      // Collect all dirty node keys
      const dirtyKeys = new Set<NodeKey>([
        ...Array.from(dirtyElements.keys()),
        ...Array.from(dirtyLeaves.keys()),
      ])

      if (dirtyKeys.size === 0) return

      // Use read to check which nodes need IDs and detect duplicates, then update
      editorState.read(() => {
        const keysNeedingIds: NodeKey[] = []
        const keysWithDuplicateIds: NodeKey[] = []
        const currentIds = new Map<string, NodeKey>()

        // First pass: collect all existing IDs in current state
        const collectIds = (node: LexicalNode) => {
          if (node.getType() === "root") {
            // @ts-ignore
            if (node.getChildren) {
              // @ts-ignore
              node.getChildren().forEach(collectIds)
            }
            return
          }
          const id = $getState(node, persistentIdState)
          if (id) {
            if (currentIds.has(id)) {
              // Duplicate ID detected - mark for regeneration
              keysWithDuplicateIds.push(node.getKey())
            } else {
              currentIds.set(id, node.getKey())
            }
          }
          // @ts-ignore
          if (node.getChildren) {
            // @ts-ignore
            node.getChildren().forEach(collectIds)
          }
        }

        // Collect all IDs from root
        const root = editorState._nodeMap.get("root")
        if (root) {
          collectIds(root)
        }

        for (const key of dirtyKeys) {
          const node = $getNodeByKey(key)
          if (!node) continue
          if (node.getType() === "root") continue

          // Check if node already has a persistent ID
          const existingId = $getState(node, persistentIdState)
          if (!existingId) {
            keysNeedingIds.push(key)
          }
        }

        // Update previous IDs for next comparison
        previousIds = currentIds

        // If there are nodes needing IDs or with duplicates, schedule an update
        if (keysNeedingIds.length > 0 || keysWithDuplicateIds.length > 0) {
          // Use queueMicrotask to avoid synchronous update issues
          queueMicrotask(() => {
            editor.update(
              () => {
                // Handle nodes without IDs
                for (const key of keysNeedingIds) {
                  const node = $getNodeByKey(key)
                  if (!node) continue
                  if (node.getType() === "root") continue

                  // Double-check ID hasn't been set
                  const existingId = $getState(node, persistentIdState)
                  if (!existingId) {
                    const id = generatePersistentId()
                    $setState(node, persistentIdState, id)
                  }
                }

                // Handle nodes with duplicate IDs (from copy/split operations)
                for (const key of keysWithDuplicateIds) {
                  const node = $getNodeByKey(key)
                  if (!node) continue
                  if (node.getType() === "root") continue

                  // Force regenerate ID for duplicate
                  const id = generatePersistentId()
                  $setState(node, persistentIdState, id)
                }
              },
              { discrete: true }
            )
          })
        }
      })
    }
  )

  return () => {
    unregisterUpdateListener()
  }
}

/**
 * Options for the persistent ID plugin
 */
export interface PersistentIdPluginOptions {
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
   */
  idGenerator?: () => string
}

/**
 * Create a persistent ID plugin with custom options
 */
export function createPersistentIdPlugin(options: PersistentIdPluginOptions) {
  const { allNodeTypes = true, nodeTypes = [], idGenerator } = options
  const generateId = idGenerator || generatePersistentId
  const allowedNodeTypes = new Set(nodeTypes)

  return function (editor: LexicalEditor): () => void {
    const unregisterUpdateListener = editor.registerUpdateListener(
      ({ dirtyElements, dirtyLeaves, editorState }) => {
        const dirtyKeys = new Set<NodeKey>([
          ...Array.from(dirtyElements.keys()),
          ...Array.from(dirtyLeaves.keys()),
        ])

        if (dirtyKeys.size === 0) return

        editorState.read(() => {
          const keysNeedingIds: NodeKey[] = []

          for (const key of dirtyKeys) {
            const node = $getNodeByKey(key)
            if (!node) continue
            if (node.getType() === "root") continue

            const shouldGenerateId =
              allNodeTypes || allowedNodeTypes.has(node.getType())
            if (!shouldGenerateId) continue

            const existingId = $getState(node, persistentIdState)
            if (!existingId) {
              keysNeedingIds.push(key)
            }
          }

          if (keysNeedingIds.length > 0) {
            queueMicrotask(() => {
              editor.update(
                () => {
                  for (const key of keysNeedingIds) {
                    const node = $getNodeByKey(key)
                    if (!node) continue
                    if (node.getType() === "root") continue

                    const shouldGenerateId =
                      allNodeTypes || allowedNodeTypes.has(node.getType())
                    if (!shouldGenerateId) continue

                    const existingId = $getState(node, persistentIdState)
                    if (!existingId) {
                      const id = generateId()
                      $setState(node, persistentIdState, id)
                    }
                  }
                },
                { discrete: true }
              )
            })
          }
        })
      }
    )

    return () => {
      unregisterUpdateListener()
    }
  }
}
