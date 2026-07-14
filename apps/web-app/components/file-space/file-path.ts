export function parentSpacePath(relativePath: string): string {
  const parts = relativePath.split("/")
  parts.pop()
  return parts.join("/")
}

export function ancestorSpacePaths(relativePath: string): string[] {
  const parts = relativePath.split("/").filter(Boolean)
  parts.pop()
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"))
}

export function joinSpacePath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name
}

export function uniqueSpaceEntryName(
  existingNames: Iterable<string>,
  stem: string,
  extension = ""
): string {
  const existing = new Set([...existingNames].map((name) => name.toLowerCase()))
  let candidate = `${stem}${extension}`
  let counter = 2
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${stem} ${counter}${extension}`
    counter += 1
  }
  return candidate
}

export function toSpaceFileUrl(relativePath: string, heading?: string): string {
  const search = heading ? `?heading=${encodeURIComponent(heading)}` : ""
  return `/space-file${search}#${encodeURIComponent(relativePath)}`
}

export interface SpaceBaseRecordTarget {
  tableId: string
  recordId: string
}

export function toSpaceBaseRecordUrl(
  relativePath: string,
  tableId: string,
  recordId: string
): string {
  const search = new URLSearchParams({
    table: tableId,
    record: recordId,
  })
  return `/space-file?${search.toString()}#${encodeURIComponent(relativePath)}`
}

export function toSpaceAssetUrl(relativePath: string, revision = 0): string {
  const encodedPath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  const version = revision > 0 ? `?v=${revision}` : ""
  return `/~/${encodedPath}${version}`
}

export function filePathFromSpaceUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "https://eidos.local")
    if (parsed.pathname !== "/space-file" || !parsed.hash) return null
    return decodeURIComponent(parsed.hash.slice(1))
  } catch {
    return null
  }
}

export function headingFromSpaceUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "https://eidos.local")
    if (parsed.pathname !== "/space-file") return null
    return parsed.searchParams.get("heading")
  } catch {
    return null
  }
}

export function baseRecordFromSpaceUrl(
  url: string
): SpaceBaseRecordTarget | null {
  try {
    const parsed = new URL(url, "https://eidos.local")
    if (parsed.pathname !== "/space-file") return null
    const tableId = parsed.searchParams.get("table")
    const recordId = parsed.searchParams.get("record")
    if (!tableId || !recordId) return null
    return { tableId, recordId }
  } catch {
    return null
  }
}

export function headingFromSpaceLink(rawTarget: string): string | undefined {
  const hashIndex = rawTarget.indexOf("#")
  if (hashIndex < 0) return undefined
  const rawHeading = rawTarget.slice(hashIndex + 1)
  if (!rawHeading) return undefined
  try {
    return decodeURIComponent(rawHeading)
  } catch {
    return rawHeading
  }
}

export function isSameOrDescendant(
  candidatePath: string,
  ancestorPath: string
): boolean {
  return (
    ancestorPath === "" ||
    candidatePath === ancestorPath ||
    candidatePath.startsWith(`${ancestorPath}/`)
  )
}

export function moveSpaceFileUrl(
  url: string,
  sourcePath: string,
  destinationPath: string
): string | null {
  const filePath = filePathFromSpaceUrl(url)
  if (!filePath || !isSameOrDescendant(filePath, sourcePath)) return null
  const suffix = filePath.slice(sourcePath.length)
  const heading = headingFromSpaceUrl(url) ?? undefined
  const baseRecord = baseRecordFromSpaceUrl(url)
  return baseRecord
    ? toSpaceBaseRecordUrl(
        `${destinationPath}${suffix}`,
        baseRecord.tableId,
        baseRecord.recordId
      )
    : toSpaceFileUrl(`${destinationPath}${suffix}`, heading)
}

export function canMoveSpaceEntryTo(
  sourcePath: string,
  sourceParentPath: string,
  sourceIsDirectory: boolean,
  destinationDirectory: string
): boolean {
  if (sourceParentPath === destinationDirectory) return false
  return !(
    sourceIsDirectory && isSameOrDescendant(destinationDirectory, sourcePath)
  )
}

export function resolveSpaceLink(
  currentFilePath: string,
  rawTarget: string
): string | null {
  const target = rawTarget.trim()
  if (target.startsWith("#")) return currentFilePath
  if (!target || target.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(target)) {
    return null
  }

  const withoutQuery = target.split(/[?#]/, 1)[0]
  if (!withoutQuery) return null
  let decodedTarget: string
  try {
    decodedTarget = decodeURIComponent(withoutQuery)
  } catch {
    decodedTarget = withoutQuery
  }

  const parts = [
    ...parentSpacePath(currentFilePath).split("/"),
    ...decodedTarget.split("/"),
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

export function validateSpaceEntryName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return "Enter a name"
  if (trimmed === "." || trimmed === "..") return "Choose another name"
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(trimmed)) {
    return 'Names cannot contain < > : " / \\ | ? *'
  }
  if (/[. ]$/.test(name)) return "Names cannot end with a period or space"
  const basename = trimmed.split(".", 1)[0]
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(basename)) {
    return "Choose another name"
  }
  return null
}
