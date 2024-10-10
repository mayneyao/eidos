import JSZip from "jszip"

import { getDirHandle } from "./eidos-file-system"
import { importZipFileIntoDir, zipDirectory } from "./zip-file"


/**
 * when expose spaceFileSystem  from electron preload,
 * the method only works when it's a arrow function, i don't know why, so we need to use class to wrap it 
 */
export class SpaceFileSystem {
  rootDirHandle?: FileSystemDirectoryHandle
  constructor(rootDirHandle?: FileSystemDirectoryHandle) {
    this.rootDirHandle = rootDirHandle
  }

  remove = async (space: string) => {
    const dir = ["spaces"]
    const dirHandle = await getDirHandle(dir, this.rootDirHandle)
    await dirHandle.removeEntry(space, { recursive: true })
  }

  /**
   * import space from .zip file
   * @param space
   * @param file
   */
  import = async (space: string, file: File) => {
    const zip = await JSZip.loadAsync(file)
    console.log("import space", file)
    await importZipFileIntoDir(["spaces", space], zip)
  }

  create = async (space: string) => {
    const dir = ["spaces", space]
    const dirHandle = await getDirHandle(dir, this.rootDirHandle)
    return dirHandle
  }

  export = async (space: string) => {
    const dir = ["spaces", space]
    const zip = new JSZip()

    const exportZip = await zipDirectory(dir, zip)
    const blob = await exportZip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `eidos-export-${space}.zip`
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  /**
   *
   * @returns list of spaces
   */
  list = async () => {
    const spacesDirHandle = await getDirHandle(["spaces"], this.rootDirHandle)
    const spaces = []
    for await (let name of spacesDirHandle.keys()) {
      if (!name.startsWith(".")) {
        spaces.push(name)
      }
    }
    return spaces
  }
}