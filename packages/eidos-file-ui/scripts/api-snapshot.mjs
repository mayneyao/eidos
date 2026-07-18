import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, "..")
const manifest = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
)
const sections = []

for (const [name, target] of Object.entries(manifest.exports).sort(
  ([left], [right]) => left.localeCompare(right)
)) {
  const types = typeof target === "object" && target ? target.types : null
  if (typeof types !== "string") continue
  const declaration = readFileSync(path.join(root, types), "utf8")
    .replace(/([A-Za-z0-9-]+)-[A-Za-z0-9_]{8}\.mjs/g, "$1-HASH.mjs")
    .replace(/^\/\/# sourceMappingURL=.*$/gm, "")
    .trim()
  sections.push(`## ${name}\n\n\`\`\`ts\n${declaration}\n\`\`\``)
}

const report = `# @eidos.space/eidos-file-ui API report\n\n${sections.join("\n\n")}\n`
const snapshotPath = path.join(root, "etc", "eidos-file-ui.api.md")

if (process.argv.includes("--write")) {
  writeFileSync(snapshotPath, report)
  console.log(`Updated ${path.relative(root, snapshotPath)}`)
} else {
  const expected = readFileSync(snapshotPath, "utf8")
  if (expected !== report) {
    console.error(
      "Eidos File UI public API changed. Run pnpm api:report and review the snapshot."
    )
    process.exitCode = 1
  } else {
    console.log("Eidos File UI public API snapshot is current")
  }
}
