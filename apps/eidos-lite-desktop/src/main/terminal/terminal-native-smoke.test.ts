import { spawn } from "node-pty"
import { expect, it } from "vitest"

it.skipIf(process.platform === "win32")(
  "loads the node-pty prebuild in Electron and runs a local shell",
  async () => {
    const output = await new Promise<string>((resolve, reject) => {
      const terminal = spawn("/bin/sh", ["-c", "printf eidos-terminal-ok"], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined
          )
        ),
      })
      let data = ""
      const timeout = setTimeout(() => {
        terminal.kill()
        reject(new Error("Timed out waiting for the terminal shell"))
      }, 5_000)
      terminal.onData((chunk) => {
        data += chunk
      })
      terminal.onExit(({ exitCode }) => {
        clearTimeout(timeout)
        if (exitCode === 0) resolve(data)
        else reject(new Error(`Terminal shell exited with ${exitCode}`))
      })
    })

    expect(output).toContain("eidos-terminal-ok")
  }
)
