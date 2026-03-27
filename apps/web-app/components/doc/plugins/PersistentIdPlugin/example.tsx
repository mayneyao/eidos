/**
 * Example usage of Persistent ID feature
 *
 * This example demonstrates how to:
 * 1. Access node IDs
 * 2. Find nodes by ID
 * 3. Track node changes
 */

import { useCallback } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  usePersistentId,
  addPersistentIdsToState,
  diffStatesByPersistentId,
} from "@eidos.space/lexical"

export function PersistentIdExample() {
  const [editor] = useLexicalComposerContext()
  const { getSelectedNodeId, findNodeById, getAllNodeIds, generateId } =
    usePersistentId()

  // Example: Log all node IDs
  const logAllNodeIds = useCallback(() => {
    const ids = getAllNodeIds()
    console.log("All node IDs:", Array.from(ids.entries()))
  }, [getAllNodeIds])

  // Example: Find node by ID
  const handleFindNode = useCallback(
    (id: string) => {
      const { node, key } = findNodeById(id)
      if (node) {
        console.log(`Found node: type=${node.getType()}, key=${key}`)
      } else {
        console.log("Node not found")
      }
    },
    [findNodeById]
  )

  // Example: Get current selection ID
  const handleGetSelectionId = useCallback(() => {
    const id = getSelectedNodeId()
    console.log("Selected node ID:", id)
    return id
  }, [getSelectedNodeId])

  // Example: Add IDs to imported state
  const handleImportWithIds = useCallback((jsonState: string) => {
    const state = JSON.parse(jsonState)
    const stateWithIds = addPersistentIdsToState(state)
    return JSON.stringify(stateWithIds)
  }, [])

  // Example: Compare two document versions
  const handleCompareVersions = useCallback(
    (oldJson: string, newJson: string) => {
      const oldState = JSON.parse(oldJson)
      const newState = JSON.parse(newJson)

      const diff = diffStatesByPersistentId(oldState, newState)

      console.log("Added nodes:", diff.added.length)
      console.log("Removed nodes:", diff.removed.length)
      console.log("Changed nodes:", diff.changed.length)
      console.log("Unchanged nodes:", diff.unchanged.length)

      return diff
    },
    []
  )

  return (
    <div className="persistent-id-example">
      <button onClick={logAllNodeIds}>Log All Node IDs</button>
      <button onClick={handleGetSelectionId}>Get Selection ID</button>
      <button onClick={() => handleFindNode("some-id")}>Find Node by ID</button>
    </div>
  )
}

export default PersistentIdExample
