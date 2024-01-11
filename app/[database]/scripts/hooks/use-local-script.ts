import { IScript } from "@/worker/web-worker/meta_table/script"
import { create } from "zustand"

import { OpfsManager } from "@/lib/opfs"

type DirHandleState = {
  scriptId: string
  setScriptId: (scriptId: string) => void
  dirHandle: FileSystemDirectoryHandle | null
  setDirHandle: (dirHandle: FileSystemDirectoryHandle | null) => void
}

export const useDirHandleStore = create<DirHandleState>((set) => ({
  dirHandle: null,
  scriptId: "",
  setScriptId: (scriptId) => set({ scriptId }),
  setDirHandle: (dirHandle) => set({ dirHandle }),
}))

export const useLocalScript = () => {
  const { dirHandle: dirHandleRef, setDirHandle } = useDirHandleStore()
  const getScriptFromFileHandle = async (
    dirHandle: FileSystemDirectoryHandle
  ) => {
    // get eidos.json
    const eidosFileHandle = await dirHandle.getFileHandle("eidos.json")
    const eidosFile = await eidosFileHandle.getFile()
    const eidosData = await eidosFile.text()
    const eidosJson = JSON.parse(eidosData)
    // get main file
    const { main, features, ...eidosMeta } = eidosJson
    const fsm = new OpfsManager(dirHandle)
    const mainFile = await fsm.getFileByPath(main)
    const mainData = await mainFile.text()
    const script = {
      ...eidosMeta,
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
    setDirHandle(dirHandle)
    return getScriptFromFileHandle(dirHandle)
  }

  const reload = async () => {
    if (!dirHandleRef) return
    return getScriptFromFileHandle(dirHandleRef)
  }

  return {
    loadFromLocal,
    reload,
  }
}
