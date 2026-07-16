import { randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"

export const EIDOS_GRAFT_IGNORE_START = "# >>> Eidos managed versioning ignores"
export const EIDOS_GRAFT_IGNORE_END = "# <<< Eidos managed versioning ignores"
export const EIDOS_AGENT_CONVERSATIONS_VERSIONED =
  "# Agent conversations are included in Space versions"

const EIDOS_GRAFT_IGNORE_RULES_BEFORE_AGENT = [
  ".graft/",
  ".graftignore",
  ".eidos/db.sqlite3",
  ".eidos/inbox.sqlite3",
  ".eidos/raw.sqlite3",
] as const

const EIDOS_GRAFT_IGNORE_RULES_AFTER_AGENT = [
  ".eidos/cache/",
  ".eidos/indexes/",
  ".eidos/sessions/",
  ".eidos/state/",
  ".eidos/secrets/",
  ".eidos/secrets.*",
  ".eidos/secrets.sqlite3",
  ".DS_Store",
  "*.tmp",
] as const

export interface EidosGraftIgnoreUpdate {
  changed: boolean
  rollback: () => Promise<void>
}

export interface EnsureEidosGraftIgnoreOptions {
  appendToExisting?: boolean
  versionAgentConversations?: boolean
}

interface ManagedBlockRange {
  start: number
  end: number
}

function managedRules(versionAgentConversations: boolean): readonly string[] {
  return [
    ...EIDOS_GRAFT_IGNORE_RULES_BEFORE_AGENT,
    ...(versionAgentConversations
      ? [EIDOS_AGENT_CONVERSATIONS_VERSIONED, ".eidos/agent/local/"]
      : [".eidos/agent/"]),
    ...EIDOS_GRAFT_IGNORE_RULES_AFTER_AGENT,
  ]
}

function managedBlock(eol: string, versionAgentConversations: boolean): string {
  return [
    EIDOS_GRAFT_IGNORE_START,
    ...managedRules(versionAgentConversations),
    EIDOS_GRAFT_IGNORE_END,
  ].join(eol)
}

function detectEol(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n"
}

function markerLineIndex(
  content: string,
  marker: string,
  fromIndex = 0
): number {
  let index = content.indexOf(marker, fromIndex)
  while (index !== -1) {
    const beforeIsBoundary = index === 0 || content[index - 1] === "\n"
    const afterIndex = index + marker.length
    const afterIsBoundary =
      afterIndex === content.length ||
      content[afterIndex] === "\r" ||
      content[afterIndex] === "\n"
    if (beforeIsBoundary && afterIsBoundary) {
      return index
    }
    index = content.indexOf(marker, afterIndex)
  }
  return -1
}

function managedBlockRange(content: string): ManagedBlockRange | null {
  let start = markerLineIndex(content, EIDOS_GRAFT_IGNORE_START)
  let end = -1

  while (start !== -1) {
    end = markerLineIndex(
      content,
      EIDOS_GRAFT_IGNORE_END,
      start + EIDOS_GRAFT_IGNORE_START.length
    )
    const nestedStart = markerLineIndex(
      content,
      EIDOS_GRAFT_IGNORE_START,
      start + EIDOS_GRAFT_IGNORE_START.length
    )
    if (nestedStart !== -1 && (end === -1 || nestedStart < end)) {
      start = nestedStart
      continue
    }
    break
  }

  return start !== -1 && end !== -1 ? { start, end } : null
}

export function isAgentConversationVersioningEnabled(content: string): boolean {
  const range = managedBlockRange(content)
  if (!range) return false
  const block = content.slice(
    range.start,
    range.end + EIDOS_GRAFT_IGNORE_END.length
  )
  return markerLineIndex(block, EIDOS_AGENT_CONVERSATIONS_VERSIONED) !== -1
}

export function mergeEidosGraftIgnore(
  content: string,
  options: Pick<EnsureEidosGraftIgnoreOptions, "versionAgentConversations"> = {}
): string {
  const eol = detectEol(content)
  const versionAgentConversations =
    options.versionAgentConversations ??
    isAgentConversationVersioningEnabled(content)
  const block = managedBlock(eol, versionAgentConversations)
  const range = managedBlockRange(content)

  if (range) {
    const afterEnd = range.end + EIDOS_GRAFT_IGNORE_END.length
    return `${content.slice(0, range.start)}${block}${content.slice(afterEnd)}`
  }

  if (!content) {
    return `${block}${eol}`
  }

  const separator = content.endsWith("\n") ? eol : `${eol}${eol}`
  return `${content}${separator}${block}${eol}`
}

async function writeIgnoreAtomically(
  spacePath: string,
  ignorePath: string,
  content: string,
  mode: number
): Promise<void> {
  const temporaryPath = path.join(
    spacePath,
    `.graftignore.eidos-${process.pid}-${randomUUID()}.tmp`
  )

  try {
    await fs.writeFile(temporaryPath, content, {
      encoding: "utf8",
      mode,
    })
    await fs.rename(temporaryPath, ignorePath)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function ensureEidosGraftIgnore(
  spacePath: string,
  options: EnsureEidosGraftIgnoreOptions = {}
): Promise<EidosGraftIgnoreUpdate> {
  const ignorePath = path.join(spacePath, ".graftignore")
  let existing = ""
  let mode: number | undefined
  let existed = false

  try {
    const stats = await fs.lstat(ignorePath)
    if (stats.isSymbolicLink()) {
      throw new Error("The Space .graftignore path cannot be a symbolic link")
    }
    existing = await fs.readFile(ignorePath, "utf8")
    mode = stats.mode & 0o777
    existed = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }

  if (
    existed &&
    options.appendToExisting === false &&
    (markerLineIndex(existing, EIDOS_GRAFT_IGNORE_START) === -1 ||
      markerLineIndex(existing, EIDOS_GRAFT_IGNORE_END) === -1)
  ) {
    return { changed: false, rollback: async () => undefined }
  }

  const next = mergeEidosGraftIgnore(existing, options)
  if (next === existing) {
    return { changed: false, rollback: async () => undefined }
  }

  await writeIgnoreAtomically(spacePath, ignorePath, next, mode ?? 0o644)

  return {
    changed: true,
    rollback: async () => {
      let current: string
      try {
        const stats = await fs.lstat(ignorePath)
        if (stats.isSymbolicLink()) {
          return
        }
        current = await fs.readFile(ignorePath, "utf8")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return
        }
        throw error
      }

      // A user or another tool may have edited the file while initialization
      // was running. Never overwrite content that is no longer ours.
      if (current !== next) {
        return
      }

      if (!existed) {
        await fs.rm(ignorePath, { force: true })
        return
      }
      await writeIgnoreAtomically(
        spacePath,
        ignorePath,
        existing,
        mode ?? 0o644
      )
    },
  }
}

export async function getAgentConversationVersioningEnabled(
  spacePath: string
): Promise<boolean> {
  const ignorePath = path.join(spacePath, ".graftignore")
  try {
    const stats = await fs.lstat(ignorePath)
    if (stats.isSymbolicLink()) {
      throw new Error("The Space .graftignore path cannot be a symbolic link")
    }
    return isAgentConversationVersioningEnabled(
      await fs.readFile(ignorePath, "utf8")
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}
