import fs from "node:fs/promises"
import path from "node:path"
import {
  literalTextMatches,
  textOffsetPosition,
  type TextSearchProgress,
  type TextSearchOptions,
} from "../../shared/text-search"
import { readTextFilePreview } from "./text-file-preview"
import { isHiddenImplementationEntry } from "./space-paths"
import { regexTextMatches } from "./regex-text-search"

const EXCLUDED = new Set([
  ".git",
  ".svn",
  ".hg",
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".cache",
])
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".log",
  ".css",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".rs",
  ".sql",
  ".sh",
  ".html",
  ".xml",
])
export const TEXT_SEARCH_LIMITS = {
  entries: 10000,
  files: 2000,
  bytes: 64 * 1024 * 1024,
  fileBytes: 2 * 1024 * 1024,
  hits: 500,
  depth: 32,
  milliseconds: 10000,
}

/** Bounded, offline disk scan. No index, symlink traversal, or binary decoding. */
export async function searchSpaceText(
  root: string,
  requestId: string,
  query: string,
  signal: AbortSignal,
  onProgress: (progress: TextSearchProgress) => void,
  limits = TEXT_SEARCH_LIMITS,
  options: TextSearchOptions = {}
): Promise<TextSearchProgress> {
  if (!query || query.length > 512 || /[\r\n\0]/u.test(query))
    throw new Error("Use a single-line search query of 1–512 characters")
  if (options.regex) new RegExp(query, options.caseSensitive ? "gu" : "giu")
  const progress: TextSearchProgress = {
    requestId,
    hits: [],
    scanned: 0,
    skipped: 0,
    errors: 0,
    done: false,
    stopped: null,
  }
  const started = performance.now()
  let emitted = started
  let entries = 0
  let bytes = 0
  const stop = () => {
    if (signal.aborted) progress.stopped = "cancelled"
    else if (
      entries >= limits.entries ||
      progress.scanned >= limits.files ||
      bytes >= limits.bytes ||
      progress.hits.length >= limits.hits ||
      performance.now() - started >= limits.milliseconds
    )
      progress.stopped = "limit"
    return progress.stopped !== null
  }
  const emit = () => onProgress({ ...progress, hits: [...progress.hits] })
  const canonicalRoot = await fs.realpath(root)
  async function visit(
    relativeDirectory: string,
    depth: number
  ): Promise<void> {
    if (stop()) return
    const directory = path.join(canonicalRoot, relativeDirectory)
    // Reject aliases introduced by external renames between directory reads.
    if ((await fs.realpath(directory)) !== directory) {
      progress.skipped++
      return
    }
    const handle = await fs.opendir(directory)
    for await (const entry of handle) {
      if (stop()) break
      entries++
      if (performance.now() - emitted > 100) {
        emit()
        emitted = performance.now()
      }
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name
      if (
        isHiddenImplementationEntry(entry.name) ||
        EXCLUDED.has(entry.name) ||
        entry.isSymbolicLink()
      ) {
        progress.skipped++
        continue
      }
      try {
        if (entry.isDirectory()) {
          if (depth >= limits.depth) {
            progress.skipped++
            continue
          }
          await visit(relativePath, depth + 1)
          continue
        }
        if (
          !entry.isFile() ||
          !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        ) {
          progress.skipped++
          continue
        }
        const stats = await fs.lstat(path.join(canonicalRoot, relativePath))
        if (stats.size > limits.fileBytes || stats.isSymbolicLink()) {
          progress.skipped++
          continue
        }
        if (bytes + stats.size > limits.bytes) {
          progress.stopped = "limit"
          break
        }
        const preview = await readTextFilePreview(canonicalRoot, relativePath)
        if (stop()) break
        if (preview.type !== "text" || preview.truncated) {
          progress.skipped++
          continue
        }
        bytes += preview.size
        progress.scanned++
        const remaining = limits.hits - progress.hits.length
        const matches = options.regex
          ? await regexTextMatches(
              preview.content,
              query,
              remaining,
              !!options.caseSensitive,
              !!options.wholeWord,
              signal
            )
          : literalTextMatches(preview.content, query, remaining, options)
        if (stop()) break
        for (const match of matches) {
          const position = textOffsetPosition(preview.content, match.start)
          const lineStart =
            preview.content.lastIndexOf("\n", match.start - 1) + 1
          const nextLine = preview.content.indexOf("\n", match.end)
          const start = Math.max(lineStart, match.start - 60)
          const end = Math.min(
            nextLine < 0 ? preview.content.length : nextLine,
            match.end + 100
          )
          progress.hits.push({
            relativePath,
            revision: preview.revision,
            ...match,
            line: position.lineNumber,
            column: position.character + 1,
            snippet: preview.content.slice(start, end),
            query,
            options,
            matchedText: preview.content.slice(match.start, match.end),
            highlightRanges: matches
              .filter((m) => m.start >= start && m.end <= end)
              .map((m) => ({ start: m.start - start, end: m.end - start })),
          })
        }
      } catch (error) {
        if (error instanceof Error && error.name === "RegexSearchError")
          throw error
        progress.errors++
      }
    }
  }
  await visit("", 0)
  stop()
  progress.done = true
  emit()
  return progress
}
