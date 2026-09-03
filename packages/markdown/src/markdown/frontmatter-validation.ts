import { isMap, parseDocument } from "yaml"

export function frontmatterSourceFromBody(body: string): string {
  return `---\n${body.trim()}\n---`
}

export function validateFrontmatterSource(source: string): string | null {
  const normalized = source.replace(/\r\n?/gu, "\n").replace(/\n$/u, "")
  const lines = normalized.split("\n")
  if (lines[0] !== "---" || lines.at(-1) !== "---") {
    return "Frontmatter must start and end with a line containing exactly ---."
  }

  const bodyLines = lines.slice(1, -1)
  if (bodyLines.includes("---")) {
    return "Frontmatter YAML cannot contain an additional --- delimiter line."
  }

  const document = parseDocument(bodyLines.join("\n"), {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: "1.2",
  })
  const error = document.errors[0]
  if (error) {
    return error.code === "DUPLICATE_KEY"
      ? "YAML frontmatter contains a duplicate mapping key."
      : error.message
  }
  if (document.contents !== null && !isMap(document.contents)) {
    return "YAML frontmatter must contain a mapping or be empty."
  }
  return null
}
