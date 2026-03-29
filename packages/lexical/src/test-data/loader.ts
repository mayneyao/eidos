/**
 * Test case loader for state reconciliation tests
 *
 * Each test case is a directory containing:
 * - old.md: Original markdown document
 * - new.md: Modified markdown document
 * - meta.json: Expected behavior and metadata
 */

import * as fs from "fs"
import * as path from "path"

const TEST_DATA_DIR = path.resolve(__dirname)

export interface TestCaseMeta {
  name: string
  description: string
  expected: {
    preserveAllExistingIds?: boolean
    newNodeCount?: number
    deletedNodeCount?: number
    notes?: string
  }
}

export interface TestCase {
  id: string
  name: string
  description: string
  oldMarkdown: string
  newMarkdown: string
  meta: TestCaseMeta
}

/**
 * Load all test cases from the test-data directory
 */
export function loadAllTestCases(): TestCase[] {
  const cases: TestCase[] = []

  const entries = fs.readdirSync(TEST_DATA_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("case-")) {
      const testCase = loadTestCase(entry.name)
      if (testCase) {
        cases.push(testCase)
      }
    }
  }

  // Sort by case number
  return cases.sort((a, b) => {
    const numA = parseInt(a.id.replace("case-", ""))
    const numB = parseInt(b.id.replace("case-", ""))
    return numA - numB
  })
}

/**
 * Load a single test case by directory name
 */
export function loadTestCase(caseId: string): TestCase | null {
  const caseDir = path.join(TEST_DATA_DIR, caseId)

  try {
    const oldMarkdown = fs.readFileSync(path.join(caseDir, "old.md"), "utf-8")
    const newMarkdown = fs.readFileSync(path.join(caseDir, "new.md"), "utf-8")
    const meta: TestCaseMeta = JSON.parse(
      fs.readFileSync(path.join(caseDir, "meta.json"), "utf-8")
    )

    return {
      id: caseId,
      name: meta.name || caseId,
      description: meta.description || "",
      oldMarkdown,
      newMarkdown,
      meta,
    }
  } catch (error) {
    console.warn(`Failed to load test case ${caseId}:`, error)
    return null
  }
}

/**
 * Get test case IDs for targeted testing
 */
export function getTestCaseIds(): string[] {
  return fs
    .readdirSync(TEST_DATA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("case-"))
    .map((entry) => entry.name)
    .sort()
}
