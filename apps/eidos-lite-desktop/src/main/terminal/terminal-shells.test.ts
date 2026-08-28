import { describe, expect, it } from "vitest"

import {
  configuredTerminalShell,
  detectTerminalShells,
} from "./terminal-shells"

describe("terminal shell discovery", () => {
  it("reads executable interactive shells from the current Unix machine", async () => {
    const available = new Set(["/bin/zsh", "/bin/bash", "/usr/bin/fish"])
    const shells = await detectTerminalShells({
      environment: {
        SHELL: "/bin/zsh",
        PATH: "/usr/local/bin:/usr/bin:/bin",
      },
      platform: "darwin",
      readSystemShells: async () =>
        "/bin/bash\n/bin/zsh\n/usr/bin/fish\n/usr/bin/false\n",
      isExecutable: async (executable) => available.has(executable),
    })

    expect(shells).toEqual([
      { executable: "/bin/zsh", name: "Zsh", systemDefault: true },
      { executable: "/bin/bash", name: "Bash", systemDefault: false },
      { executable: "/usr/bin/fish", name: "Fish", systemDefault: false },
    ])
  })

  it("finds installed Windows shells and resolves a saved selection", async () => {
    const available = new Set(
      [
        "C:\\Windows\\System32\\cmd.exe",
        "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        "C:\\Program Files\\Git\\bin\\bash.exe",
      ].map((value) => value.toLowerCase())
    )
    const shells = await detectTerminalShells({
      environment: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        SystemRoot: "C:\\Windows",
        ProgramFiles: "C:\\Program Files",
        Path: "C:\\Program Files\\PowerShell\\7;C:\\Windows\\System32",
      },
      platform: "win32",
      isExecutable: async (executable) =>
        available.has(executable.toLowerCase()),
    })

    expect(shells).toEqual([
      {
        executable: "C:\\Windows\\System32\\cmd.exe",
        name: "Command Prompt",
        systemDefault: true,
      },
      {
        executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        name: "PowerShell 7",
        systemDefault: false,
      },
      {
        executable: "C:\\Program Files\\Git\\bin\\bash.exe",
        name: "Git Bash",
        systemDefault: false,
      },
    ])
    expect(
      configuredTerminalShell(
        "c:\\program files\\powershell\\7\\PWSH.EXE",
        shells,
        "win32"
      )
    ).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
    expect(
      configuredTerminalShell("C:\\missing\\shell.exe", shells, "win32")
    ).toBeUndefined()
  })
})
