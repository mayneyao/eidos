import { useEffect, useState } from "react"

import { getDirHandle } from "@/lib/storage/eidos-file-system"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

export const useSpaceDir = () => {
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null)
  const { space } = useCurrentPathInfo()

  useEffect(() => {
    getDirHandle(["spaces", space, "files"]).then((dir) => {
      setDir(dir)
    })
  }, [space])

  return dir
}
