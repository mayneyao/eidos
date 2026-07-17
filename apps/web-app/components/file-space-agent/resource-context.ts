import {
  eidosFileRecordFromSpaceUrl,
  filePathFromSpaceUrl,
  headingFromSpaceUrl,
} from "@/apps/web-app/components/file-space/file-path"

export interface FileSpaceAgentLaunchContext {
  sourceUrl: string
  path: string
  heading?: string
  tableId?: string
  rowId?: string
  selection?: string
}

let currentMarkdownSelection: { path: string; text: string } | null = null

export function rememberMarkdownSelection(path: string, text: string): void {
  const normalized = text.trim()
  currentMarkdownSelection = normalized ? { path, text: normalized } : null
}

export function clearMarkdownSelection(path: string): void {
  if (currentMarkdownSelection?.path === path) currentMarkdownSelection = null
}

export function resourceContextFromTabUrl(
  sourceUrl: string
): FileSpaceAgentLaunchContext | null {
  const filePath = filePathFromSpaceUrl(sourceUrl)
  if (!filePath) return null
  const baseRecord = eidosFileRecordFromSpaceUrl(sourceUrl)
  return {
    sourceUrl,
    path: filePath,
    heading: headingFromSpaceUrl(sourceUrl) ?? undefined,
    tableId: baseRecord?.tableId,
    rowId: baseRecord?.recordId,
    selection:
      currentMarkdownSelection?.path === filePath
        ? currentMarkdownSelection.text
        : undefined,
  }
}
