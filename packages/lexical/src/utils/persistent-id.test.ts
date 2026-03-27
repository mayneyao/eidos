import { describe, it, expect } from "vitest"
import type { SerializedEditorState, SerializedLexicalNode } from "lexical"
import {
  hasSerializedNodePersistentId,
  getSerializedNodePersistentId,
  setSerializedNodePersistentId,
  addPersistentIdsToState,
  removePersistentIdsFromState,
  findNodeByPersistentIdInState,
  buildPersistentIdMap,
  diffStatesByPersistentId,
} from "./persistent-id"

function createMockState(): SerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [
        {
          type: "paragraph",
          version: 1,
          direction: null,
          format: "",
          indent: 0,
          children: [
            {
              type: "text",
              version: 1,
              text: "Hello",
              mode: "normal",
              style: "",
              detail: 0,
              format: 0,
            } as SerializedLexicalNode,
          ],
        } as SerializedLexicalNode,
        {
          type: "heading",
          version: 1,
          tag: "h1",
          direction: null,
          format: "",
          indent: 0,
          children: [
            {
              type: "text",
              version: 1,
              text: "Title",
              mode: "normal",
              style: "",
              detail: 0,
              format: 0,
            } as SerializedLexicalNode,
          ],
        } as unknown as SerializedLexicalNode,
      ],
    },
  } as SerializedEditorState
}

describe("Persistent ID Utils", () => {
  describe("hasSerializedNodePersistentId", () => {
    it("should return false for node without ID", () => {
      const node: SerializedLexicalNode = { type: "text", version: 1 }
      expect(hasSerializedNodePersistentId(node)).toBe(false)
    })

    it("should return true for node with ID", () => {
      const node: SerializedLexicalNode = {
        type: "text",
        version: 1,
        $: { pid: "test-id" },
      } as any
      expect(hasSerializedNodePersistentId(node)).toBe(true)
    })
  })

  describe("getSerializedNodePersistentId", () => {
    it("should return undefined for node without ID", () => {
      const node: SerializedLexicalNode = { type: "text", version: 1 }
      expect(getSerializedNodePersistentId(node)).toBeUndefined()
    })

    it("should return ID for node with ID", () => {
      const node: SerializedLexicalNode = {
        type: "text",
        version: 1,
        $: { pid: "test-id" },
      } as any
      expect(getSerializedNodePersistentId(node)).toBe("test-id")
    })
  })

  describe("setSerializedNodePersistentId", () => {
    it("should set ID on node", () => {
      const node: SerializedLexicalNode = { type: "text", version: 1 }
      setSerializedNodePersistentId(node, "new-id")
      expect((node as any).$.pid).toBe("new-id")
    })

    it("should create $ object if not exists", () => {
      const node: SerializedLexicalNode = { type: "text", version: 1 }
      setSerializedNodePersistentId(node, "new-id")
      expect((node as any).$).toBeDefined()
      expect((node as any).$.pid).toBe("new-id")
    })
  })

  describe("addPersistentIdsToState", () => {
    it("should add IDs to all non-root nodes", () => {
      const state = createMockState()
      addPersistentIdsToState(state)

      // Root should not have ID
      expect(hasSerializedNodePersistentId(state.root)).toBe(false)

      // Paragraph should have ID
      const paragraph = state.root.children[0]
      expect(hasSerializedNodePersistentId(paragraph)).toBe(true)
      expect(getSerializedNodePersistentId(paragraph)).toMatch(/^[0-9a-f]{32}$/)

      // Heading should have ID
      const heading = state.root.children[1]
      expect(hasSerializedNodePersistentId(heading)).toBe(true)

      // Text nodes should also have IDs
      const textNode = paragraph.children[0]
      expect(hasSerializedNodePersistentId(textNode)).toBe(true)
    })

    it("should not overwrite existing IDs", () => {
      const state = createMockState()
      const paragraph = state.root.children[0]
      setSerializedNodePersistentId(paragraph, "existing-id")

      addPersistentIdsToState(state)

      expect(getSerializedNodePersistentId(paragraph)).toBe("existing-id")
    })
  })

  describe("removePersistentIdsFromState", () => {
    it("should remove all IDs from state", () => {
      const state = createMockState()
      addPersistentIdsToState(state)

      const stateWithoutIds = removePersistentIdsFromState(state)

      const paragraph = stateWithoutIds.root.children[0]
      expect(hasSerializedNodePersistentId(paragraph)).toBe(false)
    })
  })

  describe("findNodeByPersistentIdInState", () => {
    it("should find node by ID", () => {
      const state = createMockState()
      addPersistentIdsToState(state)

      const paragraph = state.root.children[0]
      const id = getSerializedNodePersistentId(paragraph)!

      const found = findNodeByPersistentIdInState(state, id)
      expect(found).toBe(paragraph)
    })

    it("should return null for non-existent ID", () => {
      const state = createMockState()
      const found = findNodeByPersistentIdInState(state, "non-existent")
      expect(found).toBeNull()
    })
  })

  describe("buildPersistentIdMap", () => {
    it("should build map of IDs to nodes", () => {
      const state = createMockState()
      addPersistentIdsToState(state)

      const map = buildPersistentIdMap(state)

      expect(map.size).toBeGreaterThan(0)

      const paragraph = state.root.children[0]
      const id = getSerializedNodePersistentId(paragraph)!
      expect(map.get(id)).toBe(paragraph)
    })
  })

  describe("diffStatesByPersistentId", () => {
    it("should detect added nodes", () => {
      // Create states with manual IDs to ensure consistency
      const oldState = createMockState()
      setSerializedNodePersistentId(oldState.root.children[0], "para-1")
      setSerializedNodePersistentId(oldState.root.children[1], "heading-1")

      const newState = createMockState()
      setSerializedNodePersistentId(newState.root.children[0], "para-1")
      setSerializedNodePersistentId(newState.root.children[1], "heading-1")

      // Add a new node to newState
      newState.root.children.push({
        type: "paragraph",
        version: 1,
        $: { pid: "new-node-id" },
        children: [],
      } as any)

      const diff = diffStatesByPersistentId(oldState, newState)

      expect(diff.added.length).toBe(1)
      expect(getSerializedNodePersistentId(diff.added[0])).toBe("new-node-id")
    })

    it("should detect removed nodes", () => {
      const oldState = createMockState()
      setSerializedNodePersistentId(oldState.root.children[0], "para-1")
      setSerializedNodePersistentId(oldState.root.children[1], "heading-1")

      const newState = createMockState()
      setSerializedNodePersistentId(newState.root.children[0], "para-1")
      setSerializedNodePersistentId(newState.root.children[1], "heading-1")

      // Remove first node from newState
      const removedNode = oldState.root.children[0]
      newState.root.children.shift()

      const diff = diffStatesByPersistentId(oldState, newState)

      expect(diff.removed.length).toBe(1)
      expect(diff.removed[0]).toBe(removedNode)
    })

    it("should detect unchanged nodes", () => {
      const oldState = createMockState()
      setSerializedNodePersistentId(oldState.root.children[0], "para-1")
      setSerializedNodePersistentId(oldState.root.children[1], "heading-1")

      const newState = createMockState()
      setSerializedNodePersistentId(newState.root.children[0], "para-1")
      setSerializedNodePersistentId(newState.root.children[1], "heading-1")

      const diff = diffStatesByPersistentId(oldState, newState)

      expect(diff.unchanged.length).toBe(2)
    })
  })
})
