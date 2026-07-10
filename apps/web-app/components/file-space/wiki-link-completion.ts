export interface WikiLinkCompletionContext {
  query: string
  replaceLength: number
}

export interface WikiLinkCompletionCandidate {
  path: string
  matchedAlias?: string
}

export interface WikiLinkCompletion {
  label: string
  description: string
  insertText: string
}

function markdownStem(filePath: string): string {
  return filePath.replace(/\.(?:md|markdown)$/i, "")
}

function filenameOf(filePath: string): string {
  return filePath.split("/").pop() || filePath
}

function linkText(candidate: WikiLinkCompletionCandidate): string {
  return candidate.matchedAlias || markdownStem(filenameOf(candidate.path))
}

export function getWikiLinkCompletionContext(
  linePrefix: string
): WikiLinkCompletionContext | null {
  const match = linePrefix.match(/\[\[([^\]\n]*)$/)
  if (!match || /[|#]/.test(match[1])) return null
  return { query: match[1].trim(), replaceLength: match[1].length }
}

export function createWikiLinkCompletions(
  candidates: readonly WikiLinkCompletionCandidate[],
  currentFilePath: string
): WikiLinkCompletion[] {
  const eligible = candidates.filter(
    (candidate) =>
      /\.(?:md|markdown)$/i.test(candidate.path) &&
      candidate.path !== currentFilePath
  )
  const stemCounts = new Map<string, number>()
  for (const candidate of eligible) {
    const target = linkText(candidate).toLowerCase()
    stemCounts.set(target, (stemCounts.get(target) ?? 0) + 1)
  }
  return eligible.map((candidate) => {
    const target = linkText(candidate)
    const duplicate = (stemCounts.get(target.toLowerCase()) ?? 0) > 1
    const pathTarget = markdownStem(candidate.path)
    return {
      label: target,
      description: candidate.path,
      insertText: duplicate
        ? candidate.matchedAlias
          ? `${pathTarget}|${candidate.matchedAlias}`
          : pathTarget
        : target,
    }
  })
}
