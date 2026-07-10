export interface FileSpaceMarkdownHeading {
  depth: number
  text: string
  line: number
  slug: string
}

export interface FileSpaceMarkdownMetadata {
  path: string
  title: string
  aliases: string[]
  headings: FileSpaceMarkdownHeading[]
  tags: string[]
  frontmatter: {
    title?: string
    aliases: string[]
    tags: string[]
  }
}

export interface FileSpaceTag {
  name: string
  count: number
  paths: string[]
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function normalizeTag(value: string): string | null {
  const tag = unquote(value).replace(/^#/, "").trim()
  return tag || null
}

function normalizeAlias(value: string): string | null {
  const alias = unquote(value).trim()
  return alias || null
}

function parseListValue(
  value: string,
  normalizeValue: (value: string) => string | null
): string[] {
  const trimmed = value.trim()
  const values =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed
          .slice(1, -1)
          .split(",")
          .map((item) => item.trim())
      : [trimmed]
  return values
    .map(normalizeValue)
    .filter((item): item is string => item !== null)
}

function parseFrontmatter(lines: string[]): {
  endLine: number
  title?: string
  aliases: string[]
  tags: string[]
} {
  if (lines[0]?.trim() !== "---") {
    return { endLine: -1, aliases: [], tags: [] }
  }
  const closingIndex = lines.findIndex(
    (line, index) =>
      index > 0 && (line.trim() === "---" || line.trim() === "...")
  )
  if (closingIndex === -1) {
    return { endLine: -1, aliases: [], tags: [] }
  }

  let title: string | undefined
  const aliases: string[] = []
  const tags: string[] = []
  let readingList: "aliases" | "tags" | null = null
  for (const line of lines.slice(1, closingIndex)) {
    const keyValue = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (keyValue) {
      const key = keyValue[1].toLowerCase()
      const value = keyValue[2]
      const listKey =
        key === "tags"
          ? "tags"
          : key === "alias" || key === "aliases"
            ? "aliases"
            : null
      readingList = listKey && !value.trim() ? listKey : null
      if (key === "title" && value.trim()) title = unquote(value)
      if (listKey === "tags" && value.trim()) {
        tags.push(...parseListValue(value, normalizeTag))
      }
      if (listKey === "aliases" && value.trim()) {
        aliases.push(...parseListValue(value, normalizeAlias))
      }
      continue
    }
    if (readingList) {
      const listItem = line.match(/^\s*-\s+(.+)$/)
      if (listItem) {
        const item =
          readingList === "tags"
            ? normalizeTag(listItem[1])
            : normalizeAlias(listItem[1])
        if (item) {
          if (readingList === "tags") tags.push(item)
          else aliases.push(item)
        }
      } else if (line.trim()) {
        readingList = null
      }
    }
  }
  return { endLine: closingIndex, title, aliases, tags }
}

export function maskMarkdownComments(content: string): string {
  const mask = (value: string) => value.replace(/[^\n]/g, " ")
  return content
    .replace(/<!--[\s\S]*?-->/g, mask)
    .replace(/%%[\s\S]*?%%/g, mask)
}

function visibleMarkdownLines(
  lines: string[],
  frontmatterEndLine: number
): string[] {
  const visible = maskMarkdownComments(lines.join("\n")).split("\n")
  for (let index = 0; index <= frontmatterEndLine; index += 1) {
    visible[index] = ""
  }

  const codeMarker = String.fromCharCode(96)
  let fenceMarker: string | null = null
  let fenceLength = 0
  for (let index = frontmatterEndLine + 1; index < lines.length; index += 1) {
    const line = visible[index]
    const fence = line.match(/^\s*((?:~{3,})+)\s*.*$/)
    const codeFenceStart = line.trimStart().startsWith(codeMarker.repeat(3))
    const marker = fence?.[1]?.[0] ?? (codeFenceStart ? codeMarker : null)
    const markerLength = marker
      ? (line.trimStart().match(new RegExp("^" + marker + "+"))?.[0].length ??
        0)
      : 0

    if (fenceMarker) {
      visible[index] = ""
      if (marker === fenceMarker && markerLength >= fenceLength) {
        fenceMarker = null
        fenceLength = 0
      }
      continue
    }
    if (marker && markerLength >= 3) {
      fenceMarker = marker
      fenceLength = markerLength
      visible[index] = ""
      continue
    }

    const inlinePattern = new RegExp(
      codeMarker + "[^" + codeMarker + "\\n]*" + codeMarker,
      "g"
    )
    visible[index] = line.replace(inlinePattern, "")
  }
  return visible
}

function plainHeadingText(value: string): string {
  return value
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) =>
      String(alias || target)
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_~]/g, "")
    .trim()
}

