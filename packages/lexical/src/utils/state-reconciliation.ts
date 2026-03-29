/**
 * State Reconciliation - Minimal Implementation
 *
 * Algorithm:
 * 1. Extract fingerprints from old state (with IDs)
 * 2. Extract fingerprints from intermediate state (structure only)
 * 3. Match by exact content (type + content_hash)
 * 4. Apply matched IDs to intermediate state
 */

import type { SerializedEditorState } from "lexical"
import { generatePersistentId } from "../node-state"
import {
  getSerializedNodePersistentId,
  setSerializedNodePersistentId,
} from "./persistent-id"

// ============ Types ============

interface NodeFingerprint {
  id?: string
  type: string
  content: string
  contentHash: string
  path: string // JSON path like "root.children[0].children[1]"
  format?: number
  indent?: number
  [key: string]: any
}

// ============ Content Hash ============

function hashContent(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36).slice(0, 8)
}

// ============ Fingerprint Extraction ============

/**
 * Extract fingerprints from a Lexical state
 */
function extractFingerprints(
  state: SerializedEditorState,
  includeIds = true
): NodeFingerprint[] {
  const fingerprints: NodeFingerprint[] = []

  function traverse(node: any, path: string): string {
    // Build content from children or direct text
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

    // Only fingerprint leaf nodes and significant structural nodes
    const isLeaf = node.text !== undefined
    const isSignificant = [
      "paragraph",
      "heading",
      "list",
      "listitem",
      "code",
      "quote",
    ].includes(node.type)

    if (isLeaf || isSignificant) {
      const fp: NodeFingerprint = {
        type: node.type,
        content,
        contentHash: hashContent(content),
        path,
      }

      if (includeIds) {
        fp.id = getSerializedNodePersistentId(node) || undefined
        if (node.format !== undefined) fp.format = node.format
        if (node.indent !== undefined) fp.indent = node.indent
      }

      fingerprints.push(fp)
    }

    return content
  }

  if ((state.root as any)?.children) {
    ;(state.root as any).children.forEach((child: any, i: number) => {
      traverse(child, `root.children[${i}]`)
    })
  }

  return fingerprints
}

// ============ Matching ============

/**
 * Build lookup map from old fingerprints: type + hash -> fingerprints[]
 */
function buildLookupMap(
  oldFingerprints: NodeFingerprint[]
): Map<string, NodeFingerprint[]> {
  const map = new Map<string, NodeFingerprint[]>()

  for (const fp of oldFingerprints) {
    if (!fp.id) continue

    const key = `${fp.type}:${fp.contentHash}`
    const existing = map.get(key) || []
    existing.push(fp)
    map.set(key, existing)
  }

  return map
}

/**
 * Extract index from path like "root.children[0]" -> 0
 */
