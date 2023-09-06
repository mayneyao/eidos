/**
 * all scripts in this file are for development only.
 * just execute the script in browser console, don't import it in any file, don't import any function in this file
 */

// script to help move all .md file to docs folder
async function moveScript(spaceName) {
  const opfsRoot = await navigator.storage.getDirectory()
  const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces")
  const spaceDirHandle = await spacesDirHandle.getDirectoryHandle(spaceName)
  // list all .md file
  const entries = []
  for await (let entry of spaceDirHandle.values()) {
    if (entry.kind === "file" && entry.name.endsWith(".md")) {
      entries.push(entry)
    }
  }
  // move all .md file to docs folder

  const docsDirHandle = await spaceDirHandle.getDirectoryHandle("docs", {
    create: true,
  })
  for (let entry of entries) {
    await entry.move(docsDirHandle, entry.name)
  }
}

/**
 * add eidos_files table to record file meta
 * init eidos_files table with all files in opfs
 */
async function initFileMeta(space) {
  const opfsRoot = await navigator.storage.getDirectory()
  const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces")
  const spaceDirHandle = await spacesDirHandle.getDirectoryHandle(space)
  const spaceFilesDirHandle = await spaceDirHandle.getDirectoryHandle("files")
  async function walkDir(dirHandle) {
    for await (let entry of dirHandle.values()) {
      if (entry.kind === "file") {
        const file = await entry.getFile()
        const { name, size, type: mime } = file
        const paths = await opfsRoot.resolve(entry)
        const path = paths.join("/")
        let uuid = self.crypto.randomUUID()
        const fileInfo = {
          id: uuid.split("-").join(""),
          name,
          size,
          mime,
          path,
        }
        await sqlite.addFile(fileInfo)
      } else if (entry.kind === "directory") {
        await walkDir(entry)
      }
    }
  }
  await walkDir(spaceFilesDirHandle)
  console.log("init file meta done")
}
