/**
 * Tests for State Reconciliation
 *
 * Most test scenarios have been moved to test-data/case-* directories
 * Run with: pnpm test src/test-data/cases.test.ts
 *
 * This file now only contains:
 * - Basic unit tests for internal functions
 * - Edge case tests that don't fit the case format
 * - Utility function tests
 */

import { describe, it, expect } from "vitest"
import {
  reconcileState,
  getReconciliationStats,
  extractFingerprints,
  hashContent,
} from "./state-reconciliation"

import { markdown2lexical } from "../headless"

// Helper to create states
async function createStates(oldMarkdown: string, newMarkdown: string) {
  const oldStateStr = await markdown2lexical(oldMarkdown, [], [], {
    useHarness: true,
  })
  const oldState = JSON.parse(oldStateStr)

  const intermediateStr = await markdown2lexical(newMarkdown, [], [], {
    useHarness: false,
  })
  const intermediateState = JSON.parse(intermediateStr)

  return { oldState, intermediateState }
}

// Helper to collect all PIDs from a state
function collectAllPids(state: any): Set<string> {
  const pids = new Set<string>()

  function traverse(node: any) {
    if (node?.$?.pid) {
      pids.add(node.$.pid)
    }
    if (node?.children?.length) {
      node.children.forEach(traverse)
    }
  }

  traverse(state.root)
  return pids
}

// ============================================
// Basic Tests
// ============================================

describe("Basic ID Preservation", () => {
  it("should preserve IDs when content unchanged", async () => {
    const md = "Hello World"
    const { oldState, intermediateState } = await createStates(md, md)
    const newState = reconcileState(oldState, intermediateState)

    const oldPid = (oldState.root as any).children[0].children[0].$?.pid
    const newPid = (newState.root as any).children[0].children[0].$?.pid

    expect(newPid).toBe(oldPid)
  })

  it("should generate new IDs for new content", async () => {
    const oldMd = "Original"
    const newMd = "Completely Different"

    const { oldState, intermediateState } = await createStates(oldMd, newMd)
    const newState = reconcileState(oldState, intermediateState)

    const oldPids = collectAllPids(oldState)
    const newPids = collectAllPids(newState)

    // Old PIDs should not exist in new state (content completely changed)
    for (const pid of oldPids) {
      expect(newPids.has(pid)).toBe(false)
    }
  })
})

// ============================================
// Utility Tests
// ============================================

describe("Stats and Utilities", () => {
  it("should provide accurate stats", async () => {
    const oldMd = "Hello"
    const newMd = "Hello\n\nWorld"

    const { oldState, intermediateState } = await createStates(oldMd, newMd)
    const stats = getReconciliationStats(oldState, intermediateState)

    expect(stats.oldNodeCount).toBeGreaterThan(0)
    expect(stats.newNodeCount).toBeGreaterThan(stats.oldNodeCount)
    expect(stats.idPreservationRate).toBeGreaterThan(0)
  })

  it("should compute consistent hashes", () => {
    const content1 = "test content"
    const content2 = "test content"
    const content3 = "different content"

    expect(hashContent(content1)).toBe(hashContent(content2))
    expect(hashContent(content1)).not.toBe(hashContent(content3))
  })

  it("should extract fingerprints correctly", async () => {
    const md = "# Heading\n\nParagraph"
    const { oldState } = await createStates(md, md)

    const fingerprints = extractFingerprints(oldState, true)

    expect(fingerprints.length).toBeGreaterThan(0)

    // Should include heading and paragraph
    const types = fingerprints.map((fp) => fp.type)
    expect(types).toContain("heading")
    expect(types).toContain("paragraph")
  })
})

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("should handle empty documents", async () => {
    const { oldState, intermediateState } = await createStates("", "")
    const newState = reconcileState(oldState, intermediateState)

    // Should not throw
    expect(newState).toBeDefined()
  })

  it("should handle document becoming empty", async () => {
    const { oldState, intermediateState } = await createStates("Content", "")
    const newState = reconcileState(oldState, intermediateState)

    // Should not throw
    expect(newState).toBeDefined()
  })

  it("should handle document starting from empty", async () => {
    const { oldState, intermediateState } = await createStates(
      "",
      "New Content"
    )
    const newState = reconcileState(oldState, intermediateState)

    // Should not throw
    expect(newState).toBeDefined()
  })

  it("should handle very long content", async () => {
    const longContent = "a".repeat(10000)
    const { oldState, intermediateState } = await createStates(
      longContent,
      longContent + "\n\nMore"
    )
    const newState = reconcileState(oldState, intermediateState)

    const oldPids = collectAllPids(oldState)
    const newPids = collectAllPids(newState)

    // Long content should still be preserved
    for (const pid of oldPids) {
      expect(newPids.has(pid)).toBe(true)
    }
  })

  it("should handle special characters in content", async () => {
    const specialMd =
      "# 标题\n\n代码: `console.log('test')`\n\n> 引用\n\n**粗体** 和 *斜体*"
    const { oldState, intermediateState } = await createStates(
      specialMd,
      specialMd + "\n\nAdded"
    )
    const newState = reconcileState(oldState, intermediateState)

    const oldPids = collectAllPids(oldState)
    const newPids = collectAllPids(newState)

    for (const pid of oldPids) {
      expect(newPids.has(pid)).toBe(true)
    }
  })
})
