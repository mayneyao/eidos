import { useCallback, useEffect, useMemo, useState } from "react"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

import { useRootDirStore } from "./store"
import { useSpaceDir } from "./use-space-dir"

export function useFileOp() {
  const { paths, rootDir, setPaths } = useRootDirStore()
  const [isCurrentSpaceDir, setIsCurrentSpaceDir] = useState(true)
  const spaceRootDir = useSpaceDir()
  const { space } = useCurrentPathInfo()

  useEffect(() => {
    rootDir && spaceRootDir?.isSameEntry(rootDir).then(setIsCurrentSpaceDir)
  }, [rootDir, spaceRootDir])

  const enterDir = useCallback(
    (dir: string) => {
      setPaths([...paths, dir])
    },
    [paths, setPaths]
  )

  const enterPathByIndex = useCallback(
    (index: number) => {
      setPaths(paths.slice(0, index + 1))
    },
    [paths, setPaths]
  )

  const backDir = useCallback(() => {
    setPaths(paths.slice(0, -1))
  }, [paths, setPaths])

  const getFileUrlPath = (name: string) => {
    if (isCurrentSpaceDir && rootDir?.name === "files") {
      if (paths.length) {
        return `/${space}/files/${paths.join("/")}/${name}`
      } else {
        return `/${space}/files/${name}`
      }
    }
    if (paths.length) {
      return `/@/${rootDir?.name}/${paths.join("/")}/${name}`
    }
    return `/@/${rootDir?.name}/${name}`
  }

  return { getFileUrlPath, enterDir, backDir, enterPathByIndex }
}

export function useFileManager(search?: string) {
  const { currentDir, setCurrentDir, rootDir, setPaths, paths, setSearch } =
    useRootDirStore()
  const [_entries, setEntries] = useState<FileSystemHandle[]>([])
  const [dirPathList, setDirPathList] = useState<FileSystemDirectoryHandle[]>(
    []
  )

  const updateEntries = async (dir: FileSystemDirectoryHandle | null) => {
    if (!dir) {
      setEntries([])
      return
    }
    try {
      await dir.requestPermission({ mode: "read" })
    } catch (error) {
      console.error("Error requesting permission:", error)
      // return
    }
    const entries = []
    for await (const entry of dir.values()) {
      entries.push(entry)
    }
    console.log('entries', entries)
    setEntries(entries)
  }

  useEffect(() => {
    updateEntries(currentDir)
  }, [currentDir])

  useEffect(() => {
    updateEntries(rootDir)
    setPaths([])
  }, [rootDir, setPaths])
  useEffect(() => {
    setSearch("")
  }, [paths, setSearch])

  const entries = useMemo(() => {
    const res = _entries.filter((entry) => {
      if (!search) {
        return true
      }
      return entry.name.includes(search)
    })
    // split files and directories
    const files = res.filter((entry) => entry.kind === "file")
    const dirs = res.filter((entry) => entry.kind === "directory")
    return [...dirs, ...files]
  }, [_entries, search])

  const navigateToDir = async (dirName: string) => {
    try {
      if (!currentDir) {
        console.error("Current directory is not set")
        return
      }
      const newDirHandle = await currentDir.getDirectoryHandle(dirName, {
        create: false,
      })
      setCurrentDir(newDirHandle)
      setDirPathList((prev) => [...prev, newDirHandle])
    } catch (error) {
      console.error("Error navigating to directory:", error)
    }
  }
  return { currentDir, navigateToDir, entries, dirPathList }
}
