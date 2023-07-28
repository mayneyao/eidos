import { useCallback, useEffect, useState } from "react"
import { create } from "zustand"

import { opfsManager } from "@/lib/opfs"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

const useFsStore = create<{
  currentPath: string[]
  setCurrentPath: (currentPath: string[]) => void
  entries: FileSystemFileHandle[]
  setEntries: (entries: FileSystemFileHandle[]) => void
}>((set) => ({
  currentPath: [],
  setCurrentPath: (currentPath) => set({ currentPath }),
  entries: [],
  setEntries: (entries) => set({ entries }),
}))

export const useFileSystem = () => {
  const { space } = useCurrentPathInfo()
  const { entries, setEntries, currentPath, setCurrentPath } = useFsStore()

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
    const entries = await opfsManager.listDir([
      "spaces",
      space,
      "files",
      ...currentPath,
    ])
    setEntries(entries)
  }, [space, currentPath, setEntries])

  useEffect(() => {
    refresh()
  }, [refresh, currentPath])

  const addFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        await opfsManager.addFile(
          ["spaces", space, "files", ...currentPath],
          file
        )
      }
      await refresh()
    },
    [currentPath, refresh, space]
  )

  const addDir = useCallback(
    async (name: string) => {
      await opfsManager.addDir(["spaces", space, "files", ...currentPath], name)
      await refresh()
    },
    [currentPath, refresh, space]
  )

  const getFileUrlPath = useCallback(
    (name: string) => {
      if (isRootDir) {
        return `/files/${name}`
      } else {
        return `/files/${currentPath.join("/")}/${name}`
      }
    },
    [currentPath, isRootDir]
  )
  return {
    isRootDir,
    entries,
    addFiles,
    addDir,
    enterDir,
    backDir,
    currentPath,
    enterPathByIndex,
    goRootDir,
    getFileUrlPath,
  }
}
