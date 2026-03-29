#!/usr/bin/env node
/**
 * Convert test case directories to a single JSON file
 * Usage: node convert-to-json.mjs [output-file]
 */

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function convertTestData() {
  const testDataDir = __dirname
  const entries = fs.readdirSync(testDataDir, { withFileTypes: true })
  
  const cases = []
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith("case-")) continue
    
    const caseDir = path.join(testDataDir, entry.name)
    const oldMdPath = path.join(caseDir, "old.md")
    const newMdPath = path.join(caseDir, "new.md")
    const metaPath = path.join(caseDir, "meta.json")
    
    // Check if required files exist
    if (!fs.existsSync(oldMdPath) || !fs.existsSync(newMdPath)) {
      console.warn(`Skipping ${entry.name}: missing old.md or new.md`)
      continue
    }
    
    const oldContent = fs.readFileSync(oldMdPath, "utf-8")
    const newContent = fs.readFileSync(newMdPath, "utf-8")
    
    // Parse meta.json if exists
    let meta = {}
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
      } catch (e) {
        console.warn(`Failed to parse meta.json for ${entry.name}`)
      }
    }
    
    cases.push({
      id: entry.name,
      name: meta.name || entry.name,
      description: meta.description || "",
      old: oldContent,
      new: newContent,
      expected: meta.expected || { preserveAllExistingIds: true },
    })
  }
  
  // Sort by case number
  cases.sort((a, b) => {
    const numA = parseInt(a.id.match(/case-(\d+)/)?.[1] || "0")
    const numB = parseInt(b.id.match(/case-(\d+)/)?.[1] || "0")
    return numA - numB
  })
  
  return {
    generatedAt: new Date().toISOString(),
    totalCases: cases.length,
    cases,
  }
}

// Main
const outputFile = process.argv[2] || path.join(__dirname, "test-cases.json")
const data = convertTestData()
fs.writeFileSync(outputFile, JSON.stringify(data, null, 2))
console.log(`Generated ${outputFile} with ${data.totalCases} test cases`)
