import { flushPendingFileWrites } from "./pending-writes"

export interface FileSpaceNavigationOptions {
  replace?: boolean
  target?: "_blank" | "_self"
  state?: unknown
}

export type FileSpaceNavigate = (
  to: string,
  options?: FileSpaceNavigationOptions
) => void

export async function flushCurrentSpaceFile(
  spaceId: string | undefined,
  filePath: string | null | undefined
): Promise<boolean> {
  if (!spaceId || !filePath) return true
  return flushPendingFileWrites({ spaceId, path: filePath })
}

export async function navigateAfterFlushingSpaceFile({
  spaceId,
  currentFilePath,
  destination,
  navigate,
  options,
}: {
  spaceId: string | undefined
  currentFilePath: string | null | undefined
  destination: string
  navigate: FileSpaceNavigate
  options?: FileSpaceNavigationOptions
}): Promise<boolean> {
  if (!(await flushCurrentSpaceFile(spaceId, currentFilePath))) return false
  navigate(destination, options)
  return true
}
