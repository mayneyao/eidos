/**
 * opfs file structure:
 *
 * - spaces
 *  - space1
 *    - db.sqlite3
 *  - space2
 *    - db.sqlite3
 * - files
 *
 * spaces
 * - what is a space? a space is a folder that contains a sqlite3 database, default name is db.sqlite3.
 * - one space is one database.
 *
 * files
 * - files is a folder that contains all static files, such as images, videos, etc.
 * - when user upload a file, it will be saved in this folder. hash will be used as file name. e.g. 1234567890.png
 */

export const getAllSpaceNames = async (): Promise<string[]> => {
  const opfsRoot = await navigator.storage.getDirectory()
  const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces", {
    create: true,
  })
  const spaces = []
  for await (let name of (spacesDirHandle as any).keys()) {
    spaces.push(name)
  }
  return spaces
}

export const getSpaceDatabasePath = async (spaceName: string) => {
  return `/spaces/${spaceName}/db.sqlite3`
}

export const uploadFile2OPFS = async (file: File, domain = "") => {
  const imgUrl = URL.createObjectURL(file)
  const fileHash = imgUrl.split("/").pop()
  const fileExtension = file.name.split(".").pop()
  const newFileName = `${fileHash}.${fileExtension}`
  const newFileUrl = `${domain}/files/${newFileName}`
  await saveFile(file, newFileName)
  return newFileUrl
}

export const saveFile = async (file: File, name?: string) => {
  const opfsRoot = await navigator.storage.getDirectory()
  const filesDirHandle = await opfsRoot.getDirectoryHandle("files", {
    create: true,
  })
  const fileHandle = await filesDirHandle.getFileHandle(name ?? file.name, {
    create: true,
  })
  // nextjs can't recognize createWritable of fileHandle
  const writable = await (fileHandle as any).createWritable()
  await writable.write(file)
  await writable.close()
  return fileHandle
}

let _content: string

export const updateDocFile = async (
  spaceName: string,
  docId: string,
  content: string
) => {
  if (_content === content) {
    console.log("content not changed, skip update doc file")
    return
  }
  const opfsDoc = opfsDocManager
  const docFileName = `${docId}.md`
  const paths = ["spaces", spaceName, docFileName]
  await opfsDoc.updateDocFile(paths, content)
  _content = content
  console.log("update doc file", docFileName)
}

export const getDocContent = async (spaceName: string, docId: string) => {
  const opfsDoc = opfsDocManager
  const docFileName = `${docId}.md`
  const paths = ["spaces", spaceName, docFileName]
  return await opfsDoc.getDocContent(paths)
}

export const deleteDocFile = async (spaceName: string, docId: string) => {
  const opfsDoc = opfsDocManager
  const docFileName = `${docId}.md`
  const paths = ["spaces", spaceName, docFileName]
  return await opfsDoc.deleteDocFile(paths)
}

export const getAllDays = async (spaceName: string) => {
  const opfsRoot = await navigator.storage.getDirectory()
  const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces")
  const spaceDirHandle = await spacesDirHandle.getDirectoryHandle(spaceName)
  const everydayDirHandle = await spaceDirHandle.getDirectoryHandle("everyday")

  // list all entries in everyday folder
  const entries = []
  for await (let entry of (everydayDirHandle as any).values()) {
    entries.push(entry)
  }
  return entries
}

export class OpfsDoc {
  private getDirHandle = async (_paths: string[]) => {
    const paths = [..._paths]
    const opfsRoot = await navigator.storage.getDirectory()
    let dirHandle = opfsRoot
    for (let path of paths) {
      dirHandle = await dirHandle.getDirectoryHandle(path, { create: true })
    }
    return dirHandle
  }

  updateDocFile = async (_paths: string[], content: string) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const filename = paths.pop()
    const dirHandle = await this.getDirHandle(paths)
    const fileHandle = await dirHandle.getFileHandle(filename!, {
      create: true,
    })
    const writable = await (fileHandle as any).createWritable()
    await writable.write(content)
    await writable.close()
  }

  getDocContent = async (_paths: string[]) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const filename = paths.pop()
    const dirHandle = await this.getDirHandle(paths)
    const fileHandle = await dirHandle.getFileHandle(filename!, {
      create: true,
    })
    const file = await fileHandle.getFile()
    return await file.text()
  }

  deleteDocFile = async (_paths: string[]) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const filename = paths.pop()
    const dirHandle = await this.getDirHandle(paths)
    await dirHandle.removeEntry(filename!)
  }
}

export const opfsDocManager = new OpfsDoc()
