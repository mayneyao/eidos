import type { SpaceIgnoreRules, SpaceTreeEntry } from "../shared/contracts"

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

export interface IgnoreTemplate {
  id: "videos" | "node" | "design" | "archives" | "system" | "temporary"
  label: string
  header: string
  patterns: readonly string[]
}

export const IGNORE_TEMPLATES: readonly IgnoreTemplate[] = [
  {
    id: "videos",
    label: "Videos",
    header: "Video files",
    patterns: VIDEO_IGNORE_PATTERNS,
  },
  {
    id: "node",
    label: "Node and build",
    header: "Node and build outputs",
    patterns: [
      "node_modules/",
      "dist/",
      "build/",
      ".next/",
      ".nuxt/",
      ".cache/",
      "coverage/",
      "*.log",
    ],
  },
  {
    id: "design",
    label: "Design files",
    header: "Design source files",
    patterns: [
      "*.psd",
      "*.ai",
      "*.sketch",
      "*.fig",
      "*.blend",
      "*.indd",
      "*.xd",
    ],
  },
  {
    id: "archives",
    label: "Archives",
    header: "Archives",
    patterns: ["*.zip", "*.tar", "*.tar.gz", "*.tgz", "*.7z", "*.rar"],
  },
  {
    id: "system",
    label: "System files",
    header: "Operating system files",
    patterns: [".DS_Store", "Thumbs.db", "desktop.ini"],
  },
  {
    id: "temporary",
    label: "Temporary files",
    header: "Temporary files",
    patterns: ["*.tmp", "*.temp", "*.swp", "*.swo", "*~"],
  },
] as const

const VIDEO_EXTENSIONS = new Set(
  VIDEO_IGNORE_PATTERNS.map((pattern) => pattern.slice(1).toLowerCase())
)
export const LARGE_FILE_BYTES = 25 * 1024 * 1024

function isVideoEntry(entry: SpaceTreeEntry): boolean {
  const extension = entry.name.slice(entry.name.lastIndexOf("."))
  return VIDEO_EXTENSIONS.has(extension.toLowerCase())
}

export function appendIgnorePatterns(
  content: string,
  patterns: readonly string[],
  header?: string
): { content: string; added: string[] } {
  const lines = content.split(/\r?\n/).map((line) => line.trim())
  const existing = new Set(lines)
  const added = patterns.filter((pattern) => !existing.has(pattern))
  if (added.length === 0) return { content, added }
  const base = content.replace(/\s+$/, "")
  const headerLine = header?.trim() ? `# ${header.trim()}` : null
  const block = [
    ...(headerLine && !existing.has(headerLine) ? [headerLine] : []),
    ...added,
  ].join("\n")
  return {
    content: `${base}${base ? "\n\n" : ""}${block}\n`,
    added: [...added],
  }
}

export function appendVideoIgnorePatterns(content: string): {
  content: string
  added: string[]
} {
  return appendIgnorePatterns(content, VIDEO_IGNORE_PATTERNS, "Video files")
}

