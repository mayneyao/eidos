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
