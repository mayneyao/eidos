export interface ObsidianInternalTarget {
  target: string
  path: string
  heading?: string
  blockId?: string
}

export interface ObsidianWikilinkTarget extends ObsidianInternalTarget {
  displayText?: string
}

const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u

function firstUnescaped(value: string, character: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== character) continue
    let slashCount = 0
    for (
      let slashIndex = index - 1;
      slashIndex >= 0 && value[slashIndex] === "\\";
      slashIndex -= 1
    ) {
      slashCount += 1
    }
    if (slashCount % 2 === 0) return index
  }
  return -1
}

function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/**
 * Parses a Markdown link destination using Obsidian's Vault-link semantics.
 * External URLs and protocol-relative URLs deliberately remain outside this
 * parser so the editor can route them through its external-link callback.
 */
export function parseObsidianMarkdownLinkDestination(
  destination: string
): ObsidianInternalTarget | null {
  const target = destination.trim()
  if (!target || target.startsWith("//") || URI_SCHEME.test(target)) {
    return null
  }

  const hashOffset = target.indexOf("#")
  const encodedPath = hashOffset < 0 ? target : target.slice(0, hashOffset)
  const encodedFragment = hashOffset < 0 ? "" : target.slice(hashOffset + 1)
  const path = decoded(encodedPath)
  const fragment = decoded(encodedFragment)
  if (path === null || fragment === null || path.includes("\\")) return null

  return {
    target,
    path,
    ...(fragment.startsWith("^") && fragment.length > 1
      ? { blockId: fragment.slice(1) }
      : fragment
        ? { heading: fragment }
        : {}),
  }
}

/** Parses one complete `[[target|label]]` scalar without interpreting YAML. */
export function parseObsidianWikilink(
  value: string
): ObsidianWikilinkTarget | null {
  const match = /^\[\[([^\]\n]+)\]\]$/u.exec(value.trim())
  if (!match) return null
  const body = match[1]
  const aliasOffset = firstUnescaped(body, "|")
  const target = (aliasOffset < 0 ? body : body.slice(0, aliasOffset)).trim()
  const parsed = parseObsidianMarkdownLinkDestination(target)
  if (!parsed) return null
  const displayText =
    aliasOffset < 0
      ? undefined
      : body
          .slice(aliasOffset + 1)
          .replace(/\\\|/gu, "|")
          .trim()
  return {
    ...parsed,
    ...(displayText ? { displayText } : {}),
  }
}

function normalizedHeading(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase()
}

/** Finds an Obsidian heading target, including `#Parent#Child` paths. */
export function findObsidianHeadingTarget(
  root: ParentNode,
  headingPath: string
): HTMLElement | null {
  const requested = headingPath
    .split("#")
    .map(normalizedHeading)
    .filter(Boolean)
  if (requested.length === 0) return null

  const headings = Array.from(
    root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")
  )
  const finalHeading = requested.at(-1)
  for (let index = 0; index < headings.length; index += 1) {
    const candidate = headings[index]!
    if (normalizedHeading(candidate.textContent ?? "") !== finalHeading) {
      continue
    }
    if (requested.length === 1) return candidate

    let requestedIndex = requested.length - 2
    let childLevel = Number(candidate.tagName.slice(1))
    for (
      let ancestorIndex = index - 1;
      ancestorIndex >= 0 && requestedIndex >= 0;
      ancestorIndex -= 1
    ) {
      const ancestor = headings[ancestorIndex]!
      const ancestorLevel = Number(ancestor.tagName.slice(1))
      if (ancestorLevel >= childLevel) continue
      if (
        normalizedHeading(ancestor.textContent ?? "") !==
        requested[requestedIndex]
      ) {
        continue
      }
      requestedIndex -= 1
      childLevel = ancestorLevel
    }
    if (requestedIndex < 0) return candidate
  }
  return null
}
