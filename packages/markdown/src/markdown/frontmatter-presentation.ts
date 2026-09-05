import { parseDocument } from "yaml"

import { resolveEfmResourceUri } from "./efm-uri"
import {
  parseObsidianWikilink,
  type ObsidianWikilinkTarget,
} from "./obsidian-internal-link"

export type FrontmatterPresentationValue =
  | { kind: "empty" }
  | {
      kind: "scalar"
      type: "boolean" | "date" | "number" | "string"
      value: string
    }
  | { href: string; kind: "url"; value: string }
  | ({ kind: "wikilink" } & ObsidianWikilinkTarget)
  | { items: FrontmatterPresentationValue[]; kind: "sequence" }
  | {
      entries: FrontmatterPresentationEntry[]
      kind: "mapping"
    }

export interface FrontmatterPresentationEntry {
  key: string
  value: FrontmatterPresentationValue
}

export interface FrontmatterPresentation {
  entries: FrontmatterPresentationEntry[]
  error?: string
}

function frontmatterBody(source: string): string {
  return source
    .replace(/^---(?:\r?\n)?/u, "")
    .replace(/(?:\r?\n)?---(?:\r?\n)?$/u, "")
}

function presentationValue(
  value: unknown,
  obsidianWikilinks: boolean,
  seen: WeakSet<object>
): FrontmatterPresentationValue {
  if (value === null || value === undefined) return { kind: "empty" }

  if (value instanceof Date) {
    return { kind: "scalar", type: "date", value: value.toISOString() }
  }

  if (typeof value === "string") {
    const wikilink = obsidianWikilinks ? parseObsidianWikilink(value) : null
    if (wikilink) return { kind: "wikilink", ...wikilink }
    const href = resolveEfmResourceUri(value)
    return href
      ? { href, kind: "url", value }
      : { kind: "scalar", type: "string", value }
  }

  if (typeof value === "number") {
    return { kind: "scalar", type: "number", value: String(value) }
  }

  if (typeof value === "boolean") {
    return { kind: "scalar", type: "boolean", value: String(value) }
  }

  if (typeof value !== "object") {
    return { kind: "scalar", type: "string", value: String(value) }
  }

  if (seen.has(value)) {
    return { kind: "scalar", type: "string", value: "[Circular]" }
  }
  seen.add(value)

  if (Array.isArray(value)) {
    const presentation: FrontmatterPresentationValue = {
      kind: "sequence",
      items: value.map((item) =>
        presentationValue(item, obsidianWikilinks, seen)
      ),
    }
    seen.delete(value)
    return presentation
  }

  const presentation: FrontmatterPresentationValue = {
    kind: "mapping",
    entries: Object.entries(value).map(([key, entry]) => ({
      key,
      value: presentationValue(entry, obsidianWikilinks, seen),
    })),
  }
  seen.delete(value)
  return presentation
}

export function parseFrontmatterPresentation(
  source: string,
  options: { obsidianWikilinks?: boolean } = {}
): FrontmatterPresentation {
  const document = parseDocument(frontmatterBody(source))
  if (document.errors.length > 0) {
    return { entries: [], error: document.errors[0]?.message ?? "Invalid YAML" }
  }

  const value: unknown = document.toJS()
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { entries: [] }
  }

  const seen = new WeakSet<object>([value])
  return {
    entries: Object.entries(value).map(([key, entry]) => ({
      key,
      value: presentationValue(entry, options.obsidianWikilinks === true, seen),
    })),
  }
}
