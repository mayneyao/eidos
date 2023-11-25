/**
 * opfs file structure:
 * - spaces
 *  - space1
 *    - db.sqlite3
 *    - files
 *      - 1234567890.png
 *      - 0987654321.png
 *  - space2
 *    - db.sqlite3
 *
 * spaces
 * - what is a space? a space is a folder that contains a sqlite3 database, default name is db.sqlite3.
 * - one space is one database.
 *
 * files
 * - files is a folder that contains all static files, such as images, videos, etc.
 * - when user upload a file, it will be saved in this folder. hash will be used as file name. e.g. 1234567890.png
 */
import mime from "mime-types"

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

export class OpfsSpaceManager {
  async list(): Promise<string[]> {
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

  async remove(spaceName: string) {
    const opfsRoot = await navigator.storage.getDirectory()
    const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces", {
      create: true,
    })
    await spacesDirHandle.removeEntry(spaceName, { recursive: true })
  }
}

export const getSpaceDatabasePath = async (spaceName: string) => {
  return `/spaces/${spaceName}/db.sqlite3`
}

export const getSpaceDatabaseFileHandle = async (spaceName: string) => {
  const opfsRoot = await navigator.storage.getDirectory()
  const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces", {
    create: true,
  })
  const spaceDirHandle = await spacesDirHandle.getDirectoryHandle(spaceName, {
    create: true,
  })
  const dbFileHandle = await spaceDirHandle.getFileHandle("db.sqlite3", {
    create: true,
  })
  return dbFileHandle
}

export const saveFile = async (file: File, space: string, name?: string) => {
  const opfsRoot = await navigator.storage.getDirectory()
  const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces", {
    create: true,
  })
  const spaceDirHandle = await spacesDirHandle.getDirectoryHandle(space, {
    create: true,
  })
  const filesDirHandle = await spaceDirHandle.getDirectoryHandle("files", {
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

export const getDirHandle = async (
  _paths: string[],
  rootDirHandle?: FileSystemDirectoryHandle
) => {
  const paths = [..._paths]
  let dirHandle: FileSystemDirectoryHandle
  if (rootDirHandle) {
    dirHandle = rootDirHandle
  } else {
    dirHandle = await navigator.storage.getDirectory()
  }
  for (let path of paths) {
    dirHandle = await dirHandle.getDirectoryHandle(path, { create: true })
  }
  return dirHandle
}

export class OpfsManager {
  rootDirHandle: FileSystemDirectoryHandle | undefined
  constructor(rootDirHandle?: FileSystemDirectoryHandle) {
    if (rootDirHandle) {
      this.rootDirHandle = rootDirHandle
    }
  }
  getFileUrlByPath = (path: string) => {
    const paths = path.split("/").slice(1)
    return "/" + paths.join("/")
  }

  getFileByURL = async (url: string) => {
    const path = new URL(url).pathname
    const parentPaths = path.split("/").slice(0, -1).filter(Boolean)
    const parentDirHandle = await getDirHandle(
      ["spaces", ...parentPaths],
      this.rootDirHandle
    )
    const filename = path.split("/").pop()
    const realFilename = decodeURIComponent(filename!)
    const fileHandle = await parentDirHandle.getFileHandle(realFilename)
    return fileHandle.getFile()
  }

  getFileByPath = async (path: string) => {
    const paths = path.split("/")
    const file = await this.getFile(paths)
    return file
  }

  listDir = async (_paths: string[]) => {
    const dirHandle = await getDirHandle(_paths, this.rootDirHandle)
    const entries: FileSystemFileHandle[] = []
    for await (let entry of (dirHandle as any).values()) {
      entries.push(entry)
    }
    return entries
  }

  updateDocFile = async (_paths: string[], content: string) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const filename = paths.pop()
    const dirHandle = await getDirHandle(paths, this.rootDirHandle)
    const fileHandle = await dirHandle.getFileHandle(filename!, {
      create: true,
    })
    const writable = await (fileHandle as any).createWritable()
    await writable.write(content)
    await writable.close()
    console.log("update doc file", filename)
  }

  getFile = async (_paths: string[]) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const filename = paths.pop()
    const dirHandle = await getDirHandle(paths, this.rootDirHandle)
    const fileHandle = await dirHandle.getFileHandle(filename!, {
      create: true,
    })
    const file = await fileHandle.getFile()
    return file
  }

  getDocContent = async (_paths: string[]) => {
    const file = await this.getFile(_paths)
    return await file.text()
  }

  addDir = async (_paths: string[], dirName: string) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const dirHandle = await getDirHandle(paths, this.rootDirHandle)
    const r = await dirHandle.getDirectoryHandle(dirName, { create: true })
    // const opfsRoot = await navigator.storage.getDirectory()
    // const path = await opfsRoot.resolve(r)
  }

  addFile = async (_paths: string[], file: File, fileId?: string) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const dirHandle = await getDirHandle(paths, this.rootDirHandle)
    // if fileId is provided, use it as file name
    const fileExt = mime.extension(file.type)
    const filename = fileId ? `${fileId}.${fileExt}` : file.name
    const fileHandle = await dirHandle.getFileHandle(filename, {
      create: true,
    })
    const writable = await (fileHandle as any).createWritable()
    await writable.write(file)
    await writable.close()
    // fileHandle get path
    const opfsRoot = await navigator.storage.getDirectory()
    const relativePath = await opfsRoot.resolve(fileHandle)
    return relativePath
  }

  deleteEntry = async (_paths: string[], isDir = false) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    if (isDir) {
      const dirHandle = await getDirHandle(paths, this.rootDirHandle)
      // The remove() method is currently only implemented in Chrome. You can feature-detect support via 'remove' in FileSystemFileHandle.prototype.
      await (dirHandle as any).remove({
        recursive: true,
      })
    } else {
      const filename = paths.pop()
      const dirHandle = await getDirHandle(paths, this.rootDirHandle)
      await dirHandle.removeEntry(filename!)
    }
  }

  renameFile = async (_paths: string[], newName: string) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const filename = paths.pop()
    const dirHandle = await getDirHandle(paths, this.rootDirHandle)
    const fileHandle = (await dirHandle.getFileHandle(filename!, {
      create: true,
    })) as any
    await fileHandle.move(newName)
  }
}

// deprecated
export const opfsManager = new OpfsManager()
