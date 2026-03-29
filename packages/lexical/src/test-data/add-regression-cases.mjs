#!/usr/bin/env node
/**
 * Add regression cases from lexical-diff-demo to test-cases.json
 * 
 * Usage: node add-regression-cases.mjs
 * 
 * Process:
 * 1. Reads all JSON files from regression-cases/ directory
 * 2. Extracts cases with preservation rate < 100% (indicating potential issues)
 * 3. Adds them as new test cases with IDs starting from case-81
 * 4. Moves processed files to regression-cases/processed/
 * 5. Regenerates test-cases.json
 */

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REGRESSION_DIR = path.join(__dirname, "regression-cases")
const PROCESSED_DIR = path.join(REGRESSION_DIR, "processed")
const TEST_CASES_JSON = path.join(__dirname, "test-cases.json")

function loadExistingCases() {
  if (!fs.existsSync(TEST_CASES_JSON)) {
    throw new Error("test-cases.json not found")
  }
  return JSON.parse(fs.readFileSync(TEST_CASES_JSON, "utf-8"))
}

function getNextCaseNumber(cases) {
  let maxNum = 0
  for (const c of cases) {
    const match = c.id.match(/case-(\d+)/)
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1]))
    }
  }
  return maxNum + 1
}

function sanitizeFilename(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
}

function loadRegressionFiles() {
  const files = fs.readdirSync(REGRESSION_DIR, { withFileTypes: true })
  const jsonFiles = files.filter(
    (f) => f.isFile() && f.name.endsWith(".json") && f.name !== "README.md"
  )

  const allCases = []

  for (const file of jsonFiles) {
    const filePath = path.join(REGRESSION_DIR, file.name)
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"))

      // Support both single case and array of cases
      const cases = Array.isArray(data.cases) ? data.cases : [data]

      for (const c of cases) {
        // Only add cases with rate drop or low preservation (potential regressions)
        const preservationRate = c.preservationRate || c.stats?.preservationRate || 1
        const rateDrop = c.rateDrop || c.previousRate - c.preservationRate || 0

        if (preservationRate < 1 || rateDrop > 0) {
          allCases.push({
            ...c,
            sourceFile: file.name,
            rateDrop,
            preservationRate,
          })
        }
      }

      console.log(`📄 Loaded ${cases.length} cases from ${file.name}`)
    } catch (e) {
      console.warn(`⚠️ Failed to parse ${file.name}:`, e.message)
    }
  }

  return allCases
}

function convertToTestCase(regressionCase, id) {
  const rate = regressionCase.preservationRate
  const rateStr = Math.round(rate * 100)
  const dropStr = regressionCase.rateDrop
    ? `-drop-${Math.round(regressionCase.rateDrop * 100)}`
    : ""

  // Generate name from case characteristics
  let name = "regression"
  if (regressionCase.rateDrop > 0.3) {
    name = "major-id-loss"
  } else if (regressionCase.rateDrop > 0.1) {
    name = "moderate-id-loss"
  } else if (rate < 1) {
    name = "minor-id-loss"
  }

  // Add content hint
  const contentHint = regressionCase.oldMarkdown
    ? sanitizeFilename(regressionCase.oldMarkdown.split("\n")[0].slice(0, 20))
    : "unknown"

  return {
    id,
    name: `${name}-${contentHint}`,
    description:
      regressionCase.description ||
      `Regression case: preservation rate ${rateStr}%${
        regressionCase.rateDrop ? ` (dropped ${Math.round(regressionCase.rateDrop * 100)}%)` : ""
      }`,
    old: regressionCase.oldMarkdown || regressionCase.old || "",
    new: regressionCase.newMarkdown || regressionCase.new || "",
    expected: {
      preserveAllExistingIds: false,
      minPreservationRate: rate,
      notes: `Original preservation rate: ${rateStr}%. This case was auto-generated from lexical-diff-demo regression detection.`,
    },
  }
}

function main() {
  console.log("=".repeat(60))
  console.log("Adding Regression Cases to Test Suite")
  console.log("=".repeat(60))

  // Load existing cases
  const existing = loadExistingCases()
  console.log(`\n📊 Existing cases: ${existing.totalCases}`)

  // Load regression files
  const regressionCases = loadRegressionFiles()
  console.log(`\n🐛 Regression cases found: ${regressionCases.length}`)

  if (regressionCases.length === 0) {
    console.log("\n✅ No new regression cases to add.")
    return
  }

  // Get next case number
  let nextNum = getNextCaseNumber(existing.cases)
  console.log(`\n📝 Next case number: ${nextNum}`)

  // Convert and add cases
  const newCases = []
  const processedFiles = new Set()

  for (const rc of regressionCases) {
    const caseId = `case-${String(nextNum).padStart(2, "0")}`
    const testCase = convertToTestCase(rc, caseId)

    existing.cases.push(testCase)
    newCases.push({ id: caseId, rate: rc.preservationRate, source: rc.sourceFile })

    if (rc.sourceFile) {
      processedFiles.add(rc.sourceFile)
    }

    nextNum++
  }

  // Update metadata
  existing.totalCases = existing.cases.length
  existing.lastRegressionImport = new Date().toISOString()

  // Save updated test-cases.json
  fs.writeFileSync(TEST_CASES_JSON, JSON.stringify(existing, null, 2))
  console.log(`\n✅ Added ${newCases.length} new cases:`)
  for (const c of newCases) {
    console.log(`   - ${c.id}: ${Math.round(c.rate * 100)}% (from ${c.source})`)
  }
  console.log(`\n📁 Total cases now: ${existing.totalCases}`)

  // Move processed files
  console.log(`\n📦 Moving processed files to ${PROCESSED_DIR}/`)
  for (const file of processedFiles) {
    const src = path.join(REGRESSION_DIR, file)
    const dest = path.join(PROCESSED_DIR, `${Date.now()}-${file}`)
    fs.renameSync(src, dest)
    console.log(`   ✓ ${file} → processed/`)
  }

  console.log("\n" + "=".repeat(60))
  console.log("Done! Run tests with: pnpm test src/test-data/cases.test.ts")
  console.log("=".repeat(60))
}

main()
