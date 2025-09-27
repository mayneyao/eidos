import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import type { TreeSortField, TreeSortOrder } from "./tree-sidebar-store"

export interface FlattenedNode {
  node: ITreeNode
  depth: number
  index: number
  isVisible: boolean
}

/**
 * Flattens a tree structure into a linear array for virtual scrolling
 * Only includes visible nodes (folders that are expanded show their children)
 * Note: This function assumes that all nodes (including children) are already provided
 * in the nodes array, and it filters them based on parent_id relationships
 */
export const flattenTree = (
  nodes: ITreeNode[],
  folders: Record<string, boolean>,
  depth: number = 0,
  startIndex: number = 0,
  parentId: string | null = null,
  searchTerm: string = "",
  sortField: TreeSortField = "name",
  sortOrder: TreeSortOrder = "ASC"
): FlattenedNode[] => {
  const result: FlattenedNode[] = []
  let currentIndex = startIndex

  // Filter nodes that belong to the current level (same parent_id)
  let currentLevelNodes = nodes.filter(node => node.parent_id === parentId)

  // Apply search filter
  if (searchTerm) {
    currentLevelNodes = currentLevelNodes.filter(node => 
      node.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }

  // Apply sorting
  currentLevelNodes = sortNodes(currentLevelNodes, sortField, sortOrder)

  for (const node of currentLevelNodes) {
    // Add the current node
    result.push({
      node,
      depth,
      index: currentIndex,
      isVisible: true,
    })
    currentIndex++

    // If it's a folder and it's expanded, recursively add its children
    if (node.type === "folder" && folders[node.id]) {
      const childResults = flattenTree(nodes, folders, depth + 1, currentIndex, node.id, searchTerm, sortField, sortOrder)
      result.push(...childResults)
      currentIndex += childResults.length
    }
  }

  return result
}

/**
 * Sorts nodes based on the specified field and order
 */
const sortNodes = (
  nodes: ITreeNode[],
  sortField: TreeSortField,
  sortOrder: TreeSortOrder
): ITreeNode[] => {
  return [...nodes].sort((a, b) => {
    let aValue: string | number
    let bValue: string | number

    switch (sortField) {
      case "name":
        aValue = a.name.toLowerCase()
        bValue = b.name.toLowerCase()
        break
      case "type":
        aValue = a.type.toLowerCase()
        bValue = b.type.toLowerCase()
        break
      case "created_at":
        aValue = new Date(a.created_at || 0).getTime()
        bValue = new Date(b.created_at || 0).getTime()
        break
      default:
        aValue = a.name.toLowerCase()
        bValue = b.name.toLowerCase()
    }

    if (aValue < bValue) {
      return sortOrder === "ASC" ? -1 : 1
    }
    if (aValue > bValue) {
      return sortOrder === "ASC" ? 1 : -1
    }
    return 0
  })
}

/**
 * Gets the total height of all visible nodes in the tree
 */
export const getTreeHeight = (flattenedNodes: FlattenedNode[], itemHeight: number = 32): number => {
  return flattenedNodes.length * itemHeight
}

/**
 * Finds the index of a node in the flattened structure
 */
export const findNodeIndex = (
  flattenedNodes: FlattenedNode[],
  nodeId: string
): number => {
  return flattenedNodes.findIndex(item => item.node.id === nodeId)
}
