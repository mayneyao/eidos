export interface ExplorerIgnoreOptions {
  respectGitignore: boolean
}
export const EXPLORER_IGNORE_OPTIONS_STORAGE_KEY =
  "eidos-lite:explorer-ignore-options"
export function readExplorerIgnoreOptions(
  storage: Pick<Storage, "getItem">
): ExplorerIgnoreOptions {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(EXPLORER_IGNORE_OPTIONS_STORAGE_KEY) ?? "null"
    )
    if (
      value &&
      typeof value === "object" &&
      "respectGitignore" in value &&
      typeof value.respectGitignore === "boolean"
    )
      return { respectGitignore: value.respectGitignore }
  } catch {
    // The default stays available when preferences are absent or unavailable.
  }
  return { respectGitignore: true }
}
