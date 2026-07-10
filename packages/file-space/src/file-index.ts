import path from "node:path"

import {
  maskMarkdownComments,
  parseMarkdownMetadata,
  type FileSpaceMarkdownMetadata,
  type FileSpaceTag,
} from "./markdown-metadata"
import type { SpaceFiles, SpaceFileEntry, SpaceTextFile } from "./space-files"

const DEFAULT_TEXT_EXTENSIONS = new Set([
  "css",
  "csv",
  "html",
  "ini",
  "js",
  "json",
  "jsx",
  "log",
  "markdown",
  "md",
  "py",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsv",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
])

export interface FileSpaceIndexOptions {
  maxIndexableFileBytes?: number
  maxIndexedContentBytes?: number
  textExtensions?: Iterable<string>
}

export interface FileSpaceSearchOptions {
  limit?: number
  includeContent?: boolean
}

export type FileSpaceSearchMatch =
  | "name"
  | "alias"
  | "path"
  | "content"
  | "mixed"

export interface FileSpaceSearchResult {
  path: string
  name: string
  size: number
  mtimeMs: number
  match: FileSpaceSearchMatch
  score: number
  matchedAlias?: string
  snippet?: string
  line?: number
}

export interface FileSpaceIndexStatus {
  indexedAt: number
  fileCount: number
  contentFileCount: number
  skippedContentFileCount: number
}

export interface FileSpaceLinkResolution {
  path: string | null
  fragment?: string
  ambiguous: boolean
  alternatives: string[]
}

export interface FileSpaceBacklinkReference {
  target: string
  line: number
  snippet: string
}

export interface FileSpaceBacklink {
  sourcePath: string
  sourceName: string
  count: number
  references: FileSpaceBacklinkReference[]
}

interface IndexedFile {
  path: string
  name: string
  size: number
  mtimeMs: number
  content?: string
  normalizedContent?: string
  metadata?: FileSpaceMarkdownMetadata
}

interface SearchMatch {
  result: FileSpaceSearchResult
  path: string
}

interface ParsedSearchQuery {
  normalizedText: string
  tags: string[]
  terms: string[]
}

interface ExtractedMarkdownLink {
  target: string
  index: number
}

const DEFAULT_MAX_FILE_BYTES = 1_000_000
const DEFAULT_MAX_CONTENT_BYTES = 25_000_000
const DEFAULT_LIMIT = 50

function extensionOf(filename: string): string {
  const extension = path.posix.extname(filename)
  return extension ? extension.slice(1).toLowerCase() : ""
}

function normalize(value: string): string {
  return value.toLowerCase()
}

function decodeFragment(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseSearchQuery(query: string): ParsedSearchQuery {
  const tags: string[] = []
  const text = query.replace(
    /(^|\s)tag:(?:"([^"]+)"|([^\s]+))/giu,
    (_match, leadingSpace: string, quotedTag: string, plainTag: string) => {
      const tag = normalize((quotedTag || plainTag).replace(/^#/, "").trim())
      if (tag) tags.push(tag)
      return leadingSpace
    }
  )
  const normalizedText = normalize(text.trim())
  return {
    normalizedText,
    tags: [...new Set(tags)],
    terms: normalizedText.split(/\s+/).filter(Boolean),
  }
}

function matchesTagFilter(metadata: FileSpaceMarkdownMetadata, tag: string) {
  return metadata.tags.some((candidate) => {
    const normalizedTag = normalize(candidate)
    return normalizedTag === tag || normalizedTag.startsWith(tag + "/")
  })
}

function withoutMarkdownExtension(filename: string): string {
  return filename.replace(/\.(?:md|markdown)$/i, "")
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(200, Math.floor(limit ?? DEFAULT_LIMIT)))
}

function contentMatch(content: string, terms: string[]): boolean {
  return terms.every((term) => content.includes(term))
}

function createSnippet(
  content: string,
  normalizedContent: string,
  terms: string[]
): { snippet: string; line: number } | undefined {
  const indexes = terms
    .map((term) => normalizedContent.indexOf(term))
    .filter((index) => index >= 0)
  if (indexes.length === 0) return undefined

  const matchIndex = Math.min(...indexes)
  const line = content.slice(0, matchIndex).split("\n").length
  const lineStart = content.lastIndexOf("\n", matchIndex - 1) + 1
  const lineEndIndex = content.indexOf("\n", matchIndex)
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex
  const rawLine = content.slice(lineStart, lineEnd).trim()
  if (rawLine.length <= 180) return { snippet: rawLine, line }

  const offset = Math.max(0, matchIndex - lineStart - 70)
  const clipped = rawLine.slice(offset, offset + 180).trim()
  return {
    snippet: `${offset > 0 ? "…" : ""}${clipped}${
      offset + 180 < rawLine.length ? "…" : ""
    }`,
    line,
  }
}

function resolvePortablePath(
  baseDirectory: string,
  target: string
): string | null {
  const parts = [
    ...baseDirectory.split("/"),
    ...target.split("\\").join("/").split("/"),
  ]
  const resolved: string[] = []
  for (const part of parts) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (resolved.length === 0) return null
      resolved.pop()
      continue
    }
    resolved.push(part)
  }
  return resolved.join("/") || null
}

