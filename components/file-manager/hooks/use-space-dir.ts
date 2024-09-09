import { useEffect, useState } from "react"

import { getDirHandle } from "@/lib/storage/eidos-file-system"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useEidosFileSystemManager } from "@/hooks/use-fs"

export const useSpaceDir = () => {
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null)
  const { space } = useCurrentPathInfo()
  const { efsManager } = useEidosFileSystemManager()

  useEffect(() => {
    getDirHandle(["spaces", space, "files"], efsManager.rootDirHandle).then((dir) => {
      console.log('dir', dir)
      setDir(dir)
    })
  }, [space])

  return dir
}
