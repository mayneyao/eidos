import { randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"

export const EIDOS_GRAFT_IGNORE_START = "# >>> Eidos managed versioning ignores"
export const EIDOS_GRAFT_IGNORE_END = "# <<< Eidos managed versioning ignores"

const EIDOS_GRAFT_IGNORE_RULES = [
  ".graft/",
  ".graftignore",
  ".eidos/db.sqlite3",
  ".eidos/inbox.sqlite3",
  ".eidos/raw.sqlite3",
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

function managedBlock(eol: string): string {
  return [
    EIDOS_GRAFT_IGNORE_START,
    ...EIDOS_GRAFT_IGNORE_RULES,
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

export function mergeEidosGraftIgnore(content: string): string {
  const eol = detectEol(content)
  const block = managedBlock(eol)
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

  if (start !== -1 && end !== -1) {
    const afterEnd = end + EIDOS_GRAFT_IGNORE_END.length
    return `${content.slice(0, start)}${block}${content.slice(afterEnd)}`
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
  spacePath: string
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

  const next = mergeEidosGraftIgnore(existing)
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
