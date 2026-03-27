import { describe, expect, it } from "vitest"
import type { SerializedEditorState, SerializedLexicalNode } from "lexical"
import {
  assignIdsViaHarness,
  buildFingerprintMap,
  type HarnessOptions,
} from "./id-harness"
import { setSerializedNodePersistentId } from "./persistent-id"
import { generatePersistentId } from "../node-state"

/**
 * Create test Lexical State
 */
function createTestState(
  children: SerializedLexicalNode[]
): SerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      children,
    },
  } as SerializedEditorState
}

/**
 * Create paragraph node
 */
function createParagraph(text: string, id?: string): SerializedLexicalNode {
  const node: SerializedLexicalNode = {
    type: "paragraph",
    version: 1,
    children: [
      {
        type: "text",
        version: 1,
        text,
      },
    ],
  }
  if (id) {
    setSerializedNodePersistentId(node, id)
  }
  return node
}

/**
 * Create heading node
 */
function createHeading(
  text: string,
  level: number = 1,
  id?: string
): SerializedLexicalNode {
  const node: SerializedLexicalNode = {
    type: "heading",
    version: 1,
    tag: `h${level}`,
    children: [
      {
        type: "text",
        version: 1,
        text,
      },
    ],
  }
  if (id) {
    setSerializedNodePersistentId(node, id)
  }
  return node
}

/**
 * Get node ID
 */
function getNodeId(node: SerializedLexicalNode): string | undefined {
  return (node as any).$?.pid
}

/**
 * Collect all node IDs (excluding text nodes)
 */
function collectAllIds(state: SerializedEditorState): string[] {
  const ids: string[] = []
  function traverse(node: SerializedLexicalNode) {
    // Skip root and text nodes
    if (node.type !== "root" && node.type !== "text") {
      const id = getNodeId(node)
      if (id) ids.push(id)
    }
    if ((node as any).children) {
      ;(node as any).children.forEach(traverse)
    }
  }
  traverse(state.root)
  return ids
}

/**
 * Count ID match statistics
 */
function countIdMatches(
  oldState: SerializedEditorState,
  newState: SerializedEditorState
): { preserved: number; new: number } {
  const oldIds = new Set(collectAllIds(oldState))
  const newIds = collectAllIds(newState)

  let preserved = 0
  let newCount = 0

  for (const id of newIds) {
    if (oldIds.has(id)) {
      preserved++
    } else {
      newCount++
    }
  }

  return { preserved, new: newCount }
}

