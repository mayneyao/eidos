import { useCallback, useEffect } from "react"
import { create } from "zustand"

import { toast } from "@/components/ui/use-toast"
import { useEidosFileSystemManager } from "@/hooks/use-fs"
import {
  getPackageJsonFromZipFile,
  unZipFileToDir,
} from "@/lib/storage/zip-file"
import { nonNullable } from "@/lib/utils"

interface ExtensionType {
  id: string
  name: string
  version: string
  description: string
  displayMode: "full" | "side"
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
export const getExtInfo = async (file: File): Promise<ExtensionType | null> => {
  const packageJsonText = await file.text()
  try {
    const packageJsonObj = JSON.parse(packageJsonText)
    const { id, name, version, description, displayMode } =
      packageJsonObj.eidos || packageJsonObj
    return { id: id || name, name, version, description, displayMode }
  } catch (error) {
    return null
  }
}

export const useExtensions = () => {
  const { extensions, setExtensions } = useExtensionStore()

  const { efsManager } = useEidosFileSystemManager()
  const getExtensionIndex = async (name: string) => {
    const text = await efsManager.getDocContent([
      "extensions",
      "apps",
      name,
      "index.html",
    ])
    return text
  }

  const getAllExtensions = useCallback(async () => {
    const extensionDirs = await efsManager.listDir(["extensions", "apps"])
    const allExtensions = await Promise.all(
      extensionDirs
        .filter((dir) => !dir.name.startsWith("."))
        .map(async (dir) => {
          const packageJson = await efsManager.getFile([
            "extensions",
            "apps",
            dir.name,
            "package.json",
          ])
          const extInfo = await getExtInfo(packageJson)
          return extInfo
        })
        .filter(nonNullable)
    )
    setExtensions(allExtensions as ExtensionType[])
  }, [setExtensions])

  useEffect(() => {
    getAllExtensions()
  }, [getAllExtensions])

  const loadExtensionFromZipFileHandler = async (
    fileHandler: FileSystemFileHandle
  ) => {
    const file = await fileHandler.getFile()
    return loadExtensionFromZipFile(file)
  }

  const loadExtensionFromZipFile = async (file: File) => {
    const packageJson = await getPackageJsonFromZipFile(file)
    if (!packageJson) {
      toast({
        title: "Invalid extension package.json",
      })
      return
    }
    await unZipFileToDir(file, ["extensions", "apps", packageJson.name])
    return packageJson.name
  }

  const uploadExtension = async (
    dirHandle: FileSystemDirectoryHandle,
    _parentPath?: string[]
  ) => {
    let parentPath = _parentPath || ["extensions", "apps"]
    if (!_parentPath) {
      const packageJsonHandle = await dirHandle.getFileHandle("package.json")
      const packageJsonFile = await packageJsonHandle.getFile()
      const extensionInfo = await getExtInfo(packageJsonFile)
      if (!extensionInfo) {
        toast({
          title: "Invalid extension package.json",
        })
        return
      }
      await efsManager.addDir(parentPath, extensionInfo.id)
      parentPath = [...parentPath, extensionInfo.id]
    }
    // walk dirHandle upload to /extensions/<name>/
    for await (const [key, value] of dirHandle.entries()) {
      if (value.kind === "directory") {
        await efsManager.addDir(parentPath, key)
        await uploadExtension(value as FileSystemDirectoryHandle, [
          ...parentPath,
          key,
        ])
      } else if (value.kind === "file") {
        const file = await (value as FileSystemFileHandle).getFile()
        await efsManager.addFile(parentPath, file)
      }
    }
  }

  const removeExtension = async (name: string) => {
    await efsManager.deleteEntry(["extensions", "apps", name], true)
    getAllExtensions()
  }
  return {
    extensions,
    removeExtension,
    uploadExtension,
    getAllExtensions,
    loadExtensionFromZipFileHandler,
    loadExtensionFromZipFile,
    getExtensionIndex,
  }
}
