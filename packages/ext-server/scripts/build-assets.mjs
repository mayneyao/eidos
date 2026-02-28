#!/usr/bin/env node
/**
 * Build script to inline static assets as TypeScript exports
 * Converts src/js/*.js, src/*.html, and external deps to src/generated/*.ts
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const srcDir = path.join(rootDir, "src")
const generatedDir = path.join(srcDir, "generated")

// Ensure generated directory exists
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true })
}

// Generate JS assets from src/js/
const jsDir = path.join(srcDir, "js")
const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"))

for (const file of jsFiles) {
  const content = fs.readFileSync(path.join(jsDir, file), "utf-8")
  const varName =
    file
      .replace(/\.js$/, "")
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) + "Js"

  const tsContent = `// Auto-generated from src/js/${file}
// Do not edit manually

export const ${varName} = ${JSON.stringify(content)};
`

  fs.writeFileSync(path.join(generatedDir, `${varName}.ts`), tsContent)
  console.log(`✓ Generated: src/generated/${varName}.ts`)
}

// Generate HTML assets
const htmlFiles = ["sdk-inject-script.html"]

for (const file of htmlFiles) {
  const content = fs.readFileSync(path.join(srcDir, file), "utf-8")
  const varName =
    file
      .replace(/\.html$/, "")
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) + "Html"

  const tsContent = `// Auto-generated from src/${file}
// Do not edit manually

export const ${varName} = ${JSON.stringify(content)};
`

  fs.writeFileSync(path.join(generatedDir, `${varName}.ts`), tsContent)
  console.log(`✓ Generated: src/generated/${varName}.ts`)
}

// Copy eidos-client.js from @eidos.space/client
// Note: @eidos.space/client must be built first
// Try monorepo root first, then local node_modules
const possibleClientPaths = [
  path.join(
    rootDir,
    "..",
    "..",
    "node_modules",
    "@eidos.space",
    "client",
    "dist",
    "index.mjs"
  ), // monorepo root
  path.join(
    rootDir,
    "node_modules",
    "@eidos.space",
    "client",
    "dist",
    "index.mjs"
  ), // local
]

let clientDistPath = null
for (const p of possibleClientPaths) {
  if (fs.existsSync(p)) {
    clientDistPath = p
    break
  }
}

if (clientDistPath) {
  const clientContent = fs.readFileSync(clientDistPath, "utf-8")
  const tsContent = `// Auto-generated from @eidos.space/client/dist/index.mjs
// Do not edit manually - run 'pnpm run build:assets' to regenerate

export const eidosClientJs = ${JSON.stringify(clientContent)};
`
  fs.writeFileSync(path.join(generatedDir, "eidosClientJs.ts"), tsContent)
  console.log(
    `✓ Generated: src/generated/eidosClientJs.ts (from @eidos.space/client)`
  )
} else {
  console.warn(
    `⚠ @eidos.space/client/dist/index.mjs not found. Skipping eidosClientJs generation.`
  )
  console.warn(`  Run 'pnpm --filter @eidos.space/client build' first.`)
}

console.log("\n✓ All assets built successfully")
