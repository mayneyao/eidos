/**
 * Dynamic test cases loaded from test-data directory
 *
 * Each test case is a directory containing:
 * - old.md: Original markdown document
 * - new.md: Modified markdown document
 * - meta.json: Expected behavior and metadata
 *
 * Run with: pnpm test src/test-data/cases.test.ts
 */

import { describe, it, expect } from "vitest"
import { loadAllTestCases } from "./loader"
import {
  reconcileState,
  getReconciliationStats,
} from "../utils/state-reconciliation"
import { markdown2lexical } from "../headless"

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

// Load all test cases
const testCases = loadAllTestCases()

// Create test suite dynamically
describe("Test Data Cases", () => {
  for (const testCase of testCases) {
    describe(`${testCase.id}: ${testCase.name}`, () => {
      it(testCase.description || "should reconcile correctly", async () => {
        // Convert markdown to lexical states
        const oldStateStr = await markdown2lexical(
          testCase.oldMarkdown,
          [],
          [],
          { useHarness: true }
        )
        const oldState = JSON.parse(oldStateStr)

        const intermediateStr = await markdown2lexical(
          testCase.newMarkdown,
          [],
          [],
          { useHarness: false }
        )
        const intermediateState = JSON.parse(intermediateStr)

        // Reconcile
        const newState = reconcileState(oldState, intermediateState)

        // Get stats
        const stats = getReconciliationStats(oldState, intermediateState)
        const oldPids = collectAllPids(oldState)
        const newPids = collectAllPids(newState)

        // Count preserved PIDs (old PIDs that exist in new state)
        let preservedCount = 0
        for (const pid of oldPids) {
          if (newPids.has(pid)) {
            preservedCount++
          }
        }
        const preservationRate =
          oldPids.size > 0 ? preservedCount / oldPids.size : 1

        // Log for debugging
        console.log(`\n  ${testCase.id} - ${testCase.name}:`)
        console.log(`    Old PIDs: ${oldPids.size}, New PIDs: ${newPids.size}`)
        console.log(
          `    Preserved: ${preservedCount}/${oldPids.size} (${(preservationRate * 100).toFixed(1)}%)`
        )

        // Verify expectations
        if (testCase.meta.expected?.preserveAllExistingIds !== undefined) {
          if (testCase.meta.expected.preserveAllExistingIds) {
            // All old PIDs should exist in new state
            for (const pid of oldPids) {
              expect(newPids.has(pid), `PID ${pid} should be preserved`).toBe(
                true
              )
            }
          }
        }

        // Check minimum preservation rate if specified
        if (testCase.meta.expected?.minPreservationRate !== undefined) {
          expect(preservationRate).toBeGreaterThanOrEqual(
            testCase.meta.expected.minPreservationRate
          )
        }

        // Check notes for edge cases
        if (testCase.meta.expected?.notes) {
          console.log(`    Note: ${testCase.meta.expected.notes}`)
        }
      })
    })
  }
})

// Summary test
describe("Summary", () => {
  it(`Loaded ${testCases.length} test cases`, () => {
    expect(testCases.length).toBeGreaterThan(0)
    console.log("\nTest cases loaded:")
    for (const tc of testCases) {
      console.log(`  - ${tc.id}: ${tc.name}`)
    }
  })
})
