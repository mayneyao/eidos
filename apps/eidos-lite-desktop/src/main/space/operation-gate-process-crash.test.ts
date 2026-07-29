import { fork, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { openEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

import { SpaceOperationGate } from "./operation-gate"
import { SpaceOperationJournal } from "./operation-journal"

const fixture = fileURLToPath(
  new URL("./fixtures/materialization-crash.ts", import.meta.url)
)
const tsxLoader = createRequire(import.meta.url).resolve("tsx")
const projectFixture = fileURLToPath(
  new URL(
    "../../../../eidos-file-web/fixtures/project-tracker.eidos",
    import.meta.url
  )
)

function waitForMaterializing(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = ""
    const timeout = setTimeout(() => {
      reject(new Error(`materialization child timed out: ${stderr}`))
    }, 10_000)
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timeout)
      reject(
        new Error(
          `materialization child exited before signal (${code ?? signal}): ${stderr}`
        )
      )
    })
    child.on("message", (message) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "phase" in message &&
        message.phase === "materializing"
      ) {
        clearTimeout(timeout)
        resolve()
      }
    })
  })
}

describe("SpaceOperationGate process crash recovery", () => {
  it("recovers a real terminated materialization before enabling edits", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-materialization-crash-")
    )
    const state = path.join(root, "state")
    const worktree = path.join(root, "space")
    await Promise.all([fs.mkdir(state), fs.mkdir(worktree)])
    const eidosPath = path.join(worktree, "project.eidos")
    await fs.copyFile(projectFixture, eidosPath)
    await fs.writeFile(path.join(worktree, "notes.txt"), "local content\n")
    const child = fork(fixture, [state, worktree], {
      execArgv: ["--import", tsxLoader],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    })

    try {
      await waitForMaterializing(child)
      expect(child.kill("SIGKILL")).toBe(true)
      await once(child, "exit")

      const journal = new SpaceOperationJournal(state)
      await expect(journal.read()).resolves.toMatchObject({
        kind: "pull-hosted-sync",
        phase: "materializing",
      })
      await expect(
        fs.readFile(path.join(state, "handles-closed"), "utf8")
      ).resolves.toBe("closed\n")
      await expect(
        fs.readFile(path.join(worktree, "notes.txt"), "utf8")
      ).resolves.toBe("partially materialized remote content\n")

      const calls: string[] = []
      const recovered = new SpaceOperationGate(journal, {
        closeRuntimes: async () => {
          calls.push("close")
        },
        validateWorktree: async () => {
          calls.push("validate")
          const runtime = openEidosFile(eidosPath, { readonly: true })
          try {
            expect(runtime.validate({ level: "full" })).toMatchObject({
              valid: true,
            })
          } finally {
            runtime.close()
          }
        },
        reopenRuntimes: async () => {
          calls.push("reopen")
        },
      })

      await expect(
        recovered.recoverInterruptedOperation()
      ).resolves.toMatchObject({
        kind: "pull-hosted-sync",
        phase: "materializing",
      })
      expect(calls).toEqual(["close", "validate", "reopen"])
      expect(recovered.current()).toMatchObject({
        phase: "ready",
        recoverable: true,
      })
      await expect(journal.read()).resolves.toBeNull()
      await expect(
        recovered.withMutation(async () => {
          await fs.writeFile(
            path.join(worktree, "after-recovery.txt"),
            "editable\n"
          )
          return "editable"
        })
      ).resolves.toBe("editable")
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
