import type { SpaceFileEntry } from "@eidos.space/file-space"

function resourceExtension(resourcePath: string): string {
  const filename = resourcePath.split("/").pop() ?? ""
  const dot = filename.lastIndexOf(".")
  return dot > 0 ? filename.slice(dot) : ""
}

function matchesClause(clause: string, entry: SpaceFileEntry): boolean {
  const expression = clause.trim()
  const extensionMatch = expression.match(
    /^resourceExtname\s*==\s*(?:"([^"]*)"|'([^']*)'|(\S+))$/
  )
  if (extensionMatch) {
    const expected = extensionMatch[1] ?? extensionMatch[2] ?? extensionMatch[3]
    return resourceExtension(entry.path) === expected
  }
  const directoryMatch = expression.match(
    /^resourceIsDirectory\s*==\s*(true|false)$/
  )
  if (directoryMatch) {
    return (entry.kind === "directory") === (directoryMatch[1] === "true")
  }
  return false
}

/**
 * File menus intentionally support a tiny declarative expression subset.
 * Unknown clauses fail closed; extension strings are never evaluated as code.
 */
export function matchesFileExtensionMenuWhen(
  when: string | undefined,
  entry: SpaceFileEntry
): boolean {
  if (!when?.trim()) return true
  return when.split("&&").every((clause) => matchesClause(clause, entry))
}
