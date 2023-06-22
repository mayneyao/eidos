// script to help move all .md file to docs folder
async function moveScript(spaceName: string) {
  const opfsRoot = await navigator.storage.getDirectory()
  const spacesDirHandle = await opfsRoot.getDirectoryHandle("spaces")
  const spaceDirHandle = await spacesDirHandle.getDirectoryHandle(spaceName)
  // list all .md file
  const entries = []
  for await (let entry of (spaceDirHandle as any).values()) {
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
