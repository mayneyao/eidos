import { pathToFileURL } from "node:url"

export function createGraftDbUri(
  dbPath: string,
  platform: NodeJS.Platform = process.platform
) {
  if (dbPath === ":memory:") return dbPath

  if (platform === "win32") {
    return `file:${dbPath}?vfs=graft`
  }

  const url = pathToFileURL(dbPath)
  url.searchParams.set("vfs", "graft")
  return url.href
}
