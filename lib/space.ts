import JSZip from "jszip"

import { getDirHandle } from "@/lib/opfs"

/**
 * use JSZip to export a space which is a directory in opfs
 * @param space
 */
export async function exportSpace(space: string) {
  const dir = ["spaces", space]
  const zip = new JSZip()
  const dirHandle = await getDirHandle(dir)
  for await (let entry of (dirHandle as any).values()) {
    if (entry.kind === "file") {
      const file = await entry.getFile()
      if (entry.name.endsWith(".sqlite3")) {
        const content = await file.arrayBuffer()
        zip.file(entry.name, content, { binary: true })
        continue
      } else {
        const content = await file.text()
        zip.file(entry.name, content)
      }
    }
    if (entry.kind === "directory") {
      const dir = zip.folder(entry.name)!
      for await (let _entry of entry.values()) {
        if (_entry.kind === "file") {
          const file = await _entry.getFile()
          const content = await file.text()
          dir.file(_entry.name, content)
        }
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" })
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
  const dirHandle = await getDirHandle(["spaces", space])
  const dirMap: {
    [name: string]: FileSystemDirectoryHandle
  } = {}
  for (let path in zip.files) {
    const file = zip.files[path]
    if (file.dir) {
      // "everyday/" => "everyday"
      const _path = path.slice(0, -1)
      const dir = await dirHandle.getDirectoryHandle(_path, { create: true })
      dirMap[_path] = dir
    } else {
      const paths = path.split("/")
      if (paths.length === 2) {
        const content = await file.async("text")
        const [dirName, fileName] = paths
        const _dirHandle = dirMap[dirName]
        const fileHandle = await _dirHandle.getFileHandle(fileName, {
          create: true,
        })
        const writable = await (fileHandle as any).createWritable()
        await writable.write(content)
        await writable.close()
      } else if (paths.length === 1) {
        const [fileName] = paths
        const fileHandle = await dirHandle.getFileHandle(fileName, {
          create: true,
        })
        if (fileName.endsWith(".sqlite3")) {
          const content = await file.async("arraybuffer")
          const writable = await (fileHandle as any).createWritable()
          await writable.write(content)
          await writable.close()
        }
      } else {
        throw Error(`invalid path: ${path}`)
      }
    }
  }
}
