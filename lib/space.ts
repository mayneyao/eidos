import JSZip from "jszip"

import { getDirHandle } from "@/lib/opfs"

import { importZipFileIntoDir, zipDirectory } from "./opfs/zip-file"

export async function removeSpace(space: string) {
  const dir = ["spaces"]
  const dirHandle = await getDirHandle(dir)
  await dirHandle.removeEntry(space, { recursive: true })
}

/**
 * use JSZip to export a space which is a directory in opfs
 * @param space
 */
export async function exportSpace(space: string) {
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
 * import space from .zip file
 * @param space
 * @param file
 */
export const importSpace = async (space: string, file: File) => {
  const zip = await JSZip.loadAsync(file)
  console.log("import space", file)
  await importZipFileIntoDir(["spaces", space], zip)
}
