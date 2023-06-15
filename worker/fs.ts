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

export const getAllSpaces = async () => {
  const opfsRoot = await navigator.storage.getDirectory()
  const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces", {
    create: true,
  })
  const spaces = []
  for await (let name of spacesDirHandle.keys()) {
    const space = await spacesDirHandle.getDirectoryHandle(name)
    spaces.push(space)
  }
}
