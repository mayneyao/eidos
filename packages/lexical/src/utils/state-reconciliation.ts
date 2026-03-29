/**
 * State Reconciliation - Delegates to ID Harness
 *
 * Uses the mature ID Harness algorithm for robust node ID preservation
 */

import type { SerializedEditorState } from "lexical"
import { assignIdsViaHarness } from "./id-harness"

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

  // Use ID Harness for robust ID assignment
  return assignIdsViaHarness(newState, oldState, {
    fuzzyMatch: true,
    fuzzyThreshold: 0.3,
    hashLength: 6,
  })
}

/**
 * Get reconciliation statistics for debugging
 */
export function getReconciliationStats(
  oldState: SerializedEditorState,
  intermediateState: SerializedEditorState
) {
  const reconciled = reconcileState(oldState, intermediateState)

  // Count PIDs in both states
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

// Stub implementations for backward compatibility
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
  const fingerprints: NodeFingerprint[] = []

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
    ].includes(node.type)

    if (isLeaf || isSignificant) {
      const fp: NodeFingerprint = {
        type: node.type,
        content,
        contentHash: hashContent(content),
        path,
        id: includeIds ? node.$?.pid : undefined,
        format: node.format,
        indent: node.indent,
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

export { extractFingerprints, hashContent }
export type { NodeFingerprint }
