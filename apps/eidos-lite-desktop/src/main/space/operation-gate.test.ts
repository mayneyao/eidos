import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { SpaceOperationGate } from "./operation-gate"
import { SpaceOperationJournal } from "./operation-journal"

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function gateWithHooks(
  overrides: {
    closeRuntimes?: () => Promise<void>
    validateWorktree?: () => Promise<void>
    reopenRuntimes?: () => Promise<void>
  } = {}
) {
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-gate-"))
  const calls: string[] = []
  const gate = new SpaceOperationGate(new SpaceOperationJournal(state), {
    closeRuntimes:
      overrides.closeRuntimes ??
      (async () => {
        calls.push("close")
      }),
    validateWorktree:
      overrides.validateWorktree ??
      (async () => {
        calls.push("validate")
      }),
    reopenRuntimes:
      overrides.reopenRuntimes ??
      (async () => {
        calls.push("reopen")
      }),
  })
  return { gate, calls, journal: new SpaceOperationJournal(state) }
}

describe("SpaceOperationGate", () => {
  it("drains mutations, closes handles, validates, and reopens in order", async () => {
    const { gate, calls, journal } = await gateWithHooks()
    const mutation = deferred()
    const runningMutation = gate.withMutation(async () => {
      calls.push("mutation-start")
      await mutation.promise
      calls.push("mutation-end")
    })
    const materialization = gate.withMaterialization({
      kind: "pull",
      materialize: async () => {
        calls.push("materialize")
        return "done"
      },
      afterValidate: async (result) => {
        calls.push(`after-validate:${result}`)
      },
    })

    await Promise.resolve()
    expect(gate.current().phase).toBe("quiescing")
    await expect(gate.withMutation(async () => undefined)).rejects.toThrow(
      "paused"
    )
    mutation.resolve()

    await expect(materialization).resolves.toBe("done")
    await runningMutation
    expect(calls).toEqual([
      "mutation-start",
      "mutation-end",
      "close",
      "materialize",
      "validate",
      "after-validate:done",
      "reopen",
    ])
    expect(gate.current().phase).toBe("ready")
    expect(await journal.read()).toBeNull()
  })

  it("reopens the current worktree after materialization failure", async () => {
    const { gate, calls, journal } = await gateWithHooks()
    await expect(
      gate.withMaterialization({
        kind: "restore",
        materialize: async () => {
          calls.push("materialize")
          throw new Error("Graft process crashed")
        },
      })
    ).rejects.toThrow("Graft process crashed")

    expect(calls).toEqual(["close", "materialize", "validate", "reopen"])
    expect(gate.current()).toMatchObject({
      phase: "failed",
      recoverable: true,
    })
    expect((await journal.read())?.phase).toBe("materializing")
  })

  it("returns to ready when a drained preflight stops materialization", async () => {
    const { gate, calls, journal } = await gateWithHooks()
    await expect(
      gate.withMaterialization({
        kind: "pull",
        beforeClose: async () => {
          calls.push("preflight")
          throw new Error("Space changed after fetch")
        },
        materialize: async () => {
          calls.push("materialize")
        },
      })
    ).rejects.toThrow("Space changed after fetch")

    expect(calls).toEqual(["preflight"])
    expect(gate.current()).toMatchObject({
      phase: "ready",
      recoverable: true,
    })
    expect(await journal.read()).toBeNull()
    await expect(gate.withMutation(async () => "editable")).resolves.toBe(
      "editable"
    )
  })

  it("recovers an interrupted materialization journal before accepting work", async () => {
    const { gate, calls, journal } = await gateWithHooks()
    await journal.write({
      operationId: "operation-1",
      kind: "pull",
      phase: "materializing",
      startedAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:01.000Z",
    })

    await expect(gate.recoverInterruptedOperation()).resolves.toMatchObject({
      operationId: "operation-1",
    })
    expect(calls).toEqual(["close", "validate", "reopen"])
    expect(gate.current().phase).toBe("ready")
    expect(await journal.read()).toBeNull()
  })

  it("does not close application handles for read-only repository work", async () => {
    const { gate, calls } = await gateWithHooks()
    await expect(
      gate.withRepositoryOperation("Reading status", async () => {
        calls.push("status")
        return "clean"
      })
    ).resolves.toBe("clean")
    expect(calls).toEqual(["status"])
    expect(gate.current().phase).toBe("ready")
  })

  it("waits for in-flight repository work before orderly close", async () => {
    const { gate, calls } = await gateWithHooks()
    const operation = deferred()
    const running = gate.withRepositoryOperation("Fetching", async () => {
      calls.push("fetch-start")
      await operation.promise
      calls.push("fetch-end")
    })
    await Promise.resolve()

    const closing = gate.close()
    const late = gate.withRepositoryOperation(
      "Late status",
      async () => undefined
    )
    const lateAssertion = expect(late).rejects.toThrow("closed")
    expect(gate.current().phase).toBe("syncing")
    operation.resolve()
    await Promise.all([running, closing, lateAssertion])

    expect(calls).toEqual(["fetch-start", "fetch-end"])
    expect(gate.current().phase).toBe("closed")
  })
})
