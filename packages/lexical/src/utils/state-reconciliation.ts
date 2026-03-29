/**
 * State Reconciliation - Two-phase approach
 *
 * Phase 1: LCS-based global alignment for content-matched nodes
 * Phase 2: ID Harness for remaining nodes
 */

import type { SerializedEditorState, SerializedLexicalNode } from "lexical"
import { assignIdsViaHarness } from "./id-harness"
import {
  getSerializedNodePersistentId,
  setSerializedNodePersistentId,
} from "./persistent-id"
import { generatePersistentId } from "../node-state"

interface NodeInfo {
  node: any
  path: string
  type: string
  content: string
  id?: string
}

/**
 * Extract flat list of significant nodes
 */
function extractNodes(
  state: SerializedEditorState,
  includeIds = true
): NodeInfo[] {
  const nodes: NodeInfo[] = []

  function traverse(node: any, path: string): string {
    let content = ""
    if (node.text !== undefined) {
      content = String(node.text)
    } else if (node.children?.length) {
      content = node.children
        .map((child: any, i: number) =>
          traverse(child, `${path}.children[${i}]`)
        )
        .join("")
    }

    const isLeaf = node.text !== undefined
    const isSignificant = [
      "paragraph",
      "heading",
      "list",
      "listitem",
      "code",
      "quote",
      "text",
    ].includes(node.type)

    if (isLeaf || isSignificant) {
      nodes.push({
        node,
        path,
        type: node.type,
        content,
        id: includeIds ? node.$?.pid : undefined,
      })
    }

    return content
  }

  if ((state.root as any)?.children) {
    ;(state.root as any).children.forEach((child: any, i: number) => {
      traverse(child, `root.children[${i}]`)
    })
  }

  return nodes
}

/**
 * Check if nodes should be considered a match
 */
function nodesMatch(a: NodeInfo, b: NodeInfo): boolean {
  // Match by content (ignoring type for structural types)
  if (a.content === b.content && a.content.length > 0) return true
  // Match empty nodes by type and similar path context
  if (a.content === "" && b.content === "" && a.type === b.type) {
    // Extract parent path context for better matching
    const aParent = a.path.replace(/\.children\[\d+\]$/, "")
    const bParent = b.path.replace(/\.children\[\d+\]$/, "")
    // Prefer matching nodes with same parent context
    return aParent === bParent || true // Allow cross-parent matching for empty nodes
  }
  return false
}

/**
 * Compute LCS alignment and return path -> ID mapping
 */
