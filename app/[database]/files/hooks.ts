import { useCallback, useEffect, useState } from "react"
import { create } from "zustand"

import { opfsManager } from "@/lib/opfs"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

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

export const useFileSystem = () => {
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
      for (const { name, isDir } of names) {
        await opfsManager.deleteEntry(
          ["spaces", space, "files", ...currentPath, name],
          isDir
        )
      }
      await refresh()
    },
    [currentPath, refresh, space]
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
    deleteFiles,
    addSelectedEntry,
    removeSelectedEntry,
    selectedEntries,
    setSelectedEntries,
    prevSelectedEntries,
    setPrevSelectedEntries,
  }
}
