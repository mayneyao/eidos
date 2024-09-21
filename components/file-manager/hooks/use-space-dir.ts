import { useEffect, useState } from "react"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useEidosFileSystemManager } from "@/hooks/use-fs"

export const useSpaceDir = () => {
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null)
  const { space } = useCurrentPathInfo()
  const { efsManager } = useEidosFileSystemManager()

  useEffect(() => {
    efsManager.getDirHandle(["spaces", space, "files"]).then((dir) => {
      console.log('dir', dir)
      setDir(dir)
    })
  }, [space])

  return dir
}
