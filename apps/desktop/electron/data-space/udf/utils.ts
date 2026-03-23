import path from "node:path"

export function resolveFsPath(
  fsPath: string,
  projectRoot: string,
  mountMap?: Record<string, string>
): string | null {
  if (typeof fsPath !== "string") return null

  if (fsPath === "~" || fsPath.startsWith("~/")) {
    const relativePath = fsPath === "~" ? "" : fsPath.substring(2)
    return path.join(projectRoot, relativePath)
  }

  if (fsPath.startsWith("@/")) {
    const parts = fsPath.substring(2).split("/")
    const mountName = parts[0]
    if (mountName && mountMap && mountMap[mountName]) {
      const mountPath = mountMap[mountName]
      const relativePath = parts.slice(1).join("/")
      return relativePath ? path.join(mountPath, relativePath) : mountPath
    }
  }

  if (path.isAbsolute(fsPath)) {
    return fsPath
  }

  return null
}
