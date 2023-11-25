import React from "react"
import { IScript } from "@/worker/meta_table/script"

import { OpfsManager } from "@/lib/opfs"

export const useLocalScript = () => {
  const dirHandleRef = React.useRef<FileSystemDirectoryHandle>()
  const getScriptFromFileHandle = async (
    dirHandle: FileSystemDirectoryHandle
  ) => {
    // get eidos.json
    const eidosFileHandle = await dirHandle.getFileHandle("eidos.json")
    const eidosFile = await eidosFileHandle.getFile()
    const eidosData = await eidosFile.text()
    const eidosJson = JSON.parse(eidosData)
    // get main file
    const fsm = new OpfsManager(dirHandle)
    const mainFile = await fsm.getFileByPath(eidosJson.main)
    const mainData = await mainFile.text()
    const script = {
      ...eidosJson,
      code: mainData,
    }
    return script
  }
  const loadFromLocal = async (): Promise<IScript> => {
    const dirHandle: FileSystemDirectoryHandle = await (
      window as any
    ).showDirectoryPicker({
      mode: "read",
    })
    dirHandleRef.current = dirHandle
    return getScriptFromFileHandle(dirHandle)
  }

  const reload = async () => {
    if (!dirHandleRef.current) return
    return getScriptFromFileHandle(dirHandleRef.current)
  }

  return {
    loadFromLocal,
    reload,
  }
}
