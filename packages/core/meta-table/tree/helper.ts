/**
 * Helper functions for tree operations
 */

/**
 * Check if a node can be moved to a parent without creating a loop
 * @param id node id to move
 * @param parentId target parent id
 * @param adjacencyList current tree structure
 * @returns true if move would create a loop
 */
export function checkForLoop(
  id: string,
  parentId: string,
  adjacencyList: Map<string, string[]>
): boolean {
  if (id === parentId) {
    return true
  }

  const visited = new Set<string>()
  return dfs(adjacencyList, visited, id, parentId)
}

/**
 * Depth-first search to detect cycles in tree structure
 * @param adjacencyList tree structure as adjacency list
 * @param visited set of visited nodes
 * @param node current node
 * @param target target node to find
 * @returns true if target is reachable from node
 */
export function dfs(
  adjacencyList: Map<string, string[]>,
  visited: Set<string>,
  node: string,
  target: string
): boolean {
  if (node === target) {
    return true
  }
  visited.add(node)
  const neighbors = adjacencyList.get(node) || []
  for (const neighbor of neighbors) {
    if (
      !visited.has(neighbor) &&
      dfs(adjacencyList, visited, neighbor, target)
    ) {
      return true
    }
  }
  return false
}

/**
 * Build adjacency list from tree data
 * @param treeData array of tree nodes
 * @returns adjacency list map
 */
export function buildAdjacencyList(
  treeData: Array<{ id: string; parent_id: string | null }>
): Map<string, string[]> {
  const adjacencyList = new Map<string, string[]>()
  for (const row of treeData) {
    const parentId = row.parent_id || "root"
    if (!adjacencyList.has(parentId)) {
      adjacencyList.set(parentId, [])
    }
    adjacencyList.get(parentId)!.push(row.id)
  }
  return adjacencyList
}

/**
 * Calculate new position for a node based on target position
 * @param parentChildren array of children in the target parent
 * @param targetId id of the target node
 * @param targetDirection direction relative to target
 * @returns new position value
 */
export function calculateNewPosition(
  parentChildren: Array<{ id: string; position: number }>,
  targetId: string,
  targetDirection: "up" | "down"
): number {
  const targetIndex = parentChildren.findIndex((node) => node.id === targetId)
  const prevIndex = targetDirection === "up" ? targetIndex - 1 : targetIndex
  const nextIndex = targetDirection === "up" ? targetIndex : targetIndex + 1
  const prevNode = parentChildren[prevIndex]
  const nextNode = parentChildren[nextIndex]

  if (prevIndex === -1) {
    return nextNode?.position! + 0.5
  }
  if (!nextNode) {
    return prevNode?.position! / 2
  }
  return ((prevNode?.position! || 0) + nextNode?.position!) / 2
}