export function markdownHeadingSlug(text: string, occurrence = 0): string {
  const base =
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-") || "section"
  return occurrence <= 0 ? base : base + "-" + Math.floor(occurrence)
}

function uniqueSlug(text: string, counts: Map<string, number>): string {
  const base = markdownHeadingSlug(text)
  const count = counts.get(base) ?? 0
  counts.set(base, count + 1)
  return markdownHeadingSlug(text, count)
}

function extractHeadings(lines: string[]): FileSpaceMarkdownHeading[] {
  const headings: FileSpaceMarkdownHeading[] = []
  const slugCounts = new Map<string, number>()
  for (let index = 0; index < lines.length; index += 1) {
    const atx = lines[index].match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (atx) {
      const text = plainHeadingText(atx[2])
      if (text) {
        headings.push({
          depth: atx[1].length,
          text,
          line: index + 1,
          slug: uniqueSlug(text, slugCounts),
        })
      }
      continue
    }
    const setext = lines[index + 1]?.match(/^\s*(=+|-+)\s*$/)
    const text = plainHeadingText(lines[index])
    if (setext && text) {
      headings.push({
        depth: setext[1][0] === "=" ? 1 : 2,
        text,
        line: index + 1,
        slug: uniqueSlug(text, slugCounts),
      })
      index += 1
    }
  }
  return headings
}

function extractInlineTags(lines: string[]): string[] {
  const tags: string[] = []
  const pattern = /(^|[\s(])#([\p{L}\p{N}_/-]+)/gu
  for (const line of lines) {
    const tagLine = line.replace(/^\s*#{1,6}\s+/, "")
    for (const match of tagLine.matchAll(pattern)) {
      const tag = normalizeTag(match[2])
      if (tag) tags.push(tag)
    }
  }
  return tags
}

function uniqueStrings(values: string[]): string[] {
  const strings = new Map<string, string>()
  for (const value of values) {
    const key = value.toLowerCase()
    if (!strings.has(key)) strings.set(key, value)
  }
  return [...strings.values()].sort((left, right) => left.localeCompare(right))
}

function portableBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/")
  return normalized.slice(normalized.lastIndexOf("/") + 1)
}

export function parseMarkdownMetadata(
  filePath: string,
  content: string
): FileSpaceMarkdownMetadata {
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  const frontmatter = parseFrontmatter(lines)
  const visibleLines = visibleMarkdownLines(lines, frontmatter.endLine)
  const headings = extractHeadings(visibleLines)
  const aliases = uniqueStrings(frontmatter.aliases)
  const tags = uniqueStrings([
    ...frontmatter.tags,
    ...extractInlineTags(visibleLines),
  ])
  const fallbackTitle = portableBasename(filePath).replace(
    /\.(?:md|markdown)$/i,
    ""
  )
  return {
    path: filePath,
    title:
      frontmatter.title ||
      headings.find((heading) => heading.depth === 1)?.text ||
      fallbackTitle,
    aliases,
    headings,
    tags,
    frontmatter: {
      title: frontmatter.title,
      aliases,
      tags: uniqueStrings(frontmatter.tags),
    },
  }
}
