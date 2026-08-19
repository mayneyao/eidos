import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, "..")
const manifest = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
)
const sections = []
const reactHtmlAttributes = "[A-Za-z_$][\\w$]*\\.HTMLAttributes<[^>]+>"
const commandRefUnionAtom = `(?:"key"|"asChild"|keyof ${reactHtmlAttributes})`
const commandRefUnionPattern = new RegExp(
  `(${commandRefUnionAtom}) \\| (${commandRefUnionAtom}) \\| (${commandRefUnionAtom})`,
  "g"
)

for (const [name, target] of Object.entries(manifest.exports).sort(
  ([left], [right]) => left.localeCompare(right)
)) {
  const types = typeof target === "object" && target ? target.types : null
  if (typeof types !== "string") continue
  const declaration = readFileSync(path.join(root, types), "utf8")
    .replace(/([A-Za-z0-9-]+)-[A-Za-z0-9_-]{8}\.mjs/g, "$1-HASH.mjs")
    // Rolldown can emit equivalent keyof unions in either order across builds.
    // Canonicalize them so the API gate only reports semantic declaration changes.
    .replace(
      /"key" \| keyof ([A-Za-z_$][\w$]*\.HTMLAttributes<[^>]+>)/g,
      'keyof $1 | "key"'
    )
    .replace(commandRefUnionPattern, (union, left, middle, right) => {
      const members = [left, middle, right]
      const attributes = members.find((member) => member.startsWith("keyof "))
      return attributes &&
        members.includes('"key"') &&
        members.includes('"asChild"')
        ? `${attributes} | "key" | "asChild"`
        : union
    })
    .replace(
      /(_\$react_jsx_runtime\d+\.JSX\.Element) \| (Iterable<(?:[A-Za-z_$][\w$]*\.)?ReactNode>)/g,
      "$2 | $1"
    )
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
