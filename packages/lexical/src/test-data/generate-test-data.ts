/**
 * Generate test data for AST Diff testing
 * Converts complex markdown to Lexical state and saves both
 */

import { readFile, writeFile } from "fs/promises"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { markdown2lexical } from "../headless"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function generateTestData() {
  const mdPath = join(__dirname, "complex-document.md")
  const statePath = join(__dirname, "complex-document-lexical.json")

  // Read markdown
  const markdown = await readFile(mdPath, "utf-8")
  console.log(`Loaded markdown: ${markdown.length} characters`)

  // Convert to Lexical state
  console.log("Converting to Lexical state...")
  const lexicalState = await markdown2lexical(markdown)

  // Save Lexical state
  await writeFile(statePath, lexicalState, "utf-8")
  console.log(`Saved Lexical state to: ${statePath}`)

  // Print statistics
  const state = JSON.parse(lexicalState)
  const stats = analyzeState(state)
  console.log("\n=== State Statistics ===")
  console.log(JSON.stringify(stats, null, 2))

  return { markdown, lexicalState, stats }
}

function analyzeState(state: any) {
  const stats = {
    totalNodes: 0,
    nodeTypes: new Map<string, number>(),
    nodesWithIds: 0,
    maxDepth: 0,
  }

  function traverse(node: any, depth: number) {
    stats.totalNodes++
    stats.maxDepth = Math.max(stats.maxDepth, depth)

    const count = stats.nodeTypes.get(node.type) || 0
    stats.nodeTypes.set(node.type, count + 1)

    if (node.$?.pid) {
      stats.nodesWithIds++
    }

    if (node.children) {
      node.children.forEach((child: any) => traverse(child, depth + 1))
    }
  }

  traverse(state.root, 0)

  return {
    totalNodes: stats.totalNodes,
    nodeTypes: Object.fromEntries(stats.nodeTypes),
    nodesWithIds: stats.nodesWithIds,
    maxDepth: stats.maxDepth,
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTestData().catch(console.error)
}

export { generateTestData }
