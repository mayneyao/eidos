/**
 * Test case loader for state reconciliation tests
 *
 * Test cases are loaded from test-cases.json
 * To regenerate: cd src/test-data && node convert-to-json.mjs
 */

import * as fs from "fs"
import * as path from "path"

const TEST_DATA_DIR = path.resolve(__dirname)
const TEST_CASES_JSON = path.join(TEST_DATA_DIR, "test-cases.json")

export interface TestCaseMeta {
  name: string
  description: string
  expected: {
    preserveAllExistingIds?: boolean
    newNodeCount?: number
    deletedNodeCount?: number
    minPreservationRate?: number
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

interface TestCasesJson {
  generatedAt: string
  totalCases: number
  cases: Array<{
    id: string
    name: string
    description: string
    old: string
    new: string
    expected: TestCaseMeta["expected"]
  }>
}

/**
 * Load all test cases from test-cases.json
 */
export function loadAllTestCases(): TestCase[] {
  if (!fs.existsSync(TEST_CASES_JSON)) {
    throw new Error(
      `test-cases.json not found. Run: cd src/test-data && node convert-to-json.mjs`
    )
  }

  const data: TestCasesJson = JSON.parse(
    fs.readFileSync(TEST_CASES_JSON, "utf-8")
  )

  return data.cases.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    oldMarkdown: c.old,
    newMarkdown: c.new,
    meta: {
      name: c.name,
      description: c.description,
      expected: c.expected,
    },
  }))
}

/**
 * Load a single test case by ID
 */
export function loadTestCase(caseId: string): TestCase | null {
  const cases = loadAllTestCases()
  return cases.find((c) => c.id === caseId) || null
}

/**
 * Get test case IDs for targeted testing
 */
export function getTestCaseIds(): string[] {
  return loadAllTestCases().map((c) => c.id)
}