function parentPath(filePath: string): string {
  const parent = path.posix.dirname(filePath)
  return parent === "." ? "" : parent
}

function directoryDistance(left: string, right: string): number {
  const leftParts = left ? left.split("/") : []
  const rightParts = right ? right.split("/") : []
  let common = 0
  while (
    common < leftParts.length &&
    common < rightParts.length &&
    leftParts[common].toLowerCase() === rightParts[common].toLowerCase()
  ) {
    common += 1
  }
  return leftParts.length + rightParts.length - common * 2
}

function withDefaultMarkdownExtension(target: string): string[] {
  const extension = path.posix.extname(target).toLowerCase()
  if (!extension) return [`${target}.md`, `${target}.markdown`, target]
  if (extension === ".md") {
    return [target, `${target.slice(0, -extension.length)}.markdown`]
  }
  return [target]
}

function isSameOrDescendantPath(candidate: string, ancestor: string): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`)
}

function maskMarkdownCode(content: string): string {
  const marker = String.fromCharCode(96)
  const fencedPattern = new RegExp(
    marker.repeat(3) + "[\\s\\S]*?" + marker.repeat(3),
    "g"
  )
  const inlinePattern = new RegExp(
    marker + "[^" + marker + "\\n]*" + marker,
    "g"
  )
  const mask = (value: string) => value.replace(/[^\n]/g, " ")
  return maskMarkdownComments(content)
    .replace(fencedPattern, mask)
    .replace(/~~~[\s\S]*?~~~/g, mask)
    .replace(inlinePattern, mask)
}

function maskRange(value: string[], start: number, length: number): void {
  for (let index = start; index < start + length; index += 1) {
    if (value[index] !== "\n") value[index] = " "
  }
}

function extractMarkdownLinks(content: string): ExtractedMarkdownLink[] {
  const masked = maskMarkdownCode(content)
  const wikiSource = [...masked]
  const links: ExtractedMarkdownLink[] = []
  const standardPattern =
    /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)\n]+))(?:\s+["'][^)\n]*["'])?\s*\)/g
  for (const match of masked.matchAll(standardPattern)) {
    const target = (match[1] ?? match[2] ?? "").trim()
    const index = match.index ?? 0
    if (target) links.push({ target, index })
    maskRange(wikiSource, index, match[0].length)
  }

  const wikiPattern = /!?\[\[([^\]\n]+)\]\]/g
  for (const match of wikiSource.join("").matchAll(wikiPattern)) {
    const target = match[1].split("|", 1)[0].trim()
    if (target) links.push({ target, index: match.index ?? 0 })
  }
  return links.sort((left, right) => left.index - right.index)
}

function backlinkReference(
  content: string,
  link: ExtractedMarkdownLink
): FileSpaceBacklinkReference {
  const line = content.slice(0, link.index).split("\n").length
  const lineStart = content.lastIndexOf("\n", link.index - 1) + 1
  const nextLine = content.indexOf("\n", link.index)
  const lineEnd = nextLine === -1 ? content.length : nextLine
  const rawSnippet = content.slice(lineStart, lineEnd).trim()
  const snippet =
    rawSnippet.length > 200
      ? rawSnippet.slice(0, 199).trimEnd() + "…"
      : rawSnippet
  return { target: link.target, line, snippet }
}

export class FileSpaceIndex {
  private readonly maxIndexableFileBytes: number
  private readonly maxIndexedContentBytes: number
  private readonly textExtensions: Set<string>
  private entries = new Map<string, IndexedFile>()
  private directories = new Set<string>([""])
  private dirty = true
  private invalidationVersion = 0
  private refreshPromise: Promise<FileSpaceIndexStatus> | null = null
  private status: FileSpaceIndexStatus = {
    indexedAt: 0,
    fileCount: 0,
    contentFileCount: 0,
    skippedContentFileCount: 0,
  }

  constructor(
    private readonly files: SpaceFiles,
    options: FileSpaceIndexOptions = {}
  ) {
    this.maxIndexableFileBytes = Math.max(
      0,
      options.maxIndexableFileBytes ?? DEFAULT_MAX_FILE_BYTES
    )
    this.maxIndexedContentBytes = Math.max(
      0,
      options.maxIndexedContentBytes ?? DEFAULT_MAX_CONTENT_BYTES
    )
    this.textExtensions = new Set(
      [...(options.textExtensions ?? DEFAULT_TEXT_EXTENSIONS)].map(
        (extension) => extension.replace(/^\./, "").toLowerCase()
      )
    )
  }

  invalidate(): void {
    this.invalidationVersion += 1
    this.dirty = true
  }

  async refresh(): Promise<FileSpaceIndexStatus> {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.buildIndex().finally(() => {
      this.refreshPromise = null
    })
    return this.refreshPromise
  }

  async getStatus(): Promise<FileSpaceIndexStatus> {
    await this.ensureFresh()
    return { ...this.status }
  }

  updateTextFile(file: SpaceTextFile): boolean {
    if (!this.canUpdateIncrementally()) {
      this.invalidate()
      return false
    }
    this.upsertTextFile(file)
    return true
  }

  removePath(relativePath: string): boolean {
    if (!this.canUpdateIncrementally()) {
      this.invalidate()
      return false
    }
    for (const entryPath of this.entries.keys()) {
      if (isSameOrDescendantPath(entryPath, relativePath)) {
        this.entries.delete(entryPath)
      }
    }
    for (const directory of this.directories) {
      if (directory && isSameOrDescendantPath(directory, relativePath)) {
        this.directories.delete(directory)
      }
    }
    this.recalculateStatus()
    return true
  }

  movePath(sourcePath: string, destinationPath: string): boolean {
    if (!this.canUpdateIncrementally()) {
      this.invalidate()
      return false
    }
    const movedEntries: Array<[string, IndexedFile]> = []
    for (const [entryPath, entry] of this.entries) {
      if (!isSameOrDescendantPath(entryPath, sourcePath)) continue
      this.entries.delete(entryPath)
      const nextPath = destinationPath + entryPath.slice(sourcePath.length)
      movedEntries.push([
        nextPath,
        {
          ...entry,
          path: nextPath,
          name: path.posix.basename(nextPath),
          metadata: entry.metadata
            ? { ...entry.metadata, path: nextPath }
            : undefined,
        },
      ])
    }
    for (const [entryPath, entry] of movedEntries) {
      this.entries.set(entryPath, entry)
    }

    const movedDirectories: string[] = []
    for (const directory of this.directories) {
      if (!directory || !isSameOrDescendantPath(directory, sourcePath)) {
        continue
      }
      this.directories.delete(directory)
      movedDirectories.push(
        destinationPath + directory.slice(sourcePath.length)
      )
    }
    for (const directory of movedDirectories) this.directories.add(directory)
    this.recalculateStatus()
    return true
  }

  async handleFileChange(relativePath: string): Promise<void> {
    if (!this.canUpdateIncrementally()) {
      this.invalidate()
      return
    }
    let siblings: SpaceFileEntry[]
    try {
      siblings = await this.files.list(parentPath(relativePath))
    } catch {
      this.invalidate()
      return
    }
    if (!this.canUpdateIncrementally()) {
      this.invalidate()
      return
    }

    const entry = siblings.find((candidate) => candidate.path === relativePath)
    if (!entry) {
      if (this.directories.has(relativePath)) {
        this.invalidate()
      } else {
        this.removePath(relativePath)
      }
      return
    }
    if (entry.kind === "directory") {
      this.invalidate()
      return
    }
    if (
      entry.kind === "file" &&
      this.textExtensions.has(extensionOf(entry.name)) &&
      entry.size <= this.maxIndexableFileBytes &&
      entry.size <= this.maxIndexedContentBytes
    ) {
      try {
        const file = await this.files.readText(entry.path)
        if (!this.canUpdateIncrementally()) {
          this.invalidate()
          return
        }
        this.upsertTextFile(file)
      } catch {
        this.invalidate()
      }
      return
    }
    this.upsertEntry(entry)
  }

  async search(
    query: string,
    options: FileSpaceSearchOptions = {}
  ): Promise<FileSpaceSearchResult[]> {
    await this.ensureFresh()
    const limit = normalizeLimit(options.limit)
    const includeContent = options.includeContent ?? true
    const { normalizedText, tags, terms } = parseSearchQuery(query)
    if (!normalizedText && tags.length === 0) {
      return [...this.entries.values()]
        .sort(
          (left, right) =>
            right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path)
        )
        .slice(0, limit)
        .map((entry) => ({
          path: entry.path,
          name: entry.name,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          match: "path",
          score: 0,
        }))
    }

    const matches: SearchMatch[] = []
    for (const entry of this.entries.values()) {
      const metadata = entry.metadata
      if (
        tags.length > 0 &&
        (!metadata || !tags.every((tag) => matchesTagFilter(metadata, tag)))
      ) {
        continue
      }

      const normalizedName = normalize(entry.name)
      const normalizedStem = normalize(withoutMarkdownExtension(entry.name))
      const normalizedPath = normalize(entry.path)
      const normalizedAliases = (metadata?.aliases ?? []).map((alias) => ({
        alias,
        normalized: normalize(alias),
      }))
      if (!normalizedText) {
        matches.push({
          path: entry.path,
          result: {
            path: entry.path,
            name: entry.name,
            size: entry.size,
            mtimeMs: entry.mtimeMs,
            match: "content",
            score: 600,
            snippet: metadata?.tags.map((tag) => `#${tag}`).join(" "),
          },
        })
        continue
      }
      const nameMatches = contentMatch(normalizedName, terms)
      const aliasMatches = terms.every((term) =>
        normalizedAliases.some((alias) => alias.normalized.includes(term))
      )
      const pathMatches = contentMatch(normalizedPath, terms)
      const bodyMatches =
        includeContent && entry.normalizedContent
          ? contentMatch(entry.normalizedContent, terms)
          : false
      const combinedMatches = terms.every(
        (term) =>
          normalizedName.includes(term) ||
          normalizedPath.includes(term) ||
          normalizedAliases.some((alias) => alias.normalized.includes(term)) ||
          (includeContent && entry.normalizedContent?.includes(term))
      )
      if (!combinedMatches) continue

      let match: FileSpaceSearchMatch
      let score: number
      let matchedAlias: string | undefined
      const exactAlias = normalizedAliases.find(
        (alias) => alias.normalized === normalizedText
      )
      const prefixAlias = normalizedAliases.find((alias) =>
        alias.normalized.startsWith(normalizedText)
      )
      if (
        normalizedName === normalizedText ||
        normalizedStem === normalizedText
      ) {
        match = "name"
        score = 1_000
      } else if (exactAlias) {
        match = "alias"
        score = 900
        matchedAlias = exactAlias.alias
      } else if (normalizedName.startsWith(normalizedText)) {
        match = "name"
        score = 850
      } else if (prefixAlias) {
        match = "alias"
        score = 750
        matchedAlias = prefixAlias.alias
      } else if (nameMatches) {
        match = "name"
        score = 700
      } else if (aliasMatches) {
        match = "alias"
        score = 650
        matchedAlias = normalizedAliases.find((alias) =>
          terms.some((term) => alias.normalized.includes(term))
        )?.alias
      } else if (pathMatches) {
        match = "path"
        score = 500
      } else if (bodyMatches) {
        match = "content"
        score = 300
      } else {
        match = "mixed"
        score = 200
      }

      const snippet =
        match === "alias" && matchedAlias
          ? { snippet: `Alias: ${matchedAlias}` }
          : (match === "content" || match === "mixed") &&
              entry.content &&
              entry.normalizedContent
            ? createSnippet(entry.content, entry.normalizedContent, terms)
            : undefined
      matches.push({
        path: entry.path,
        result: {
          path: entry.path,
          name: entry.name,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          match,
          score,
          matchedAlias,
          ...snippet,
        },
      })
    }

    return matches
      .sort(
        (left, right) =>
          right.result.score - left.result.score ||
          right.result.mtimeMs - left.result.mtimeMs ||
          left.path.localeCompare(right.path)
      )
      .slice(0, limit)
      .map(({ result }) => result)
  }

  async resolveLink(
    currentFilePath: string,
    rawTarget: string
  ): Promise<FileSpaceLinkResolution> {
    await this.ensureFresh()
    return this.resolveLinkFromIndex(currentFilePath, rawTarget)
  }

  async getBacklinks(targetFilePath: string): Promise<FileSpaceBacklink[]> {
    await this.ensureFresh()
    const canonicalTarget = [...this.entries.values()].find(
      (entry) => normalize(entry.path) === normalize(targetFilePath)
    )
    if (!canonicalTarget) return []

    const backlinks = new Map<string, FileSpaceBacklink>()
    for (const source of this.entries.values()) {
      if (
        !source.content ||
        normalize(source.path) === normalize(canonicalTarget.path) ||
        !["md", "markdown"].includes(extensionOf(source.name))
      ) {
        continue
      }
      for (const link of extractMarkdownLinks(source.content)) {
        const resolved = this.resolveLinkFromIndex(source.path, link.target)
        if (
          !resolved.path ||
          normalize(resolved.path) !== normalize(canonicalTarget.path)
        ) {
          continue
        }
        const existing = backlinks.get(source.path) ?? {
          sourcePath: source.path,
          sourceName: source.name,
          count: 0,
          references: [],
        }
        existing.count += 1
        existing.references.push(backlinkReference(source.content, link))
        backlinks.set(source.path, existing)
      }
    }
    return [...backlinks.values()].sort((left, right) =>
      left.sourcePath.localeCompare(right.sourcePath)
    )
  }

  async getDocumentMetadata(
    filePath: string
  ): Promise<FileSpaceMarkdownMetadata | null> {
    await this.ensureFresh()
    const entry = [...this.entries.values()].find(
      (candidate) => normalize(candidate.path) === normalize(filePath)
    )
    if (
      !entry ||
      !["md", "markdown"].includes(extensionOf(entry.name)) ||
      entry.size > this.maxIndexableFileBytes
    ) {
      return null
    }
    if (entry.metadata) return entry.metadata
    try {
      const file = await this.files.readText(entry.path)
      return parseMarkdownMetadata(entry.path, file.content)
    } catch {
      return null
    }
  }

  async listTags(): Promise<FileSpaceTag[]> {
    await this.ensureFresh()
    const tags = new Map<string, FileSpaceTag>()
    for (const entry of this.entries.values()) {
      if (
        entry.content === undefined ||
        !["md", "markdown"].includes(extensionOf(entry.name))
      ) {
        continue
      }
      const metadata = entry.metadata
      if (!metadata) continue
      for (const tagName of metadata.tags) {
        const key = normalize(tagName)
        const tag = tags.get(key) ?? { name: tagName, count: 0, paths: [] }
        tag.count += 1
        tag.paths.push(entry.path)
        tags.set(key, tag)
      }
    }
    return [...tags.values()]
      .map((tag) => ({
        ...tag,
        paths: tag.paths.sort((left, right) => left.localeCompare(right)),
      }))
      .sort(
        (left, right) =>
          right.count - left.count || left.name.localeCompare(right.name)
      )
  }

  private resolveLinkFromIndex(
    currentFilePath: string,
    rawTarget: string
  ): FileSpaceLinkResolution {
    const target = rawTarget.trim()
    if (
      !target ||
      target.startsWith("/") ||
      /^[a-z][a-z\d+.-]*:/i.test(target)
    ) {
      return { path: null, ambiguous: false, alternatives: [] }
    }

    if (target.startsWith("#")) {
      return {
        path: currentFilePath,
        fragment: decodeFragment(target.slice(1)),
        ambiguous: false,
        alternatives: [],
      }
    }

    const hashIndex = target.indexOf("#")
    const fragment = decodeFragment(
      hashIndex >= 0 ? target.slice(hashIndex + 1) : undefined
    )
    const pathAndQuery = hashIndex >= 0 ? target.slice(0, hashIndex) : target
    const targetPath = pathAndQuery.split("?", 1)[0]
    let decodedTarget: string
    try {
      decodedTarget = decodeURIComponent(targetPath)
    } catch {
      decodedTarget = targetPath
    }
    if (!decodedTarget) {
      return { path: null, fragment, ambiguous: false, alternatives: [] }
    }

    const currentDirectory = parentPath(currentFilePath)
    const lookup = new Map(
      [...this.entries.values()].map((entry) => [normalize(entry.path), entry])
    )
    const directCandidates: string[] = []
    for (const candidate of withDefaultMarkdownExtension(decodedTarget)) {
      const relative = resolvePortablePath(currentDirectory, candidate)
      if (relative) directCandidates.push(relative)
      const fromRoot = resolvePortablePath("", candidate)
      if (fromRoot && !directCandidates.includes(fromRoot)) {
        directCandidates.push(fromRoot)
      }
    }
    for (const candidate of directCandidates) {
      const direct = lookup.get(normalize(candidate))
      if (direct) {
        return {
          path: direct.path,
          fragment,
          ambiguous: false,
          alternatives: [],
        }
      }
    }

    const normalizedTargets =
      withDefaultMarkdownExtension(decodedTarget).map(normalize)
    const filenameCandidates = [...this.entries.values()].filter((entry) => {
      const normalizedEntryPath = normalize(entry.path)
      const normalizedEntryName = normalize(entry.name)
      return normalizedTargets.some(
        (candidate) =>
          normalizedEntryName === path.posix.basename(candidate) ||
          normalizedEntryPath === candidate ||
          normalizedEntryPath.endsWith(`/${candidate}`)
      )
    })
    const normalizedAliasTargets = new Set([
      normalize(decodedTarget),
      normalize(withoutMarkdownExtension(decodedTarget)),
    ])
    const aliasCandidates = [...this.entries.values()].filter((entry) =>
      entry.metadata?.aliases.some((alias) =>
        normalizedAliasTargets.has(normalize(alias))
      )
    )
    const candidates =
      filenameCandidates.length > 0 ? filenameCandidates : aliasCandidates
    candidates.sort(
      (left, right) =>
        directoryDistance(currentDirectory, parentPath(left.path)) -
          directoryDistance(currentDirectory, parentPath(right.path)) ||
        left.path.localeCompare(right.path)
    )

    return {
      path: candidates[0]?.path ?? null,
      fragment,
      ambiguous: candidates.length > 1,
      alternatives: candidates.slice(1).map((entry) => entry.path),
    }
  }

  private async ensureFresh(): Promise<void> {
    while (this.dirty || this.refreshPromise) await this.refresh()
  }

  private canUpdateIncrementally(): boolean {
    return !this.dirty && !this.refreshPromise && this.status.indexedAt > 0
  }

  private upsertTextFile(file: SpaceTextFile): void {
    const existing = this.entries.get(file.path)
    if (existing && existing.mtimeMs > file.mtimeMs) return
    const otherIndexedBytes = [...this.entries.values()].reduce(
      (total, entry) =>
        entry.path !== file.path && entry.content !== undefined
          ? total + entry.size
          : total,
      0
    )
    const shouldIndexContent =
      this.textExtensions.has(extensionOf(file.path)) &&
      file.size <= this.maxIndexableFileBytes &&
      otherIndexedBytes + file.size <= this.maxIndexedContentBytes
    const content = shouldIndexContent ? file.content : undefined
    const isMarkdown = ["md", "markdown"].includes(extensionOf(file.path))
    this.entries.set(file.path, {
      path: file.path,
      name: path.posix.basename(file.path),
      size: file.size,
      mtimeMs: file.mtimeMs,
      content,
      normalizedContent: content === undefined ? undefined : normalize(content),
      metadata:
        content !== undefined && isMarkdown
          ? parseMarkdownMetadata(file.path, content)
          : undefined,
    })
    this.recalculateStatus()
  }

  private upsertEntry(entry: SpaceFileEntry): void {
    const existing = this.entries.get(entry.path)
    if (existing && existing.mtimeMs > entry.mtimeMs) return
    this.entries.set(entry.path, {
      path: entry.path,
      name: entry.name,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
    })
    this.recalculateStatus()
  }

  private recalculateStatus(): void {
    let contentFileCount = 0
    let skippedContentFileCount = 0
    for (const entry of this.entries.values()) {
      if (!this.textExtensions.has(extensionOf(entry.name))) continue
      if (entry.content !== undefined) contentFileCount += 1
      else skippedContentFileCount += 1
    }
    this.status = {
      indexedAt: Date.now(),
      fileCount: this.entries.size,
      contentFileCount,
      skippedContentFileCount,
    }
  }

  private async buildIndex(): Promise<FileSpaceIndexStatus> {
    const buildVersion = this.invalidationVersion
    const listedFiles: SpaceFileEntry[] = []
    const nextDirectories = new Set<string>([""])
    const pendingDirectories = [""]
    while (pendingDirectories.length > 0) {
      const directory = pendingDirectories.pop() ?? ""
      const entries = await this.files.list(directory)
      for (const entry of entries) {
        if (entry.kind === "directory") {
          nextDirectories.add(entry.path)
          pendingDirectories.push(entry.path)
        } else {
          listedFiles.push(entry)
        }
      }
    }
    listedFiles.sort((left, right) => left.path.localeCompare(right.path))

    const nextEntries = new Map<string, IndexedFile>()
    let remainingContentBytes = this.maxIndexedContentBytes
    let contentFileCount = 0
    let skippedContentFileCount = 0
    for (const entry of listedFiles) {
      const indexed: IndexedFile = {
        path: entry.path,
        name: entry.name,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
      }
      const isTextFile = this.textExtensions.has(extensionOf(entry.name))
      if (
        entry.kind === "file" &&
        isTextFile &&
        entry.size <= this.maxIndexableFileBytes &&
        entry.size <= remainingContentBytes
      ) {
        try {
          const file = await this.files.readText(entry.path)
          indexed.content = file.content
          indexed.normalizedContent = normalize(file.content)
          if (["md", "markdown"].includes(extensionOf(file.path))) {
            indexed.metadata = parseMarkdownMetadata(file.path, file.content)
          }
          indexed.size = file.size
          indexed.mtimeMs = file.mtimeMs
          remainingContentBytes -= file.size
          contentFileCount += 1
        } catch {
          skippedContentFileCount += 1
        }
      } else if (isTextFile) {
        skippedContentFileCount += 1
      }
      nextEntries.set(entry.path, indexed)
    }

    this.entries = nextEntries
    this.directories = nextDirectories
    this.status = {
      indexedAt: Date.now(),
      fileCount: nextEntries.size,
      contentFileCount,
      skippedContentFileCount,
    }
    this.dirty = this.invalidationVersion !== buildVersion
    return { ...this.status }
  }
}
