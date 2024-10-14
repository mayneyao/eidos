import { IFile } from "@/worker/web-worker/meta-table/file"
import { useCallback, useEffect, useMemo, useState } from "react"
import { create } from "zustand"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { getUuid } from "@/lib/utils"

import { useEidosFileSystemManager } from "./use-fs"
import { useSqlite } from "./use-sqlite"

const useFsStore = create<{
  currentPath: string[]
  setCurrentPath: (currentPath: string[]) => void
  entries: FileSystemFileHandle[]
  setEntries: (entries: FileSystemFileHandle[]) => void
  selectedEntries: Map<string, boolean>
  addSelectedEntry: (name: string, isDir: boolean) => void
  removeSelectedEntry: (name: string) => void
  setSelectedEntries: (selectedEntries: Map<string, boolean>) => void
  prevSelectedEntries: Map<string, boolean>
  setPrevSelectedEntries: (prevSelectedEntries: Map<string, boolean>) => void
}>((set) => ({
  currentPath: [],
  setCurrentPath: (currentPath) => set({ currentPath }),
  entries: [],
  setEntries: (entries) => set({ entries }),
  selectedEntries: new Map(),
  addSelectedEntry: (name, isDir) =>
    set((state) => {
      state.selectedEntries.set(name, isDir)
      return { selectedEntries: state.selectedEntries }
    }),
  removeSelectedEntry: (name) =>
    set((state) => {
      state.selectedEntries.delete(name)
      return { selectedEntries: state.selectedEntries }
    }),
  setSelectedEntries: (selectedEntries) => set({ selectedEntries }),
  prevSelectedEntries: new Map(),
  setPrevSelectedEntries: (prevSelectedEntries) => set({ prevSelectedEntries }),
}))

/**
 * every upload file will be record meta data in `eidos__files` table, but we can't pass file via postMessage,
 * so we expose this hook to handle file upload\delete\update
 * every mutation about file must be done via this hook.
 */
export const useFileSystem = (rootDir?: FileSystemDirectoryHandle) => {
  const { space } = useCurrentPathInfo()
  const {
    entries,
    setEntries,
    currentPath,
    setCurrentPath,
    addSelectedEntry,
    removeSelectedEntry,
    selectedEntries,
    prevSelectedEntries,
    setPrevSelectedEntries,
    setSelectedEntries,
  } = useFsStore()
  const { efsManager } = useEidosFileSystemManager()

  const defaultPaths = useMemo(() => {
    if (rootDir) {
      return []
    }
    return ["spaces", space, "files"]
  }, [rootDir, space])

  const { sqlite } = useSqlite()

  const isRootDir = currentPath.length === 0
  const goRootDir = useCallback(() => {
    setCurrentPath([])
  }, [setCurrentPath])
  const enterDir = useCallback(
    (dir: string) => {
      setCurrentPath([...currentPath, dir])
    },
    [currentPath, setCurrentPath]
  )

  const enterPathByIndex = useCallback(
    (index: number) => {
      setCurrentPath(currentPath.slice(0, index + 1))
    },
    [currentPath, setCurrentPath]
  )

  const backDir = useCallback(() => {
    setCurrentPath(currentPath.slice(0, -1))
  }, [currentPath, setCurrentPath])

  const refresh = useCallback(async () => {
    const entries = await efsManager.listDir([...defaultPaths, ...currentPath])
    setEntries(entries)
  }, [efsManager, defaultPaths, currentPath, setEntries])

  useEffect(() => {
    refresh()
  }, [refresh, currentPath])

  const addFiles = useCallback(
    async (files: File[], useUuId: boolean = true) => {
      if (!sqlite) {
        throw new Error("add file failed, no sqlite instance")
      }
      const res: IFile[] = []
      for (const file of files) {
        const fileId = getUuid()
        const paths = await efsManager.addFile(
          [...defaultPaths, ...currentPath],
          file,
          useUuId ? fileId : undefined
        )
        console.log("paths", { paths, defaultPaths, currentPath })
        if (!paths) {
          throw new Error("add file failed")
        }
        const { name, size, type: mime } = file
        const path = paths.join("/")
        const fileInfo: IFile = {
          id: fileId,
          name,
          size,
          mime,
          path,
        }
        // TODO: handle duplicate file
        await sqlite?.addFile(fileInfo)
        res.push(fileInfo)
      }
      await refresh()
      return res
    },
    [currentPath, defaultPaths, efsManager, refresh, sqlite]
  )

  const addDir = useCallback(
    async (name: string) => {
      await efsManager.addDir([...defaultPaths, ...currentPath], name)
      await refresh()
    },
    [currentPath, defaultPaths, efsManager, refresh]
  )

  const uploadDir = async (
    dirHandle: FileSystemDirectoryHandle,
    _parentPath?: string[]
  ) => {
    await sqlite?.uploadDir(dirHandle, _parentPath)
  }
  const getFileUrlPath = useCallback(
    (name: string) => {
      if (isRootDir) {
        return `/${space}/files/${name}`
      } else {
        return `/${space}/files/${currentPath.join("/")}/${name}`
      }
    },
    [currentPath, isRootDir, space]
  )

  const deleteFiles = useCallback(
    async (
      names: {
        name: string
        isDir: boolean
      }[]
    ) => {
      if (!sqlite) {
        throw new Error("delete file failed, no sqlite instance")
      }
      for (const { name, isDir } of names) {
        const paths = [...defaultPaths, ...currentPath, name]
        await efsManager.deleteEntry(paths, isDir)
        const path = paths.join("/")
        if (isDir) {
          await sqlite?.deleteFileByPathPrefix(path)
        } else {
          await sqlite?.delFileByPath(path)
        }
      }
      await refresh()
    },
    [currentPath, defaultPaths, efsManager, refresh, sqlite]
  )

  return {
    isRootDir,
    entries,
    refresh,
    addFiles,
    addDir,
    uploadDir,
    enterDir,
    backDir,
    currentPath,
    enterPathByIndex,
    goRootDir,
    getFileUrlPath,
    deleteFiles,
    addSelectedEntry,
    removeSelectedEntry,
    selectedEntries,
    setSelectedEntries,
    prevSelectedEntries,
    setPrevSelectedEntries,
  }
}

export const useFiles = () => {
  const { sqlite } = useSqlite()
  const [files, setFiles] = useState<IFile[]>([])
  useEffect(() => {
    const fetchFiles = async () => {
      const files = await sqlite?.file.list()
      setFiles(files?.reverse() ?? [])
    }
    fetchFiles()
  }, [sqlite])
  return { files }
}
