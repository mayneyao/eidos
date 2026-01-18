/**
 * Eject Built-in Extensions
 *
 * Creates extension records from built-in extension source files.
 * Multi-file extensions create multiple records with prefix-based naming:
 * - ejected/journal              <- main entry (index.tsx)
 * - ejected/journal/use-journals <- dependency file
 * - ejected/journal/utils        <- dependency file
 */

import type { ExtensionMeta } from "@eidos.space/core/types/IExtension"

export interface EjectRecord {
  slug: string        // e.g., "ejected/journal" or "ejected/journal/utils"
  name: string
  description: string
  ts_code: string     // Source code for this file
  meta?: ExtensionMeta // Only the main entry has meta
  icon?: string       // Data URI of the extension icon
  type: "block" | "script"
  isMainEntry: boolean
}

export interface EjectResult {
  mainEntry: EjectRecord
  dependencies: EjectRecord[]
  all: EjectRecord[]
}

export interface BuiltInExtensionInfo {
  slug: string
  name: string
  type: "block" | "script"
  meta: ExtensionMeta
  icon?: string
}

/**
 * Map of built-in extension sources
 * slug -> { filename -> source code }
 */
const extensionSources: Record<string, Record<string, string>> = {}

/**
 * Map of built-in extension info (registered from builtin.ts to avoid circular dep)
 */
const extensionInfoMap: Record<string, BuiltInExtensionInfo> = {}

/**
 * Register extension source files
 */
export function registerExtensionSource(
  slug: string,
  files: Record<string, string>
) {
  extensionSources[slug] = files
}

/**
 * Register built-in extension info (called from builtin.ts)
 */
export function registerExtensionInfo(info: BuiltInExtensionInfo) {
  extensionInfoMap[info.slug] = info
}

/**
 * Get the source files for a built-in extension
 */
export function getExtensionSource(
  slug: string
): Record<string, string> | undefined {
  return extensionSources[slug]
}

/**
 * Convert filename to slug suffix
 * index.tsx -> "/index" (keep filename for correct relative import resolution)
 * use-journals.ts -> "/use-journals"
 * utils.ts -> "/utils"
 */
function filenameToSlugSuffix(filename: string): string {
  // Always keep path structure to ensure relative imports work:
  // ejected/journal/index -> import "./utils" -> ejected/journal/utils
  const name = filename.replace(/\.(tsx?|jsx?)$/, "")
  return `/${name}`
}

/**
 * Eject a built-in extension to user-space format
 *
 * Creates multiple extension records for multi-file extensions.
 * Uses prefix-based naming so local imports work:
 * - ./use-journals resolves to ejected/journal/use-journals
 *
 * @param slug - The built-in extension slug
 */
export function ejectBuiltInExtension(slug: string): EjectResult {
  const builtIn = extensionInfoMap[slug]
  if (!builtIn) {
    throw new Error(`Built-in extension not found: ${slug}`)
  }

  const files = extensionSources[slug]
  if (!files || Object.keys(files).length === 0) {
    throw new Error(
      `No source registered for extension: ${slug}. ` +
        `Make sure to call registerExtensionSource() during initialization.`
    )
  }

  const meta = builtIn.meta as any
  const description =
    meta.extNode?.description ||
    meta.tableView?.description ||
    meta.fileHandler?.description ||
    meta.sidebarBlock?.description ||
    ""

  const baseSlug = `ejected/${slug}`
  const records: EjectRecord[] = []
  let mainEntry: EjectRecord | null = null

  for (const [filename, source] of Object.entries(files)) {
    const suffix = filenameToSlugSuffix(filename)
    const isMain = filename === "index.tsx" || filename === "index.ts"

    const record: EjectRecord = {
      slug: baseSlug + suffix,
      name: isMain ? builtIn.name : filename.replace(/\.(tsx?|jsx?)$/, ""),
      description: isMain ? description : `Dependency file for ${builtIn.name}`,
      ts_code: source,
      meta: isMain ? builtIn.meta : undefined,
      icon: isMain ? builtIn.icon : undefined,
      type: filename.endsWith('.tsx') ? "block" : "script",
      isMainEntry: isMain,
    }

    records.push(record)
    if (isMain) {
      mainEntry = record
    }
  }

  if (!mainEntry) {
    // Fallback: use the first file if no index.tsx found (should not happen for built-ins)
    if (records.length > 0) {
       mainEntry = records[0]
       mainEntry.isMainEntry = true;
       // Also update the meta/description if we fell back
       mainEntry.name = builtIn.name;
       mainEntry.description = description;
       mainEntry.meta = builtIn.meta;
    } else {
       throw new Error(`No source files found for extension: ${slug}`)
    }
  }

  return {
    mainEntry,
    dependencies: records.filter((r) => !r.isMainEntry),
    all: records,
  }
}

/**
 * Check if an extension can be ejected
 */
export function canEjectExtension(slug: string): boolean {
  return !!extensionInfoMap[slug] && !!extensionSources[slug]
}

/**
 * Get list of ejectible extension slugs
 */
export function getEjectibleExtensionSlugs(): string[] {
  return Object.keys(extensionInfoMap).filter((slug) => !!extensionSources[slug])
}