function getPathIndex(path: string): number {
  const match = path.match(/children\[(\d+)\]$/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Find exact matches between old and new fingerprints
 * Uses position-aware matching for duplicate content
 */
function findMatches(
  oldFingerprints: NodeFingerprint[],
  newFingerprints: NodeFingerprint[]
): Map<string, NodeFingerprint> {
  const matches = new Map<string, NodeFingerprint>()
  const usedIds = new Set<string>()

  // Group old fingerprints by type+content for efficient lookup
  const oldByContent = new Map<string, NodeFingerprint[]>()
  for (const fp of oldFingerprints) {
    if (!fp.id) continue
    const key = `${fp.type}:${fp.content}`
    const existing = oldByContent.get(key) || []
    existing.push(fp)
    oldByContent.set(key, existing)
  }

  // Group new fingerprints by type+content
  const newByContent = new Map<string, NodeFingerprint[]>()
  for (const fp of newFingerprints) {
    const key = `${fp.type}:${fp.content}`
    const existing = newByContent.get(key) || []
    existing.push(fp)
    newByContent.set(key, existing)
  }

  // Match each group
  for (const [contentKey, newNodes] of newByContent) {
    const oldNodes = oldByContent.get(contentKey) || []

    if (oldNodes.length === 0) {
      // No matching old nodes for this content
      continue
    }

    if (oldNodes.length === 1 && newNodes.length === 1) {
      // Simple 1:1 match
      const oldFp = oldNodes[0]
      const newFp = newNodes[0]
      if (!usedIds.has(oldFp.id!)) {
        matches.set(newFp.path, oldFp)
        usedIds.add(oldFp.id!)
      }
    } else {
      // Multiple nodes with same content - use position-based matching
      // Sort by path index
      const sortedOld = [...oldNodes].sort(
        (a, b) => getPathIndex(a.path) - getPathIndex(b.path)
      )
      const sortedNew = [...newNodes].sort(
        (a, b) => getPathIndex(a.path) - getPathIndex(b.path)
      )

      // Greedy matching: match closest positions
      const availableOld = sortedOld.filter((fp) => !usedIds.has(fp.id!))

      for (const newFp of sortedNew) {
        if (availableOld.length === 0) break

        const newIndex = getPathIndex(newFp.path)

        // Find closest unmatched old node
        let bestMatch: NodeFingerprint | null = null
        let bestDistance = Infinity
        let bestIndex = -1

        for (let i = 0; i < availableOld.length; i++) {
          const oldFp = availableOld[i]
          const oldIndex = getPathIndex(oldFp.path)
          const distance = Math.abs(newIndex - oldIndex)

          if (distance < bestDistance) {
            bestDistance = distance
            bestMatch = oldFp
            bestIndex = i
          }
        }

        if (bestMatch) {
          matches.set(newFp.path, bestMatch)
          usedIds.add(bestMatch.id!)
          availableOld.splice(bestIndex, 1)
        }
      }
    }
  }

  return matches
}

// ============ State Building ============

/**
 * Apply matched IDs to a state object (mutates)
 */
function applyMatches(
  state: SerializedEditorState,
  matches: Map<string, NodeFingerprint>
): SerializedEditorState {
  const usedIds = new Set<string>()

  function traverse(node: any, path: string) {
    // Check if this node has a match
    const match = matches.get(path)

    if (match?.id && !usedIds.has(match.id)) {
      setSerializedNodePersistentId(node, match.id)
      usedIds.add(match.id)

      // Migrate preserved properties
      if (match.format !== undefined) node.format = match.format
      if (match.indent !== undefined) node.indent = match.indent
    } else {
      // Generate new ID
      const newId = generatePersistentId()
      setSerializedNodePersistentId(node, newId)
    }

    // Process children
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

  return state
}

// ============ Main API ============

/**
 * Reconcile intermediate state with old state to preserve IDs
 *
 * @param oldState - Previous state with IDs
 * @param intermediateState - New state from markdown (no IDs)
 * @returns intermediateState with IDs applied
 */
export function reconcileState(
  oldState: SerializedEditorState,
  intermediateState: SerializedEditorState
): SerializedEditorState {
  // Deep clone intermediate state to avoid mutation
  const newState = JSON.parse(JSON.stringify(intermediateState))

  // Extract fingerprints
  const oldFingerprints = extractFingerprints(oldState, true)
  const newFingerprints = extractFingerprints(newState, false)

  // Find matches
  const matches = findMatches(oldFingerprints, newFingerprints)

  // Apply IDs
  return applyMatches(newState, matches)
}

/**
 * Get reconciliation statistics for debugging
 */
export function getReconciliationStats(
  oldState: SerializedEditorState,
  intermediateState: SerializedEditorState
) {
  const oldFingerprints = extractFingerprints(oldState, true)
  const newFingerprints = extractFingerprints(intermediateState, false)
  const matches = findMatches(oldFingerprints, newFingerprints)

  const oldNodesWithId = oldFingerprints.filter((fp) => fp.id).length
  const preservedIds = Array.from(matches.values()).filter((fp) => fp.id).length

  return {
    oldNodeCount: oldFingerprints.length,
    newNodeCount: newFingerprints.length,
    matchedCount: matches.size,
    idPreservationRate: oldNodesWithId > 0 ? preservedIds / oldNodesWithId : 1,
    oldNodesWithId,
    preservedIds,
  }
}

// ============ Exports ============

export { extractFingerprints, hashContent }
export type { NodeFingerprint }
