import JSZip from "jszip"

import { getDirHandle } from "./eidos-file-system"
import { importZipFileIntoDir, zipDirectory } from "./zip-file"

export class SpaceFileSystem {
  async remove(space: string) {
    const dir = ["spaces"]
    const dirHandle = await getDirHandle(dir)
    await dirHandle.removeEntry(space, { recursive: true })
  }

  /**
   * import space from .zip file
   * @param space
   * @param file
   */
  async import(space: string, file: File) {
    const zip = await JSZip.loadAsync(file)
    console.log("import space", file)
    await importZipFileIntoDir(["spaces", space], zip)
  }

  async create(space: string) {
    const dir = ["spaces", space]
    const dirHandle = await getDirHandle(dir)
    return dirHandle
  }

  async export(space: string) {
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
  async list() {
    const spacesDirHandle = await getDirHandle(["spaces"])
    const spaces = []
    for await (let name of spacesDirHandle.keys()) {
      if (!name.startsWith(".")) {
        spaces.push(name)
      }
    }
    return spaces
  }
}

export const spaceFileSystem = new SpaceFileSystem()
