import { useEffect, useState } from "react"

import { efsManager } from "@/lib/storage/eidos-file-system"

export const useAllBlocks = () => {
  const [blocks, setBlocks] = useState<string[]>([])
  useEffect(() => {
    efsManager.listDir(["extensions", "blocks"]).then((blockDirs) => {
      setBlocks(blockDirs.map((dir) => dir.name))
    })
  }, [])

  return blocks
}
