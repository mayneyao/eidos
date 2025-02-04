import { useEffect, useState } from "react"

import { useEidosFileSystemManager } from "@/hooks/use-fs"

export const useAllBlocks = () => {
  const [blocks, setBlocks] = useState<string[]>([])
  const { efsManager } = useEidosFileSystemManager()
  useEffect(() => {
    efsManager.listDir(["extensions", "blocks"]).then((blockDirs) => {
      setBlocks(
        blockDirs
          .filter((dir) => !dir.name.startsWith("."))
          .map((dir) => dir.name)
      )
    })
  }, [])

  return blocks
}
