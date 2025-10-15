import { useEffect, useState } from "react"

import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useEidosFileSystemManager } from "@/apps/web-app/hooks/use-fs"

export const useSpaceDir = () => {
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null)
  const { space } = useCurrentPathInfo()
  const { efsManager } = useEidosFileSystemManager()

  useEffect(() => {
    efsManager.getDirHandle(["files"]).then((dir) => {
      console.log('dir', dir)
      setDir(dir)
    })
  }, [space])

  return dir
}
