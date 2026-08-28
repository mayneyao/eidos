const SAFE_POSIX_PATH = /^[A-Za-z0-9_@%+=:,./-]+$/u
const SAFE_WINDOWS_PATH = /^[A-Za-z0-9_@+=:,./\\-]+$/u

function posixPathInput(absolutePath: string): string {
  return SAFE_POSIX_PATH.test(absolutePath)
    ? absolutePath
    : `'${absolutePath.replaceAll("'", `'\\''`)}'`
}

export function terminalPathInput(
  absolutePath: string,
  platform: NodeJS.Platform,
  shellExecutable?: string
): string {
  if (platform === "win32") {
    const shellName = shellExecutable
      ? shellExecutable
          .split(/[\\/]/u)
          .at(-1)
          ?.replace(/\.exe$/iu, "")
          .toLowerCase()
      : "cmd"
    if (shellName === "powershell" || shellName === "pwsh") {
      return SAFE_WINDOWS_PATH.test(absolutePath)
        ? absolutePath
        : `'${absolutePath.replaceAll("'", "''")}'`
    }
    if (
      shellName === "bash" ||
      shellName === "zsh" ||
      shellName === "fish" ||
      shellName === "nu" ||
      shellName === "sh"
    ) {
      return posixPathInput(absolutePath.replaceAll("\\", "/"))
    }
    return SAFE_WINDOWS_PATH.test(absolutePath)
      ? absolutePath
      : `"${absolutePath.replaceAll('"', '""')}"`
  }
  return posixPathInput(absolutePath)
}
