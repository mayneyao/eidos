/**
 * State Merger - Merge Lexical states in headless environment
 *
 * For append/prepend scenarios, completely in Node.js environment,
 * no frontend rendering dependency
 */

import type { SerializedEditorState, SerializedLexicalNode } from "lexical"

/**
 * Serialized node type with children
 */
interface SerializedElementNode extends SerializedLexicalNode {
  children?: SerializedLexicalNode[]
}

/**
 * Merge two Lexical states
 *
 * @param baseState - Base state (existing document)
 * @param newState - New state (content to add)
 * @param mode - Merge mode: prepend adds at beginning, append adds at end
 * @returns Merged state
 */
export function mergeLexicalStates(
  baseState: SerializedEditorState | string,
  newState: SerializedEditorState | string,
  mode: "prepend" | "append" = "append"
): SerializedEditorState {
  // Parse states (if strings)
  const _baseState =
    typeof baseState === "string"
      ? (JSON.parse(baseState) as SerializedEditorState)
      : baseState
  const _newState =
    typeof newState === "string"
      ? (JSON.parse(newState) as SerializedEditorState)
      : newState

  // Get children from both states
  const baseChildren = ((_baseState.root as SerializedElementNode).children ||
    []) as SerializedLexicalNode[]
  const newChildren = ((_newState.root as SerializedElementNode).children ||
    []) as SerializedLexicalNode[]

  // Assign new IDs to new children to avoid collisions
  const newChildrenWithIds = newChildren.map((child) => {
    return assignNewIdsToNode(child)
  })

  // Merge children
  const mergedChildren =
    mode === "prepend"
      ? [...newChildrenWithIds, ...baseChildren]
      : [...baseChildren, ...newChildrenWithIds]

  // Build merged state
  const mergedState: SerializedEditorState = {
    ..._baseState,
    root: {
      ..._baseState.root,
      children: mergedChildren,
    },
  }

  return mergedState
}

/**
 * Assign new random IDs to node and all its children
 */
function assignNewIdsToNode(
  node: SerializedLexicalNode
): SerializedLexicalNode {
  if (node.type === "root") {
    return node
  }

  const newNode: SerializedLexicalNode = { ...node }
  const nodeWithChildren = newNode as SerializedElementNode

  // Assign a simple random ID
  ;(newNode as any).__id = crypto.randomUUID()

  // Recursively process children
  if (nodeWithChildren.children) {
    nodeWithChildren.children =
      nodeWithChildren.children.map(assignNewIdsToNode)
  }

  return newNode
}

/**
 * Serialize merged state to string
 */
export function mergeLexicalStatesToString(
  baseState: SerializedEditorState | string,
  newState: SerializedEditorState | string,
  mode: "prepend" | "append" = "append"
): string {
  const merged = mergeLexicalStates(baseState, newState, mode)
  return JSON.stringify(merged)
}

/**
 * Smart merge: preserve baseState IDs, generate IDs for new content
 *
 * Recommended usage for append/prepend
 */
export function smartMergeStates(
  existingState: string,
  newMarkdownContent: string,
  markdown2lexical: (md: string) => Promise<string>,
  mode: "prepend" | "append" = "append"
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const newStateStr = await markdown2lexical(newMarkdownContent)
      const merged = mergeLexicalStates(existingState, newStateStr, mode)
      resolve(JSON.stringify(merged))
    } catch (error) {
      reject(error)
    }
  })
}