/** Anchor an exact Space-relative path and escape Gitignore metacharacters. */
export function ignorePathPattern(relativePath: string): string {
  const escaped = relativePath.replace(/([\\*?[\]!#])/g, "\\$1")
  return `/${escaped}`
}

export function hasIgnorePattern(content: string, pattern: string): boolean {
  return content.split(/\r?\n/).some((line) => line.trim() === pattern)
}

export function templateApplied(
  content: string,
  template: IgnoreTemplate
): boolean {
  return template.patterns.every((pattern) =>
    hasIgnorePattern(content, pattern)
  )
}

export function removeIgnorePatterns(
  content: string,
  patterns: readonly string[],
  header?: string
): string {
  const remove = new Set(patterns)
  const headerLine = header?.trim() ? `# ${header.trim()}` : null
  const result = content
    .split(/\r?\n/)
    .filter(
      (line) =>
        !remove.has(line.trim()) && (!headerLine || line.trim() !== headerLine)
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "")
  return result ? `${result}\n` : ""
}

export function videoFileSummary(entries: readonly SpaceTreeEntry[]): {
  count: number
  bytes: number
} {
  const preflight = spaceIgnorePreflight(entries)
  return { count: preflight.videoCount, bytes: preflight.videoBytes }
}

export interface SpaceIgnorePreflight {
  totalFiles: number
  totalBytes: number
  videoCount: number
  videoBytes: number
  symlinkCount: number
  largeFileCount: number
  largeFiles: Array<{ path: string; size: number }>
}

interface CompiledIgnoreRule {
  negate: boolean
  directory: boolean
  regex: RegExp
}

function globToRegex(pattern: string): string {
  return pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
}

function compileIgnoreRules(content: string): CompiledIgnoreRule[] {
  const rules: CompiledIgnoreRule[] = []
  for (const raw of content.split(/\r?\n/)) {
    let value = raw.trim()
    if (!value || value.startsWith("#")) continue
    let negate = false
    if (value.startsWith("!")) {
      negate = true
      value = value.slice(1)
    }
    if (!value) continue
    const directory = value.endsWith("/")
    if (directory) value = value.slice(0, -1)
    const anchored = value.startsWith("/")
    if (anchored) value = value.slice(1)
    if (!value) continue
    const body = globToRegex(value)
    const regex =
      anchored || value.includes("/")
        ? new RegExp(`^${body}$`)
        : new RegExp(`(^|/)${body}$`)
    rules.push({ negate, directory, regex })
  }
  return rules
}

export function isPathIgnored(
  relativePath: string,
  isDirectory: boolean,
  rules: SpaceIgnoreRules | null | undefined
): boolean {
  return isIgnoredByRules(relativePath, isDirectory, compiledIgnoreRules(rules))
}

function compiledIgnoreRules(
  rules: SpaceIgnoreRules | null | undefined
): CompiledIgnoreRule[] {
  if (!rules) return []
  return [
    ...compileIgnoreRules(rules.graftignore),
    ...compileIgnoreRules(rules.gitignore),
  ]
}

function isIgnoredByRules(
  relativePath: string,
  isDirectory: boolean,
  compiled: readonly CompiledIgnoreRule[]
): boolean {
  if (compiled.length === 0) return false
  const segments = relativePath.split("/").filter(Boolean)
  for (let index = 1; index <= segments.length; index += 1) {
    const candidate = segments.slice(0, index).join("/")
    const candidateIsDirectory = index < segments.length || isDirectory
    let ignored = false
    for (const rule of compiled) {
      if (rule.directory && !candidateIsDirectory) continue
      if (rule.regex.test(candidate)) ignored = !rule.negate
    }
    if (ignored) return true
  }
  return false
}

export function spaceIgnorePreflight(
  entries: readonly SpaceTreeEntry[],
  options: {
    rules?: SpaceIgnoreRules | null
    largeFileBytes?: number
    limit?: number
  } = {}
): SpaceIgnorePreflight {
  const largeFileBytes = options.largeFileBytes ?? LARGE_FILE_BYTES
  const limit = options.limit ?? 5
  let totalFiles = 0
  let totalBytes = 0
  let videoCount = 0
  let videoBytes = 0
  let symlinkCount = 0
  const largeFiles: Array<{ path: string; size: number }> = []
  const compiled = compiledIgnoreRules(options.rules)
  const stack = [...entries]
  while (stack.length > 0) {
    const entry = stack.pop()!
    if (
      isIgnoredByRules(entry.relativePath, entry.kind === "directory", compiled)
    )
      continue
    if (entry.kind === "symlink") symlinkCount += 1
    if (entry.kind !== "directory") {
      totalFiles += 1
      totalBytes += entry.size
      if (isVideoEntry(entry)) {
        videoCount += 1
        videoBytes += entry.size
      }
      if (entry.size >= largeFileBytes)
        largeFiles.push({ path: entry.relativePath, size: entry.size })
    }
    if (entry.children?.length) stack.push(...entry.children)
  }
  largeFiles.sort((left, right) => right.size - left.size)
  return {
    totalFiles,
    totalBytes,
    videoCount,
    videoBytes,
    symlinkCount,
    largeFileCount: largeFiles.length,
    largeFiles: largeFiles.slice(0, limit),
  }
}
