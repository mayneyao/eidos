/**
 * ID Harness - Content-fingerprint based node ID preservation system
 *
 * Core idea: Similar to Hashline, use content fingerprints to locate nodes
 * instead of relying on perfect replication
 * Used to preserve persistent IDs during Markdown ↔ Lexical conversion
 *
 * @see https://blog.can.ac/2026/02/12/the-harness-problem/
 */

import type { SerializedEditorState, SerializedLexicalNode } from "lexical"
import { generatePersistentId } from "../node-state"
import {
  getSerializedNodePersistentId,
  setSerializedNodePersistentId,
} from "./persistent-id"

/**
 * Node content fingerprint configuration
 */
export interface HarnessOptions {
  /** Content hash length (short hash, similar to Hashline) */
  hashLength?: number
  /** Whether to enable fuzzy matching (edit distance) */
  fuzzyMatch?: boolean
  /** Fuzzy matching threshold (0-1, default 0.3 means within 30% difference) */
  fuzzyThreshold?: number
  /** Whether to enable Harness (default true) */
  useHarness?: boolean
}

/**
 * Fingerprint → ID mapping
 */
export type FingerprintIdMap = Map<string, string>

/**
 * Serialized node type with children
 */
interface SerializedElementNode extends SerializedLexicalNode {
  children?: SerializedLexicalNode[]
}

function extractContent(node: SerializedLexicalNode): string {
  const nodeWithChildren = node as SerializedElementNode
  if ((node as any).text !== undefined) {
    return String((node as any).text)
  }
  if (nodeWithChildren.children) {
    return nodeWithChildren.children
      .map((c: SerializedLexicalNode) => extractContent(c))
      .join("")
  }
  // For nodes without text content (e.g., divider, linebreak), use type as content
  return `__${node.type}__`
}

/**
 * Compute content hash - lightweight hash, similar to Hashline's short hash
 */
function computeHash(content: string, length: number = 6): string {
  // Take first 200 chars + length as input to avoid hash collisions
  const input = content.slice(0, 200) + `|len:${content.length}`

  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }

  // Convert to positive and take first N chars
  const hex = Math.abs(hash).toString(16).padStart(8, "0")
  return hex.slice(0, length)
}

/**
 * Compute edit distance (Levenshtein Distance)
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length < b.length) return levenshteinDistance(b, a)
  if (b.length === 0) return a.length

  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j - 1] + 1, // replace
              matrix[i][j - 1] + 1, // insert
              matrix[i - 1][j] + 1 // delete
            )
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Build fingerprint → ID mapping from Lexical State
 *
 * This is the core of Harness: give each node a stable "address label"
 */
export function buildFingerprintMap(
  state: SerializedEditorState,
  options: { hashLength?: number } = {}
): FingerprintIdMap {
  const { hashLength = 6 } = options
  const map = new Map<string, string>()

  function traverse(
    node: SerializedLexicalNode,
    path: string = "root",
    index: number = 0,
    parentTypes: string[] = []
  ) {
    const nodeWithChildren = node as SerializedElementNode

    // Skip root
    if (node.type === "root") {
      nodeWithChildren.children?.forEach(
        (child: SerializedLexicalNode, i: number) => {
          traverse(child, `${path}/0`, i, ["root"])
        }
      )
      return
    }

    const id = getSerializedNodePersistentId(node)
    if (id) {
      const content = extractContent(node)
      const contentHash = computeHash(content, hashLength)

      // Build multi-level fingerprints to increase matching chances
      const fingerprints: string[] = [
        // Exact match: type + content + exact path
        `${node.type}:${contentHash}:${path}/${index}`,
        // Medium match: type + content + parent type chain
        `${node.type}:${contentHash}:${parentTypes.join("/")}`,
        // Loose match: type + content only
        `${node.type}:${contentHash}`,
      ]

      // Store mappings for all levels
      fingerprints.forEach((key) => {
        if (!map.has(key)) {
          map.set(key, id)
        }
      })
    }

    // Recursively process children
    if (nodeWithChildren.children) {
      const newParentTypes = [...parentTypes, node.type]
      nodeWithChildren.children.forEach(
        (child: SerializedLexicalNode, i: number) => {
          traverse(child, `${path}/${index}`, i, newParentTypes)
        }
      )
    }
  }

  traverse(state.root)
  return map
}

/**
 * Find fuzzy match (edit distance)
 */
function findFuzzyMatch(
  node: SerializedLexicalNode,
  candidates: Array<{ node: SerializedLexicalNode; id: string }>,
  threshold: number
): string | null {
  const newContent = extractContent(node)
  if (newContent.length < 10) return null // Too short for fuzzy matching

  let bestMatch: { id: string; similarity: number } | null = null

  for (const { node: oldNode, id } of candidates) {
    const oldContent = extractContent(oldNode)
    if (oldContent.length < 10) continue

    // Quick pre-filter: skip if length difference is too large
    const lengthDiff = Math.abs(newContent.length - oldContent.length)
    if (
      lengthDiff / Math.max(newContent.length, oldContent.length) >
      threshold
    ) {
      continue
    }

    const distance = levenshteinDistance(newContent, oldContent)
    const similarity =
      1 - distance / Math.max(newContent.length, oldContent.length)

    if (
      similarity > threshold &&
      (!bestMatch || similarity > bestMatch.similarity)
    ) {
      bestMatch = { id, similarity }
    }
  }

  return bestMatch?.id || null
}

