const SAFE_POSIX_PATH = /^[A-Za-z0-9_@%+=:,./-]+$/u
const SAFE_WINDOWS_PATH = /^[A-Za-z0-9_@+=:,./\\-]+$/u

export function terminalPathInput(
  absolutePath: string,
  platform: NodeJS.Platform
): string {
  if (platform === "win32") {
    return SAFE_WINDOWS_PATH.test(absolutePath)
      ? absolutePath
      : `"${absolutePath.replaceAll('"', '""')}"`
  }
  return SAFE_POSIX_PATH.test(absolutePath)
    ? absolutePath
    : `'${absolutePath.replaceAll("'", `'\\''`)}'`
}
