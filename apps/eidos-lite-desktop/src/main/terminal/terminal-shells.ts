import { constants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"

import type { EidosLiteTerminalShell } from "../../shared/contracts"

interface DetectTerminalShellsOptions {
  environment?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  readSystemShells?(): Promise<string>
  isExecutable?(executable: string): Promise<boolean>
}

const NON_INTERACTIVE_SHELLS = new Set(["false", "nologin"])

function environmentPath(environment: NodeJS.ProcessEnv): string {
  return environment.PATH ?? environment.Path ?? environment.path ?? ""
}

function normalizedExecutable(
  executable: string,
  platform: NodeJS.Platform
): string {
  const pathApi = platform === "win32" ? path.win32 : path.posix
  const normalized = pathApi.normalize(executable).replace(/[\\/]+$/u, "")
  return platform === "win32"
    ? normalized.toLocaleLowerCase("en-US")
    : normalized
}

function executableName(executable: string, platform: NodeJS.Platform): string {
  const pathApi = platform === "win32" ? path.win32 : path.posix
  return pathApi
    .basename(executable)
    .replace(/\.exe$/iu, "")
    .toLowerCase()
}

function shellDisplayName(
  executable: string,
  platform: NodeJS.Platform
): string {
  const name = executableName(executable, platform)
  if (name === "cmd") return "Command Prompt"
  if (name === "powershell") return "Windows PowerShell"
  if (name === "pwsh") return "PowerShell 7"
  if (
    name === "bash" &&
    platform === "win32" &&
    /[\\/]git[\\/]/iu.test(executable)
  ) {
    return "Git Bash"
  }
  if (name === "bash") return "Bash"
  if (name === "zsh") return "Zsh"
  if (name === "fish") return "Fish"
  if (name === "nu") return "Nushell"
  if (name === "sh") return "sh"
  return name || executable
}

function addPathCandidates(
  candidates: string[],
  names: string[],
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): void {
  const pathApi = platform === "win32" ? path.win32 : path.posix
  const delimiter = platform === "win32" ? ";" : ":"
  for (const entry of environmentPath(environment).split(delimiter)) {
    const directory = entry.trim().replace(/^"|"$/gu, "")
    if (!directory) continue
    for (const name of names) candidates.push(pathApi.join(directory, name))
  }
}

async function unixShellCandidates(
  environment: NodeJS.ProcessEnv,
  readSystemShells: () => Promise<string>
): Promise<string[]> {
  const candidates: string[] = []
  if (environment.SHELL) candidates.push(environment.SHELL)
  try {
    const configured = await readSystemShells()
    for (const line of configured.split(/\r?\n/gu)) {
      const executable = line.trim()
      if (!executable.startsWith("/")) continue
      if (NON_INTERACTIVE_SHELLS.has(executableName(executable, "linux"))) {
        continue
      }
      candidates.push(executable)
    }
  } catch {
    // Minimal systems may not provide /etc/shells.
  }
  addPathCandidates(
    candidates,
    ["zsh", "bash", "fish", "nu", "sh"],
    environment,
    "linux"
  )
  candidates.push("/bin/zsh", "/bin/bash", "/bin/sh", "/usr/bin/fish")
  return candidates
}

function windowsShellCandidates(environment: NodeJS.ProcessEnv): string[] {
  const candidates: string[] = []
  const pathApi = path.win32
  const systemRoot = environment.SystemRoot ?? environment.WINDIR
  const programFiles = [
    environment.ProgramFiles,
    environment.ProgramW6432,
    environment["ProgramFiles(x86)"],
  ].filter((value): value is string => Boolean(value))

  if (environment.ComSpec) candidates.push(environment.ComSpec)
  if (systemRoot) {
    candidates.push(
      pathApi.join(
        systemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe"
      ),
      pathApi.join(systemRoot, "System32", "cmd.exe")
    )
  }
  for (const directory of programFiles) {
    candidates.push(
      pathApi.join(directory, "PowerShell", "7", "pwsh.exe"),
      pathApi.join(directory, "Git", "bin", "bash.exe")
    )
  }
  if (environment.LOCALAPPDATA) {
    candidates.push(
      pathApi.join(
        environment.LOCALAPPDATA,
        "Programs",
        "PowerShell",
        "7",
        "pwsh.exe"
      ),
      pathApi.join(
        environment.LOCALAPPDATA,
        "Programs",
        "Git",
        "bin",
        "bash.exe"
      )
    )
  }
  addPathCandidates(
    candidates,
    [
      "pwsh.exe",
      "powershell.exe",
      "cmd.exe",
      "bash.exe",
      "zsh.exe",
      "fish.exe",
      "nu.exe",
    ],
    environment,
    "win32"
  )
  return candidates
}

export async function detectTerminalShells(
  options: DetectTerminalShellsOptions = {}
): Promise<EidosLiteTerminalShell[]> {
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const readSystemShells =
    options.readSystemShells ?? (() => fs.readFile("/etc/shells", "utf8"))
  const isExecutable =
    options.isExecutable ??
    (async (executable: string) => {
      try {
        await fs.access(
          executable,
          platform === "win32" ? constants.F_OK : constants.X_OK
        )
        return true
      } catch {
        return false
      }
    })
  const candidates =
    platform === "win32"
      ? windowsShellCandidates(environment)
      : await unixShellCandidates(environment, readSystemShells)
  const systemExecutable =
    platform === "win32"
      ? (environment.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
      : (environment.SHELL ?? "/bin/sh")
  const systemKey = normalizedExecutable(systemExecutable, platform)
  const seen = new Set<string>()
  const shells: EidosLiteTerminalShell[] = []

  for (const executable of candidates) {
    if (!executable || executable.includes("\0")) continue
    const key = normalizedExecutable(executable, platform)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (!(await isExecutable(executable))) continue
    shells.push({
      executable,
      name: shellDisplayName(executable, platform),
      systemDefault: key === systemKey,
    })
  }

  return shells
}

export function configuredTerminalShell(
  preference: string | null,
  shells: EidosLiteTerminalShell[],
  platform: NodeJS.Platform = process.platform
): string | undefined {
  if (!preference) return undefined
  const selected = normalizedExecutable(preference, platform)
  return shells.find(
    (shell) => normalizedExecutable(shell.executable, platform) === selected
  )?.executable
}