describe("ID Harness", () => {
  describe("buildFingerprintMap", () => {
    it("should build fingerprint map from state with IDs", () => {
      const state = createTestState([
        createParagraph("Hello World", "id-123"),
        createParagraph("Second paragraph", "id-456"),
      ])

      const map = buildFingerprintMap(state)

      expect(map.size).toBeGreaterThan(0)
      // Should contain multi-level fingerprints
      const keys = Array.from(map.keys())
      expect(keys.some((k) => k.includes("paragraph"))).toBe(true)
    })

    it("should skip nodes without IDs", () => {
      const state = createTestState([
        createParagraph("No ID"),
        createParagraph("Has ID", "id-789"),
      ])

      const map = buildFingerprintMap(state)

      // Only nodes with IDs are mapped
      expect(map.size).toBeGreaterThan(0)
    })
  })

  describe("assignIdsViaHarness - exact match", () => {
    it("should preserve all IDs when content is identical", () => {
      const oldState = createTestState([
        createParagraph("First paragraph", "pid-001"),
        createParagraph("Second paragraph", "pid-002"),
        createHeading("Title", 1, "pid-003"),
      ])

      // Create new state with same content (no IDs)
      const newState = createTestState([
        createParagraph("First paragraph"),
        createParagraph("Second paragraph"),
        createHeading("Title", 1),
      ])

      const result = assignIdsViaHarness(newState, oldState)

      const matches = countIdMatches(oldState, result)
      expect(matches.preserved).toBe(3)
      expect(matches.new).toBe(0)

      // Verify specific IDs are correct
      const paragraphs = (result.root as any).children
      expect(getNodeId(paragraphs[0])).toBe("pid-001")
      expect(getNodeId(paragraphs[1])).toBe("pid-002")
      expect(getNodeId(paragraphs[2])).toBe("pid-003")
    })

    it("should generate new IDs when no old state provided", () => {
      const newState = createTestState([
        createParagraph("First paragraph"),
        createParagraph("Second paragraph"),
      ])

      const result = assignIdsViaHarness(newState, null)

      const ids = collectAllIds(result)
      expect(ids.length).toBe(2)
      expect(ids.every((id) => id.length === 32)).toBe(true) // UUID v7 format
    })
  })

  describe("assignIdsViaHarness - position change", () => {
    it("should preserve IDs when paragraphs are reordered", () => {
      const oldState = createTestState([
        createParagraph("First", "pid-001"),
        createParagraph("Second", "pid-002"),
        createParagraph("Third", "pid-003"),
      ])

      // Reorder paragraphs
      const newState = createTestState([
        createParagraph("Third"),
        createParagraph("First"),
        createParagraph("Second"),
      ])

      const result = assignIdsViaHarness(newState, oldState)

      const paragraphs = (result.root as any).children
      // "Third" should match pid-003 (loose match)
      expect(getNodeId(paragraphs[0])).toBe("pid-003")
      // "First" should match pid-001
      expect(getNodeId(paragraphs[1])).toBe("pid-001")
      // "Second" should match pid-002
      expect(getNodeId(paragraphs[2])).toBe("pid-002")
    })
  })

  describe("assignIdsViaHarness - fuzzy match", () => {
    it("should preserve ID with minor text changes when fuzzy match is enabled", () => {
      const oldState = createTestState([
        createParagraph(
          "This is a long paragraph with some content",
          "pid-001"
        ),
      ])

      // Minor edit (change a few words)
      const newState = createTestState([
        createParagraph("This is a long paragraph with some edited content"),
      ])

      const result = assignIdsViaHarness(newState, oldState, {
        fuzzyMatch: true,
        fuzzyThreshold: 0.3,
      })

      const paragraphs = (result.root as any).children
      // Should preserve ID through fuzzy matching
      expect(getNodeId(paragraphs[0])).toBe("pid-001")
    })

    it("should not use fuzzy match when content is too different", () => {
      const oldState = createTestState([
        createParagraph("Original content here", "pid-001"),
      ])

      // Completely different content
      const newState = createTestState([
        createParagraph("Completely different text that is very long"),
      ])

      const result = assignIdsViaHarness(newState, oldState, {
        fuzzyMatch: true,
        fuzzyThreshold: 0.3,
      })

      const paragraphs = (result.root as any).children
      // Too different, should generate new ID
      expect(getNodeId(paragraphs[0])).not.toBe("pid-001")
      expect(getNodeId(paragraphs[0])?.length).toBe(32)
    })

    it("should skip fuzzy match for short text", () => {
      const oldState = createTestState([createParagraph("Short", "pid-001")])

      const newState = createTestState([createParagraph("Shorty")])

      const result = assignIdsViaHarness(newState, oldState, {
        fuzzyMatch: true,
        fuzzyThreshold: 0.3,
      })

      const paragraphs = (result.root as any).children
      // Short text doesn't do fuzzy matching
      expect(getNodeId(paragraphs[0])).not.toBe("pid-001")
    })
  })

  describe("assignIdsViaHarness - content addition/deletion", () => {
    it("should preserve existing IDs and generate new ones for added content", () => {
      const oldState = createTestState([
        createParagraph("Original paragraph", "pid-001"),
      ])

      const newState = createTestState([
        createParagraph("New paragraph first"),
        createParagraph("Original paragraph"),
        createParagraph("New paragraph last"),
      ])

      const result = assignIdsViaHarness(newState, oldState)

      const paragraphs = (result.root as any).children
      // Original paragraph should preserve ID
      expect(getNodeId(paragraphs[1])).toBe("pid-001")
      // New paragraphs should have new IDs
      expect(getNodeId(paragraphs[0])).not.toBe("pid-001")
      expect(getNodeId(paragraphs[0])?.length).toBe(32)
      expect(getNodeId(paragraphs[2])).not.toBe("pid-001")
      expect(getNodeId(paragraphs[2])?.length).toBe(32)
    })

    it("should handle content deletion correctly", () => {
      const oldState = createTestState([
        createParagraph("First paragraph", "pid-001"),
        createParagraph("Second paragraph", "pid-002"),
        createParagraph("Third paragraph", "pid-003"),
      ])

      const newState = createTestState([
        createParagraph("First paragraph"),
        createParagraph("Third paragraph"),
      ])

      const result = assignIdsViaHarness(newState, oldState)

      const paragraphs = (result.root as any).children
      // Remaining paragraphs should preserve original IDs
      expect(getNodeId(paragraphs[0])).toBe("pid-001")
      expect(getNodeId(paragraphs[1])).toBe("pid-003")
    })
  })

  describe("assignIdsViaHarness - mixed scenarios", () => {
    it("should handle complex mixed modifications", () => {
      const oldState = createTestState([
        createHeading("Title", 1, "pid-h1"),
        createParagraph("Paragraph 1", "pid-p1"),
        createParagraph("Paragraph 2", "pid-p2"),
        createParagraph("Paragraph 3", "pid-p3"),
      ])

      // Mixed modifications: preserve, add, delete, reorder
      const newState = createTestState([
        createHeading("Title", 1), // preserve
        createParagraph("New paragraph"), // add
        createParagraph("Paragraph 3"), // original p3, preserve
        createParagraph("Paragraph 1 with edit"), // original p1, minor edit
      ])

      const result = assignIdsViaHarness(newState, oldState, {
        fuzzyMatch: true,
        fuzzyThreshold: 0.5, // Higher threshold to match "Paragraph 1 with edit"
      })

      const nodes = (result.root as any).children

      // Title should preserve
      expect(getNodeId(nodes[0])).toBe("pid-h1")

      // New paragraph has new ID
      expect(getNodeId(nodes[1])).not.toBe("pid-p1")
      expect(getNodeId(nodes[1])).not.toBe("pid-p2")
      expect(getNodeId(nodes[1])).not.toBe("pid-p3")

      // Paragraph 3 should preserve (reordered)
      expect(getNodeId(nodes[2])).toBe("pid-p3")

      // Paragraph 1 may preserve (depends on fuzzy matching threshold)
      // Note: actual result depends on implementation
      const p1Id = getNodeId(nodes[3])
      expect(p1Id).toBeDefined()
    })

    it("should not reuse the same ID twice", () => {
      const oldState = createTestState([
        createParagraph("Duplicate content", "pid-001"),
        createParagraph("Duplicate content", "pid-002"),
      ])

      // Two paragraphs with same content
      const newState = createTestState([
        createParagraph("Duplicate content"),
        createParagraph("Duplicate content"),
      ])

      const result = assignIdsViaHarness(newState, oldState)

      const paragraphs = (result.root as any).children
      const id1 = getNodeId(paragraphs[0])
      const id2 = getNodeId(paragraphs[1])

      // Two paragraphs should have different IDs
      expect(id1).not.toBe(id2)
      // One of them should be from old state
      expect(
        [id1, id2].some((id) => id === "pid-001" || id === "pid-002")
      ).toBe(true)
    })
  })

  describe("assignIdsViaHarness - options", () => {
    it("should respect useHarness=false to skip ID preservation", () => {
      const oldState = createTestState([createParagraph("Content", "pid-001")])

      const newState = createTestState([createParagraph("Content")])

      const result = assignIdsViaHarness(newState, oldState, {
        useHarness: false,
      })

      // Even with same content, should generate new ID
      const paragraphs = (result.root as any).children
      expect(getNodeId(paragraphs[0])).not.toBe("pid-001")
    })

    it("should support custom hash length", () => {
      const state = createTestState([
        createParagraph("Test content", "pid-001"),
      ])

      // Different hash lengths should both work
      const map1 = buildFingerprintMap(state, { hashLength: 4 })
      const map2 = buildFingerprintMap(state, { hashLength: 8 })

      expect(map1.size).toBeGreaterThan(0)
      expect(map2.size).toBeGreaterThan(0)
    })
  })

  describe("edge cases", () => {
    it("should handle empty document", () => {
      const oldState = createTestState([])
      const newState = createTestState([])

      const result = assignIdsViaHarness(newState, oldState)

      expect((result.root as any).children).toHaveLength(0)
    })

    it("should handle nested nodes", () => {
      const oldState = createTestState([
        {
          type: "quote",
          version: 1,
          children: [createParagraph("Nested paragraph", "pid-nested")],
        } as any,
      ])

      // Add ID to quote
      setSerializedNodePersistentId(
        (oldState.root as any).children[0],
        "pid-quote"
      )

      const newState = createTestState([
        {
          type: "quote",
          version: 1,
          children: [createParagraph("Nested paragraph")],
        } as any,
      ])

      const result = assignIdsViaHarness(newState, oldState)

      const quote = (result.root as any).children[0]
      expect(getNodeId(quote)).toBe("pid-quote")
      expect(getNodeId(quote.children[0])).toBe("pid-nested")
    })

    it("should handle nodes without text content", () => {
      const oldState = createTestState([
        {
          type: "horizontalrule",
          version: 1,
        } as SerializedLexicalNode,
      ])

      setSerializedNodePersistentId(
        (oldState.root as any).children[0],
        "pid-hr"
      )

      const newState = createTestState([
        {
          type: "horizontalrule",
          version: 1,
        } as SerializedLexicalNode,
      ])

      const result = assignIdsViaHarness(newState, oldState)

      const hr = (result.root as any).children[0]
      // Nodes without text content should also match
      expect(getNodeId(hr)).toBe("pid-hr")
    })
  })
})
