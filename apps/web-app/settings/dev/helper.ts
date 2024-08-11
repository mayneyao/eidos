import { efsManager } from "@/lib/storage/eidos-file-system"

const needRemovedPaths = ["resolve", "main"]
export const saveTransformerCache = async () => {
  const cache = await caches.open("transformers-cache")
  const allKeys = await cache.keys()
  for (const key of allKeys) {
    const response = await cache.match(key)
    let paths = new URL(key.url).pathname.split("/").filter(Boolean)
    const name = paths.pop() as string
    // filter paths
    paths = paths.filter((path) => !needRemovedPaths.includes(path))
    const blob = await response?.blob()
    if (blob) {
      const file = new File([blob], name)
      const dirs = ["static", "transformers", ...paths]
      const isFileExist = await efsManager.checkFileExists([...dirs, name])
      if (!isFileExist) {
        await efsManager.addFile(dirs, file)
        console.log("saved", key.url)
      } else {
        console.log("file already exist", key.url)
      }
    }
  }
}
