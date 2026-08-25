import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputRoot = path.join(appRoot, "dist-electron")

const fixedFiles = new Set([
  "eidos-lite-build-environment.json",
  "graft-worker.js",
  "main.js",
  "preload.js",
  "runtime-worker.js",
])
const chunkNames = [
  "application",
  "node-sqlite",
  "contracts",
  "logging",
  "packaged-smoke",
  "packaged-startup-smoke",
  "terminal-session-manager",
  "updater",
]

const entries = await fs.readdir(outputRoot, { withFileTypes: true })
const files = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
const unexpectedEntries = entries.filter((entry) => !entry.isFile())
const errors = []

if (unexpectedEntries.length > 0) {
  errors.push(
    `unexpected non-file outputs: ${unexpectedEntries.map((entry) => entry.name).join(", ")}`
  )
}

for (const fileName of fixedFiles) {
  if (!files.includes(fileName)) {
    errors.push(`missing fixed output: ${fileName}`)
  }
}

const matchedChunks = new Set()
for (const chunkName of chunkNames) {
  const pattern = new RegExp(`^${chunkName}-[A-Za-z0-9_-]+\\.js$`)
  const matches = files.filter((fileName) => pattern.test(fileName))
  if (matches.length !== 1) {
    errors.push(
      `expected exactly one ${chunkName} chunk, found ${matches.length}: ${matches.join(", ") || "none"}`
    )
  }
  for (const match of matches) {
    matchedChunks.add(match)
  }
}

const expectedFiles = new Set([...fixedFiles, ...matchedChunks])
const unexpectedFiles = files.filter((fileName) => !expectedFiles.has(fileName))
if (unexpectedFiles.length > 0) {
  errors.push(`unexpected outputs: ${unexpectedFiles.join(", ")}`)
}

if (errors.length > 0) {
  throw new Error(
    `Eidos Lite Electron output is not clean:\n- ${errors.join("\n- ")}`
  )
}

console.log(
  `Verified clean Eidos Lite Electron output (${files.length} files).`
)
