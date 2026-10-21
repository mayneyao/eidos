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

export function spaceIgnorePreflight(
  entries: readonly SpaceTreeEntry[],
  largeFileBytes = LARGE_FILE_BYTES,
  limit = 5
): SpaceIgnorePreflight {
  let totalFiles = 0
  let totalBytes = 0
  let videoCount = 0
  let videoBytes = 0
  let symlinkCount = 0
  const largeFiles: Array<{ path: string; size: number }> = []
  const stack = [...entries]
  while (stack.length > 0) {
    const entry = stack.pop()!
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
