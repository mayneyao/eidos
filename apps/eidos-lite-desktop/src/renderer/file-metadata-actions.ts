import type {
  EidosFileRow,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { eidosFileUriClass } from "@eidos.space/eidos-file"
import {
  normalizeFileMetadataDirectory,
  SPACE_FILE_METADATA_PATH,
} from "../shared/file-metadata"

/** Compare logical targets without accessing the filesystem from the renderer. */
export function fileMetadataAttachmentMatchesPath(
  metadataPath: string,
  uri: string | undefined,
  mappedPath: string
): boolean {
  if (!uri || eidosFileUriClass(uri) !== "relative") return false
  try {
    const segments = uri
      .split("/")
      .map((segment) => decodeURIComponent(segment))
    if (
      segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          /[/\\\u0000]/u.test(segment)
      )
    )
      return false
    const directory =
      metadataPath === SPACE_FILE_METADATA_PATH
        ? []
        : metadataPath.split("/").slice(0, -1)
    return [...directory, ...segments].join("/") === mappedPath
  } catch {
    return false
  }
}

/** Navigation adds scope without persisting it into the shared View. */
export function fileMetadataScopedView(
  table: EidosFileTableSnapshot,
  view: EidosFileViewInfo | undefined,
  directory: string | undefined
): EidosFileViewInfo | undefined {
  if (
    directory === undefined ||
    !view ||
    table.table.settings?.vtabModule !== "fs_meta"
  )
    return view
  const scope = normalizeFileMetadataDirectory(directory)
  if (!scope) return view
  const field = table.fields.find(
    (field) => field.name === "path" && field.settings?.isSystem === true
  )
  if (!field)
    throw new Error("The file metadata table has no system path field")
  return {
    ...view,
    filter: {
      type: "group",
      conjunction: "and",
      children: [
        ...(view.filter ? [view.filter] : []),
        {
          type: "rule",
          field: field.id!,
          // Runtime text starts-with is case-insensitive; directory identity is exact.
          operator: "greater-than-or-equal",
          value: `${scope}/`,
        },
        {
          type: "rule",
          field: field.id!,
          operator: "less-than",
          value: `${scope}0`,
        },
      ],
    },
  }
}

/** Disk-backed tables also depend on files below their configured scan root. */
export function externalChangeAffectsEidosFile(
  relativePath: string,
  changedPaths: readonly string[],
  snapshot: EidosFileSnapshot
): boolean {
  const normalize = (value: string) => {
    const parts: string[] = []
    for (const part of value.replaceAll("\\", "/").split("/")) {
      if (part === "..") parts.pop()
      else if (part && part !== ".") parts.push(part)
    }
    return parts.join("/")
  }
  const filePath = normalize(relativePath)
  const scanRoots = snapshot.tables.flatMap(({ table }) => {
    if (table.settings?.vtabModule !== "fs_meta") return []
    const config = table.settings.vtabConfig as { root?: unknown } | undefined
    const root = typeof config?.root === "string" ? config.root : "."
    // Legacy absolute roots cannot be mapped to Space-relative watcher paths.
    // Refresh conservatively rather than keep stale physical-file values.
    if (root.startsWith("/") || /^[a-z]:/iu.test(root)) return [""]
    return [normalize(`${filePath.split("/").slice(0, -1).join("/")}/${root}`)]
  })
  return (
    changedPaths.length === 0 ||
    changedPaths.some((candidate) => {
      const changedPath = normalize(candidate)
      if (!changedPath || changedPath === filePath) return true
      if (filePath.startsWith(`${changedPath}/`)) return true
      if (
        ["-wal", "-shm", "-journal"].some(
          (suffix) => changedPath === `${filePath}${suffix}`
        )
      )
        return true
      return scanRoots.some(
        (root) =>
          !root ||
          changedPath === root ||
          changedPath.startsWith(`${root}/`) ||
          root.startsWith(`${changedPath}/`)
      )
    })
  )
}

/** Resolve a mapped file relative to the metadata file, never to the UI cwd. */
export function fileMetadataRowPath(
  table: EidosFileTableSnapshot,
  row: EidosFileRow,
  metadataPath: string
): string | null {
  if (table.table.settings?.vtabModule !== "fs_meta") return null
  const field = table.fields.find(
    (field) => field.name === "path" && field.settings?.isSystem === true
  )
  const path = field ? row[field.tableColumnName] : null
  const configuration = table.table.settings.vtabConfig
  let root =
    configuration &&
    typeof configuration === "object" &&
    !Array.isArray(configuration)
      ? (configuration as Record<string, unknown>).root
      : "."
  if (metadataPath === SPACE_FILE_METADATA_PATH && root === "..") root = "."
  if (typeof path !== "string" || typeof root !== "string" || !path) return null
  const portable = (value: string) =>
    !value.startsWith("/") &&
    !/[\\\u0000-\u001f]/u.test(value) &&
    !/^[a-z]:/iu.test(value) &&
    !value.split("/").includes("..")
  if (![path, root, metadataPath].every(portable)) return null
  const directory =
    metadataPath === SPACE_FILE_METADATA_PATH
      ? []
      : metadataPath.split("/").slice(0, -1)
  return (
    [...directory, ...root.split("/"), ...path.split("/")]
      .filter((part) => part && part !== ".")
      .join("/") || null
  )
}
