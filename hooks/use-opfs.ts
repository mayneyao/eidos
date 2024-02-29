import { opfsManager } from "@/lib/opfs"

export const useOPFS = (space: string) => {
  const uploadDir = async (
    dirHandle: FileSystemDirectoryHandle,
    _parentPath?: string[]
  ) => {
    let parentPath = _parentPath || ["spaces", space, "files"]
    // walk dirHandle upload to /extensions/<name>/
    await opfsManager.addDir(parentPath, dirHandle.name)
    parentPath = [...parentPath, dirHandle.name]
    for await (const [key, value] of dirHandle.entries()) {
      if (value.kind === "directory") {
        await uploadDir(value as FileSystemDirectoryHandle, parentPath)
      } else if (value.kind === "file") {
        const file = await (value as FileSystemFileHandle).getFile()
        await opfsManager.addFile(parentPath, file)
      }
    }
  }
  return {
    uploadDir,
  }
}
