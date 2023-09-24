import { useCallback, useEffect } from "react"
import { create } from "zustand"

import { opfsManager } from "@/lib/opfs"

interface ExtensionType {
  name: string
  version: string
  description: string
}

interface ExtensionsState {
  extensions: ExtensionType[]
  setExtensions: (extensions: ExtensionType[]) => void
}

export const useExtensionStore = create<ExtensionsState>()((set) => ({
  extensions: [],
  setExtensions: (extensions) => set({ extensions }),
}))

// get ext info from package.json file
export const getExtInfo = async (file: File): Promise<ExtensionType> => {
  const packageJsonText = await file.text()
  const packageJsonObj = JSON.parse(packageJsonText)
  const { name, version, description } = packageJsonObj
  return { name, version, description }
}

export const useExtensions = () => {
  const { extensions, setExtensions } = useExtensionStore()

  const getExtensionIndex = async (name: string) => {
    const file = await opfsManager.getFile(["extensions", name, "index.html"])
    const text = await file.text()
    return text
  }

  const getAllExtensions = useCallback(async () => {
    const extensionDirs = await opfsManager.listDir(["extensions"])
    const allExtensions = await Promise.all(
      extensionDirs.map(async (dir) => {
        const packageJson = await opfsManager.getFile([
          "extensions",
          dir.name,
          "package.json",
        ])
        const extInfo = await getExtInfo(packageJson)
        return extInfo
      })
    )
    setExtensions(allExtensions)
  }, [setExtensions])

  useEffect(() => {
    getAllExtensions()
  }, [extensions, getAllExtensions, setExtensions])

  const uploadExtension = async (
    dirHandle: FileSystemDirectoryHandle,
    _parentPath?: string[]
  ) => {
    let parentPath = _parentPath || ["extensions"]
    if (!_parentPath) {
      const packageJsonHandle = await dirHandle.getFileHandle("package.json")
      const packageJsonFile = await packageJsonHandle.getFile()
      const extensionInfo = await getExtInfo(packageJsonFile)
      await opfsManager.addDir(parentPath, extensionInfo.name)
      parentPath = [...parentPath, extensionInfo.name]
    }
    // walk dirHandle upload to /extensions/<name>/
    for await (const [key, value] of (dirHandle as any).entries()) {
      if (value.kind === "directory") {
        await opfsManager.addDir(parentPath, key)
        await uploadExtension(value, [...parentPath, key])
      } else if (value.kind === "file") {
        const file = await value.getFile()
        await opfsManager.addFile(parentPath, file)
      }
    }
  }

  const removeExtension = async (name: string) => {
    await opfsManager.deleteEntry(["extensions", name], true)
    getAllExtensions()
  }
  return {
    extensions,
    removeExtension,
    uploadExtension,
    getAllExtensions,
    getExtensionIndex,
  }
}
