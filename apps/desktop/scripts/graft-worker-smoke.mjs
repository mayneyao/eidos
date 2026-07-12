import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { fork } from "node:child_process"

const execFileAsync = promisify(execFile)
const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const repositoryPath = await mkdtemp(path.join(tmpdir(), "eidos-graft-worker-"))
const graftBinary = path.join(desktopRoot, "dist-cli", "graft")

try {
  await execFileAsync(graftBinary, ["init", "--json"], {
    cwd: repositoryPath,
    env: { ...process.env, NO_COLOR: "1", SQLITE_USE_URI: "1" },
  })
  await writeFile(path.join(repositoryPath, "README.md"), "# Worker smoke\n")

  const worker = fork(
    path.join(desktopRoot, "dist-electron", "graft-worker.js"),
    [],
    {
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    }
  )
  const responses = []
  worker.on("message", (response) => responses.push(response))
  worker.send({
    type: "init",
    data: {
      repositoryPath,
      extensionPath: path.join(desktopRoot, "dist-sqlite-ext", "libgraft"),
    },
  })
  const waitForResponse = (id) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(new Error(`Timed out waiting for Graft worker request ${id}`)),
        10_000
      )
      const inspect = (response) => {
        if (response.id !== id) return
        clearTimeout(timeout)
        worker.off("message", inspect)
        resolve(response)
      }
      worker.on("message", inspect)
    })

  worker.send({
    type: "execute",
    id: 1,
    pragma: "json_status",
    maxBufferBytes: 4 * 1024 * 1024,
  })
  const status = await waitForResponse(1)
  if (status.type !== "result") throw new Error(status.message)

  worker.send({
    type: "execute",
    id: 2,
    pragma: "json_status",
    maxBufferBytes: 1,
  })
  const bounded = await waitForResponse(2)
  if (bounded.type !== "error" || !bounded.message.includes("exceeded")) {
    throw new Error("Graft worker did not enforce its response limit")
  }

  const closed = new Promise((resolve) => worker.once("exit", resolve))
  worker.send({ type: "close" })
  await closed

  await execFileAsync(graftBinary, ["status", "--json"], {
    cwd: repositoryPath,
    env: { ...process.env, NO_COLOR: "1", SQLITE_USE_URI: "1" },
  })
  console.log(
    JSON.stringify({
      status: "ok",
      responseLimit: "ok",
      repositoryUnlocked: "ok",
      responses: responses.length,
    })
  )
} finally {
  await rm(repositoryPath, { recursive: true, force: true })
}