/**
 * Find matching ID for node
 * Uses progressive relaxation matching strategy
 */
function findMatchingId(
  node: SerializedLexicalNode,
  path: string,
  index: number,
  parentTypes: string[],
  fingerprintMap: FingerprintIdMap,
  usedIds: Set<string>,
  allOldNodes: Array<{ node: SerializedLexicalNode; id: string }>,
  options: HarnessOptions
): string | null {
  const content = extractContent(node)
  const contentHash = computeHash(content, options.hashLength ?? 6)

  // Matching strategies: from exact to loose
  const strategies = [
    // 1. Exact match: type + content + exact path
    `${node.type}:${contentHash}:${path}/${index}`,
    // 2. Medium match: type + content + parent type chain
    `${node.type}:${contentHash}:${parentTypes.join("/")}`,
    // 3. Loose match: type + content only (for moved nodes)
    `${node.type}:${contentHash}`,
    // 4. Ultra-loose: type + hash of first 50 chars (for minor edits)
    `${node.type}:${computeHash(content.slice(0, 50), options.hashLength ?? 6)}`,
  ]

  // Try exact matching
  for (const key of strategies) {
    const id = fingerprintMap.get(key)
    if (id && !usedIds.has(id)) {
      return id
    }
  }

  // Try fuzzy matching if enabled
  if (options.fuzzyMatch) {
    const fuzzyId = findFuzzyMatch(
      node,
      allOldNodes.filter((n) => !usedIds.has(n.id)),
      options.fuzzyThreshold ?? 0.3
    )
    if (fuzzyId) return fuzzyId
  }

  return null
}

/**
 * Smart ID assignment - core Harness logic
 *
 * Inspired by Hashline: use content fingerprint matching instead of perfect replication
 */
export function assignIdsViaHarness(
  newState: SerializedEditorState,
  oldState: SerializedEditorState | null,
  options: HarnessOptions = {}
): SerializedEditorState {
  // If Harness is disabled, generate new IDs
  if (options.useHarness === false) {
    return assignNewIds(newState)
  }

  if (!oldState) {
    // No old state, generate new IDs for all nodes
    return assignNewIds(newState)
  }

  // 1. Build fingerprint map from old state
  const fingerprintMap = buildFingerprintMap(oldState, {
    hashLength: options.hashLength ?? 6,
  })

  // 2. Collect all old nodes with IDs (for fuzzy matching)
  const allOldNodes: Array<{ node: SerializedLexicalNode; id: string }> = []
  function collectOldNodes(node: SerializedLexicalNode) {
    const nodeWithChildren = node as SerializedElementNode
    if (node.type === "root") {
      nodeWithChildren.children?.forEach(collectOldNodes)
      return
    }
    const id = getSerializedNodePersistentId(node)
    if (id) {
      allOldNodes.push({ node, id })
    }
    if (nodeWithChildren.children) {
      nodeWithChildren.children.forEach(collectOldNodes)
    }
  }
  collectOldNodes(oldState.root)

  // 3. Track used IDs (to avoid duplicate assignment)
  const usedIds = new Set<string>()

  // 4. Assign IDs to new state nodes
  function traverseAndAssign(
    node: SerializedLexicalNode,
    path: string = "root",
    index: number = 0,
    parentTypes: string[] = []
  ): SerializedLexicalNode {
    const nodeWithChildren = node as SerializedElementNode

    if (node.type === "root") {
      return {
        ...node,
        children: nodeWithChildren.children?.map(
          (child: SerializedLexicalNode, i: number) =>
            traverseAndAssign(child, `${path}/0`, i, ["root"])
        ),
      } as SerializedLexicalNode
    }

    // Try to find matching ID
    const matchedId = findMatchingId(
      node,
      path,
      index,
      parentTypes,
      fingerprintMap,
      usedIds,
      allOldNodes,
      options
    )

    if (matchedId) {
      setSerializedNodePersistentId(node, matchedId)
      usedIds.add(matchedId)
    } else {
      // No match, generate new ID
      setSerializedNodePersistentId(node, generatePersistentId())
    }

    // Recursively process children
    if (nodeWithChildren.children) {
      const newParentTypes = [...parentTypes, node.type]
      nodeWithChildren.children = nodeWithChildren.children.map(
        (child: SerializedLexicalNode, i: number) =>
          traverseAndAssign(child, `${path}/${index}`, i, newParentTypes)
      )
    }

    return node
  }

  const newRoot = traverseAndAssign(newState.root)

  return {
    ...newState,
    root: newRoot as any,
  }
}

/**
 * Assign new IDs to all nodes
 */
function assignNewIds(state: SerializedEditorState): SerializedEditorState {
  function traverse(node: SerializedLexicalNode): void {
    const nodeWithChildren = node as SerializedElementNode
    if (node.type !== "root") {
      setSerializedNodePersistentId(node, generatePersistentId())
    }
    if (nodeWithChildren.children) {
      nodeWithChildren.children.forEach(traverse)
    }
  }
  traverse(state.root)
  return state
}
