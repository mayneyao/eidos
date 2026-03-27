/**
 * Node State for persistent IDs
 * Based on Lexical NodeState API (v0.26.0+)
 * @see https://lexical.dev/docs/concepts/node-state
 */

import { createState, $getState, $setState, type LexicalNode } from "lexical"

/**
 * Node state key for persistent ID
 * Serialized as '$' in JSON
 */
export const PERSISTENT_ID_KEY = "pid"

/**
 * State config for persistent node ID
 * This allows any node to have a persistent ID that survives serialization,
 * copy-paste, and collaboration
 */
export const persistentIdState = createState(PERSISTENT_ID_KEY, {
  parse: (v): string => {
    if (typeof v === "string" && v.length > 0) {
      return v
    }
    return ""
  },
})

/**
 * Get the persistent ID of a node
 * @param node - The lexical node
 * @returns The persistent ID or empty string if not set
 */
export function $getNodePersistentId(node: LexicalNode): string {
  return $getState(node, persistentIdState)
}

/**
 * Set the persistent ID of a node
 * @param node - The lexical node
 * @param id - The persistent ID to set
 */
export function $setNodePersistentId(node: LexicalNode, id: string): void {
  $setState(node, persistentIdState, id)
}

/**
 * Check if a node has a persistent ID
 * @param node - The lexical node
 * @returns True if the node has a persistent ID
 */
export function $hasNodePersistentId(node: LexicalNode): boolean {
  const id = $getState(node, persistentIdState)
  return id.length > 0
}

/**
 * Generate a new persistent ID
 * Uses UUID v7 format (timestamp-based, sortable) without hyphens
 * Format: 32 characters hex string
 * @returns A new unique ID without hyphens
 */
export function generatePersistentId(): string {
  // UUID v7-like implementation for browser environment
  // Format: timestamp (6 bytes) + version (1 nibble) + rand_a (12 bits) + variant (2 bits) + rand_b (62 bits)
  // Output: 32 hex characters without hyphens

  const timestamp = Date.now()
  const timeHex = timestamp.toString(16).padStart(12, "0")

  // Generate random parts
  const randomBytes = new Uint8Array(10)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes)
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < 10; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256)
    }
  }

  // Set version (7) in the first 4 bits of the 7th byte
  randomBytes[0] = (randomBytes[0] & 0x0f) | 0x70
  // Set variant (10) in the first 2 bits of the 9th byte
  randomBytes[2] = (randomBytes[2] & 0x3f) | 0x80

  // Convert to hex string
  const randomHex = Array.from(randomBytes, (b) =>
    b.toString(16).padStart(2, "0")
  ).join("")

  // Format without hyphens: 32 characters
  // timeHex (12) + version + random (remaining) = 32 characters
  return `${timeHex}7${randomHex.slice(1, 4)}${randomHex.slice(4, 8)}${randomHex.slice(8, 20)}`
}

/**
 * Ensure a node has a persistent ID
 * If the node doesn't have one, generates and sets a new ID
 * @param node - The lexical node
 * @returns The persistent ID (existing or newly generated)
 */
export function $ensureNodePersistentId(node: LexicalNode): string {
  let id = $getState(node, persistentIdState)
  if (!id) {
    id = generatePersistentId()
    $setState(node, persistentIdState, id)
  }
  return id
}
