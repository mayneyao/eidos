import type { SpaceTreeEntry } from "../shared/contracts"

export const VIDEO_IGNORE_PATTERNS = [
  "*.mp4",
  "*.mov",
  "*.m4v",
  "*.mkv",
  "*.webm",
  "*.avi",
  "*.wmv",
  "*.flv",
  "*.mpg",
  "*.mpeg",
] as const

const VIDEO_EXTENSIONS = new Set(
  VIDEO_IGNORE_PATTERNS.map((pattern) => pattern.slice(1).toLowerCase())
)

export function appendVideoIgnorePatterns(content: string): {
  content: string
  added: string[]
} {
  const lines = content.split(/\r?\n/).map((line) => line.trim())
  const existing = new Set(lines)
  const added = VIDEO_IGNORE_PATTERNS.filter(
    (pattern) => !existing.has(pattern)
  )
  if (added.length === 0) return { content, added }
  const base = content.replace(/\s+$/, "")
  const hasHeader = lines.includes("# Video files")
  const block = [...(hasHeader ? [] : ["# Video files"]), ...added].join("\n")
  return {
    content: `${base}${base ? "\n\n" : ""}${block}\n`,
    added: [...added],
  }
}

export function videoFileSummary(entries: readonly SpaceTreeEntry[]): {
  count: number
  bytes: number
} {
  let count = 0
  let bytes = 0
  const stack = [...entries]
  while (stack.length > 0) {
    const entry = stack.pop()!
    if (entry.kind !== "directory") {
      const extension = entry.name.slice(entry.name.lastIndexOf("."))
      if (VIDEO_EXTENSIONS.has(extension.toLowerCase())) {
        count += 1
        bytes += entry.size
      }
    }
    if (entry.children?.length) stack.push(...entry.children)
  }
  return { count, bytes }
}