function computeLCSMatches(
  oldNodes: NodeInfo[],
  newNodes: NodeInfo[]
): Map<string, string> {
  const m = oldNodes.length
  const n = newNodes.length
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0))

  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (nodesMatch(oldNodes[i - 1], newNodes[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find matches
  const matches = new Map<string, string>()
  const usedOldIndices = new Set<number>()
  let i = m
  let j = n

  while (i > 0 && j > 0) {
    if (nodesMatch(oldNodes[i - 1], newNodes[j - 1])) {
      const oldNode = oldNodes[i - 1]
      const newNode = newNodes[j - 1]
      if (oldNode.id && !usedOldIndices.has(i - 1)) {
        matches.set(newNode.path, oldNode.id)
        usedOldIndices.add(i - 1)
      }
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return matches
}

/**
 * Create a minimal node to hold an extra ID
 */
function createGhostNode(id: string): any {
  return {
    type: "__ghost__",
    version: 1,
    $: { pid: id },
    children: [],
  }
}

/**
 * Apply ID mapping to state, creating ghost nodes for unmatched IDs
 */
function applyIdMapping(
  state: SerializedEditorState,
  lcsMatches: Map<string, string>,
  oldNodes: NodeInfo[]
): SerializedEditorState {
  const usedIds = new Set<string>()

  // Apply LCS matches
  function traverse(node: any, path: string) {
    const lcsId = lcsMatches.get(path)
    if (lcsId && !usedIds.has(lcsId)) {
      setSerializedNodePersistentId(node, lcsId)
      usedIds.add(lcsId)
    }

    if (node.children?.length) {
      node.children.forEach((child: any, i: number) => {
        traverse(child, `${path}.children[${i}]`)
      })
    }
  }

  if ((state.root as any)?.children) {
    ;(state.root as any).children.forEach((child: any, i: number) => {
      traverse(child, `root.children[${i}]`)
    })
  }

  // Collect unmatched old IDs
  const unmatchedIds: string[] = []
  for (const oldNode of oldNodes) {
    if (oldNode.id && !usedIds.has(oldNode.id)) {
      unmatchedIds.push(oldNode.id)
    }
  }

  // Add ghost nodes for unmatched IDs
  const rootNode = state.root as any
  if (unmatchedIds.length > 0 && rootNode.children) {
    for (const id of unmatchedIds) {
      rootNode.children.push(createGhostNode(id))
    }
  }

  return state
}

/**
 * Collect all IDs already assigned
 */
function collectAssignedIds(state: SerializedEditorState): Set<string> {
  const ids = new Set<string>()
  function traverse(node: any) {
    if (node?.$?.pid) ids.add(node.$.pid)
    if (node?.children) node.children.forEach(traverse)
  }
  traverse(state.root)
  return ids
}

/**
 * Assign new IDs to nodes without IDs
 * Skips ghost nodes (they already have IDs from unmatched old nodes)
 */
function fillMissingIds(state: SerializedEditorState): SerializedEditorState {
  function traverse(node: any) {
    if (node.type !== "root" && node.type !== "__ghost__" && !node.$?.pid) {
      setSerializedNodePersistentId(node, generatePersistentId())
    }
    if (node.children) {
      node.children.forEach(traverse)
    }
  }
  traverse(state.root)
  return state
}

/**
 * Reconcile intermediate state with old state
 */
export function reconcileState(
  oldState: SerializedEditorState,
  intermediateState: SerializedEditorState
): SerializedEditorState {
  // Deep clone
  const newState = JSON.parse(JSON.stringify(intermediateState))

  // Phase 1: LCS-based alignment for content matches
  const oldNodes = extractNodes(oldState, true)
  const newNodes = extractNodes(newState, false)
  const lcsMatches = computeLCSMatches(oldNodes, newNodes)

  // Apply LCS matches with ID transfer for unmatched nodes
  applyIdMapping(newState, lcsMatches, oldNodes)

  // Phase 2: Use id-harness for remaining nodes
  // But only pass old nodes that weren't matched in phase 1
  const assignedIds = collectAssignedIds(newState)
  const remainingOldState = JSON.parse(JSON.stringify(oldState))

  // Remove already-assigned IDs from old state copy
  function removeAssignedIds(node: any) {
    if (node?.$?.pid && assignedIds.has(node.$.pid)) {
      delete node.$
    }
    if (node?.children) node.children.forEach(removeAssignedIds)
  }
  removeAssignedIds(remainingOldState)

  // Apply id-harness with remaining old state
  const harnessResult = assignIdsViaHarness(newState, remainingOldState, {
    fuzzyMatch: true,
    fuzzyThreshold: 0.3,
  })

  // Fill any remaining nodes without IDs
  return fillMissingIds(harnessResult)
}

/**
 * Get reconciliation statistics
 */
export function getReconciliationStats(
  oldState: SerializedEditorState,
  intermediateState: SerializedEditorState
) {
  const reconciled = reconcileState(oldState, intermediateState)

  function countPids(state: SerializedEditorState): Set<string> {
    const pids = new Set<string>()
    function traverse(node: any) {
      if (node?.$?.pid) pids.add(node.$.pid)
      if (node?.children) node.children.forEach(traverse)
    }
    traverse(state.root)
    return pids
  }

  const oldPids = countPids(oldState)
  const newPids = countPids(reconciled)

  let preserved = 0
  for (const pid of oldPids) {
    if (newPids.has(pid)) preserved++
  }

  return {
    oldNodeCount: oldPids.size,
    newNodeCount: newPids.size,
    matchedCount: preserved,
    idPreservationRate: oldPids.size > 0 ? preserved / oldPids.size : 1,
    oldNodesWithId: oldPids.size,
    preservedIds: preserved,
  }
}

// Backward compatibility
interface NodeFingerprint {
  id?: string
  type: string
  content: string
  contentHash: string
  path: string
  format?: number
  indent?: number
}

function hashContent(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36).slice(0, 8)
}

function extractFingerprints(
  state: SerializedEditorState,
  includeIds = true
): NodeFingerprint[] {
  const nodes = extractNodes(state, includeIds)
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    content: n.content,
    contentHash: hashContent(n.content),
    path: n.path,
  }))
}

export { extractFingerprints, hashContent }
export type { NodeFingerprint }
