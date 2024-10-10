import { isDesktopMode } from "../env"
import { extension } from "../mime/mime"
import { getIndexedDBValue } from "./indexeddb"


export enum FileSystemType {
  OPFS = "opfs",
  NFS = "nfs",
}

export const getFsRootHandle = async (fsType: FileSystemType) => {
  let dirHandle: FileSystemDirectoryHandle

  switch (fsType) {
    case FileSystemType.NFS:
      // how it works https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
      dirHandle = await getIndexedDBValue("kv", "localPath")
      break
    case FileSystemType.OPFS:
    default:
      dirHandle = await navigator.storage.getDirectory()
      break
  }
  return dirHandle
}

export const getExternalFolderHandle = async (name: string) => {
  const externalFolders = await getIndexedDBValue<FileSystemDirectoryHandle[]>(
    "kv",
    "externalFolders"
  )
  const dirHandle = externalFolders.find((dir) => dir.name === name)
  return dirHandle
}


const adapterSymbol = Symbol('adapter');

function hasAdapterSymbol(obj: any): boolean {
  const symbols = Object.getOwnPropertySymbols(obj);
  return symbols.some(symbol => symbol.toString() === adapterSymbol.toString());
}


/**
 * get DirHandle for a given path list
 * we read config from indexeddb to decide which file system to use
 * there are two file systems:
 * 1. opfs: origin private file system. store files in web.
 * 2. nfs: Native File System. store files in local file system.
 * @param _paths path list just like ["root", "dir1", "dir2"]
 * @param rootDirHandle we can pass rootDirHandle to avoid reading from indexeddb
 * @returns
 */
export const getDirHandle = async (
  _paths: string[],
  rootDirHandle?: FileSystemDirectoryHandle
) => {
  const paths = [..._paths]
  let dirHandle: FileSystemDirectoryHandle
  if (rootDirHandle) {
    dirHandle = rootDirHandle
  } else {
    const fsType: FileSystemType = await getIndexedDBValue("kv", "fs")
    dirHandle = await getFsRootHandle(fsType)
  }
  for (let path of paths) {
    dirHandle = await dirHandle.getDirectoryHandle(path, { create: true })
  }
  return dirHandle
}

/**
 * eidos fs structure:
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

export class EidosFileSystemManager {
  rootDirHandle: FileSystemDirectoryHandle | undefined
  constructor(rootDirHandle?: FileSystemDirectoryHandle) {
    if (rootDirHandle) {
      this.rootDirHandle = rootDirHandle
    }
  }

  isSameEntry = async (dirHandle: FileSystemDirectoryHandle) => {
    return this.rootDirHandle?.isSameEntry(dirHandle)
  }

  getDirHandle = async (paths: string[]) => {
    return getDirHandle(paths, this.rootDirHandle)
  }

  walk = async (_paths: string[]): Promise<string[][]> => {
    const dirHandle = await getDirHandle(_paths, this.rootDirHandle)
    const paths = []
    const rootDirHandle = await getDirHandle([], this.rootDirHandle)
    for await (let entry of (dirHandle as any).values()) {
      if (entry.kind === "file") {
        const path = await (this.rootDirHandle || rootDirHandle).resolve(entry)
        paths.push(path)
      } else if (entry.kind === "directory") {
        const subPaths: any = await this.walk([..._paths, entry.name])
        paths.push(...subPaths)
      }
    }
    return paths
  }

  copyFile = async (_paths: string[], targetFs: EidosFileSystemManager) => {
    // copy file to target fs
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const file = await this.getFile(paths)
    const targetPaths = paths.slice(0, -1)
    await targetFs.addFile(targetPaths, file)
  }

  copyTo = async (
    targetFs: EidosFileSystemManager,
    options?: {
      ignoreSqlite?: boolean
    },
    cb?: (data: { current: number; total: number; msg: string }) => void
  ) => {
    const paths = await this.walk([])
    const targetPaths = await targetFs.walk([])
    const targetPathsSet = new Set(targetPaths.map((p) => p.join("/")))

    const total = paths.length
    for (let path of paths) {
      const current = paths.indexOf(path) + 1
      // ignore .opfs-sahpool
      if (path[0] === ".opfs-sahpool") {
        cb?.({
          current,
          total,
          msg: "ignore .opfs-sahpool",
        })
        continue
      }

      if (path[path.length - 1] === "db.sqlite3") {
        if (options?.ignoreSqlite) {
          cb?.({
            current,
            total,
            msg: `ignore db.sqlite3`,
          })
          continue
        } else {
          // if target fs is nfs, we need to copy sqlite file every time
          await this.copyFile(path, targetFs)
          cb?.({
            current,
            total,
            msg: `copying ${path.join("/")}`,
          })
        }
      }

      // check if file exists
      if (targetPathsSet.has(path.join("/"))) {
        cb?.({
          current,
          total,
          msg: `file exists ${path.join("/")}`,
        })
        continue
      }
      await this.copyFile(path, targetFs)
      cb?.({
        current,
        total,
        msg: `copying ${path.join("/")}`,
      })
    }
    console.log("copy done")
  }

  getFileUrlByPath = (path: string, replaceSpace?: string) => {
    const paths = path.split("/").slice(1)
    if (replaceSpace) {
      paths[0] = replaceSpace
    }
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

  updateOrCreateDocFile = async (_paths: string[], content: string) => {
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

  checkFileExists = async (_paths: string[]) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const filename = paths.pop()
    const dirHandle = await getDirHandle(paths, this.rootDirHandle)
    try {
      await dirHandle.getFileHandle(filename!)
      return true
    } catch (e) {
      return false
    }
  }

  getFile = async (_paths: string[], options?: FileSystemGetFileOptions) => {
    const paths = [..._paths.filter(Boolean)]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const filename = paths.pop()
    const dirHandle = await getDirHandle(paths, this.rootDirHandle)
    const fileHandle = await dirHandle.getFileHandle(filename!, options)
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

    // const path = await opfsRoot.resolve(r)
  }

  addFile = async (_paths: string[], file: File, fileId?: string) => {
    const paths = [..._paths]
    if (paths.length === 0) {
      throw new Error("paths can't be empty")
    }
    const dirHandle = await getDirHandle(paths, this.rootDirHandle)
    console.log("dirHandle", dirHandle)
    // if fileId is provided, use it as file name
    const fileExt = extension(file.type)
    const filename = fileId ? `${fileId}.${fileExt}` : file.name
    const fileHandle = await dirHandle.getFileHandle(filename, {
      create: true,
    })
    const writable = await (fileHandle as any).createWritable()
    await writable.write(file)
    await writable.close()
    // fileHandle get path
    const rootDirHandle = await getDirHandle([], this.rootDirHandle)
    const relativePath = await rootDirHandle.resolve(fileHandle)
    console.log("relativePath", { rootDirHandle, fileHandle, relativePath })
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
export const efsManager = isDesktopMode ? new EidosFileSystemManager() : new EidosFileSystemManager()

export const getExternalFolderManager = async (name: string) => {
  const dirHandler = await getExternalFolderHandle(name)
  if (!dirHandler) {
    throw new Error("external folder not found")
  }
  const efsManager = new EidosFileSystemManager(dirHandler)
  return efsManager
}
