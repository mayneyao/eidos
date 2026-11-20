// Run in Electron Node mode so require() can resolve files inside app.asar.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"

if (!process.argv[2]) throw new Error("Pass the packaged app.asar path")
const archive = path.resolve(process.argv[2])
const require = createRequire(path.join(archive, "package.json"))
assert.ok(require.resolve("node-pty").startsWith(archive + path.sep))
const { spawn } = require("node-pty")
const marker = "eidos-packaged-terminal-ok"
const windows = process.platform === "win32"
const cases = windows
  ? [
      ["system ConPTY", { useConpty: true }],
      ["bundled ConPTY", { useConpty: true, useConptyDll: true }],
      ["WinPTY", { useConpty: false }],
    ]
  : [["POSIX", {}]]

for (const [backend, options] of cases) {
  const output = await new Promise((resolve, reject) => {
    const terminal = spawn(
      windows ? "cmd.exe" : "/bin/sh",
      windows
        ? ["/d", "/q", "/c", `echo ${marker}`]
        : ["-c", `printf '${marker}'`],
      {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: os.tmpdir(),
        env: process.env,
        ...options,
      }
    )
    let output = ""
    const timeout = setTimeout(() => {
      terminal.kill()
      reject(new Error(`Packaged ${backend} terminal timed out`))
    }, 8_000)
    terminal.onData((chunk) => {
      output += chunk
    })
    terminal.onExit(({ exitCode }) => {
      clearTimeout(timeout)
      if (exitCode === 0) resolve(output)
      else
        reject(
          new Error(`Packaged ${backend} terminal exited with ${exitCode}`)
        )
    })
  })
  assert.ok(output.includes(marker), `${backend} returned no terminal output`)
  console.log(`PASS: packaged ${backend} terminal`)
}
