import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(appRoot, "dist-electron")

const fixedFiles = new Set([
  "contracts.ts",
  "eidos-lite-build-environment.json",
  "graft-sdk-build-policy.json",
  "spark-key-build-policy.json",
  "graft-worker.js",
  "main.js",
  "preload.js",
  "runtime-worker.js",
])
const chunkNames = [
  "application",
  "automatic-sync",
  "automatic-sync-electron-smoke",
  "calendar-query-upgrade",
  "compiler",
  "dist",
  "encrypted-staging-smoke",
  "i18n",
  "node-sqlite",
  "logging",
  "package",
  "packaged-smoke",
  "packaged-startup-smoke",
  "markdown-link-maintenance",
  "document-file-preview",
  "eidos-file-runtime",
  "file-metadata",
  "filemeta",
  "lib",
  "markdown-link-batch",
  "plugin-file-mutations",
  "rpc",
  "space-paths",
  "vtab-resolver",
  "runtime-pool",
  "space-clone-coordinator",
  "space-session",
  "sync-encryption",
  "sync-failure",
  "terminal-session-manager",
  "text-draft-copy",
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
  // Vite's pinned [hash] output uses eight characters. Keeping that boundary
  // also prevents automatic-sync from matching its longer smoke chunk name.
  const pattern = new RegExp(`^${chunkName}-[A-Za-z0-9_-]{8}\\.js$`)
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

// A statically resolved sandbox URL can cause Vite to re-embed the native
// executable even though Lite always launches it from resources/plugin-sandbox.
const inlinedExecutable =
  /data:application\/octet-stream;base64,(?:z\/rt\/g|z\/q7\/g|yv66vg|TVq|f0VMRg)[A-Za-z0-9+/]{1024}/
for (const fileName of files.filter((file) => file.endsWith(".js"))) {
  const source = await fs.readFile(path.join(outputRoot, fileName), "utf8")
  if (inlinedExecutable.test(source))
    errors.push(`unexpected embedded native executable in ${fileName}`)
}

if (errors.length > 0) {
  throw new Error(
    `Eidos Lite Electron output is not clean:\n- ${errors.join("\n- ")}`
  )
}

console.log(
  `Verified clean Eidos Lite Electron output (${files.length} files).`
)
