import path from "node:path"

/** Presentation path for a file whose Space-relative path has been validated. */
export function filePropertiesLocationPath(
  spaceRoot: string,
  relativePath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const nativePath = platform === "win32" ? path.win32 : path.posix
  return nativePath.dirname(
    nativePath.join(spaceRoot, ...relativePath.split("/"))
  )
}
