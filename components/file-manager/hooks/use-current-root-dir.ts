import { useEffect } from "react"

import { useRootDirStore } from "./store"
import { useSpaceDir } from "./use-space-dir"

export const useCurrentRootDir = () => {
  const { setRootDir, rootDir, search, setSearch } = useRootDirStore()
  const spaceRootDir = useSpaceDir()

  useEffect(() => {
    setRootDir(spaceRootDir ?? null)
  }, [setRootDir, spaceRootDir])

  return {
    rootDir,
    setRootDir,
    search,
    setSearch,
  }
}
