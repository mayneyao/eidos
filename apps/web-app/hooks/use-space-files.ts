import { useCallback, useEffect } from "react"
import type {
  FileSpaceBacklink,
  FileSpaceIndexStatus,
  FileSpaceLinkResolution,
  FileSpaceMarkdownMetadata,
  FileSpaceSearchOptions,
  FileSpaceSearchResult,
  FileSpaceTag,
  ListSpaceFilesOptions,
  SpaceBinaryFile,
  SpaceFileChange,
  SpaceFileEntry,
  SpaceFilePreview,
  SpaceTextFile,
} from "@eidos.space/file-space"

export interface SpaceFileChangeEvent extends SpaceFileChange {
  spaceId: string
}

function requireDesktopSpaceApi() {
  if (typeof window === "undefined" || !window.eidos?.spaceMgmt) {
    throw new Error("File Spaces are available in the desktop app")
  }
  return window.eidos.spaceMgmt
}

export function useSpaceFiles(spaceId: string | undefined) {
  const requireSpaceId = useCallback(() => {
    if (!spaceId) throw new Error("No active Space")
    return spaceId
  }, [spaceId])

  const list = useCallback(
    (
      relativeDirectory = "",
      options: ListSpaceFilesOptions = {}
    ): Promise<SpaceFileEntry[]> =>
      requireDesktopSpaceApi().listFiles(
        requireSpaceId(),
        relativeDirectory,
        options
      ),
    [requireSpaceId]
  )

  const readText = useCallback(
    (relativePath: string): Promise<SpaceTextFile> =>
      requireDesktopSpaceApi().readFile(requireSpaceId(), relativePath),
    [requireSpaceId]
  )

  const readBinary = useCallback(
    (relativePath: string): Promise<SpaceBinaryFile> =>
      requireDesktopSpaceApi().readBinaryFile(requireSpaceId(), relativePath),
    [requireSpaceId]
  )

  const readPreview = useCallback(
    (relativePath: string): Promise<SpaceFilePreview> =>
      requireDesktopSpaceApi().readFilePreview(requireSpaceId(), relativePath),
    [requireSpaceId]
  )

  const writeText = useCallback(
    (
      relativePath: string,
      content: string,
      expectedMtimeMs?: number
    ): Promise<SpaceTextFile> =>
      requireDesktopSpaceApi().writeFile(
        requireSpaceId(),
        relativePath,
        content,
        expectedMtimeMs
      ),
    [requireSpaceId]
  )

  const createText = useCallback(
    (relativePath: string, content = ""): Promise<SpaceTextFile> =>
      requireDesktopSpaceApi().createFile(
        requireSpaceId(),
        relativePath,
        content
      ),
    [requireSpaceId]
  )

  const createBinary = useCallback(
    (relativePath: string, content: Uint8Array): Promise<SpaceBinaryFile> =>
      requireDesktopSpaceApi().createBinaryFile(
        requireSpaceId(),
        relativePath,
        content
      ),
    [requireSpaceId]
  )

  const createDirectory = useCallback(
    (relativePath: string): Promise<SpaceFileEntry> =>
      requireDesktopSpaceApi().createDirectory(requireSpaceId(), relativePath),
    [requireSpaceId]
  )

  const move = useCallback(
    (sourcePath: string, destinationPath: string): Promise<{ success: true }> =>
      requireDesktopSpaceApi().moveFile(
        requireSpaceId(),
        sourcePath,
        destinationPath
      ),
    [requireSpaceId]
  )

  const remove = useCallback(
    (relativePath: string): Promise<{ success: true }> =>
      requireDesktopSpaceApi().removeFile(requireSpaceId(), relativePath),
    [requireSpaceId]
  )

  const search = useCallback(
    (
      query: string,
      options: FileSpaceSearchOptions = {}
    ): Promise<FileSpaceSearchResult[]> =>
      requireDesktopSpaceApi().searchFiles(requireSpaceId(), query, options),
    [requireSpaceId]
  )

  const resolveLink = useCallback(
    (
      currentFilePath: string,
      target: string
    ): Promise<FileSpaceLinkResolution> =>
      requireDesktopSpaceApi().resolveFileLink(
        requireSpaceId(),
        currentFilePath,
        target
      ),
    [requireSpaceId]
  )

  const getIndexStatus = useCallback(
    (): Promise<FileSpaceIndexStatus> =>
      requireDesktopSpaceApi().getFileIndexStatus(requireSpaceId()),
    [requireSpaceId]
  )

  const rebuildIndex = useCallback(
    (): Promise<FileSpaceIndexStatus> =>
      requireDesktopSpaceApi().rebuildFileIndex(requireSpaceId()),
    [requireSpaceId]
  )

  const reveal = useCallback(
    (relativePath = ""): Promise<{ success: true }> =>
      requireDesktopSpaceApi().revealFile(requireSpaceId(), relativePath),
    [requireSpaceId]
  )

  const getBacklinks = useCallback(
    (relativePath: string): Promise<FileSpaceBacklink[]> =>
      requireDesktopSpaceApi().getFileBacklinks(requireSpaceId(), relativePath),
    [requireSpaceId]
  )

  const getDocumentMetadata = useCallback(
    (relativePath: string): Promise<FileSpaceMarkdownMetadata | null> =>
      requireDesktopSpaceApi().getFileDocumentMetadata(
        requireSpaceId(),
        relativePath
      ),
    [requireSpaceId]
  )

  const listTags = useCallback(
    (): Promise<FileSpaceTag[]> =>
      requireDesktopSpaceApi().listFileTags(requireSpaceId()),
    [requireSpaceId]
  )

  const importFiles = useCallback(
    (
      destinationDirectory = ""
    ): Promise<{
      canceled: boolean
      imported: SpaceFileEntry[]
      errors: Array<{ sourcePath: string; message: string }>
    }> =>
      requireDesktopSpaceApi().importFiles(
        requireSpaceId(),
        destinationDirectory
      ),
    [requireSpaceId]
  )

  return {
    list,
    readText,
    readBinary,
    readPreview,
    writeText,
    createText,
    createBinary,
    createDirectory,
    move,
    remove,
    search,
    resolveLink,
    getIndexStatus,
    rebuildIndex,
    reveal,
    getBacklinks,
    getDocumentMetadata,
    listTags,
    importFiles,
  }
}

export function useSpaceFileChanges(
  spaceId: string | undefined,
  onChange: (event: SpaceFileChangeEvent) => void
) {
  useEffect(() => {
    if (!spaceId || typeof window === "undefined" || !window.eidos) return

    const listenerId = window.eidos.on(
      "space-files:changed",
      (_event: unknown, payload: SpaceFileChangeEvent) => {
        if (payload?.spaceId === spaceId) onChange(payload)
      }
    )
    return () => {
      if (listenerId) window.eidos?.off("space-files:changed", listenerId)
    }
  }, [onChange, spaceId])
}
