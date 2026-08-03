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

class DiskFullOperationJournal extends SpaceOperationJournal {
  override async write(): Promise<void> {
    const error = new Error(
      "ENOSPC: no space left on device, write operation.json"
    ) as NodeJS.ErrnoException
    error.code = "ENOSPC"
    throw error
  }
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
    expect(gate.hasActiveMutations()).toBe(true)
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
    expect(gate.hasActiveMutations()).toBe(false)
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

  it("drains non-materializing repository writes without closing runtimes", async () => {
    const { gate, calls, journal } = await gateWithHooks()
    const mutation = deferred()
    const runningMutation = gate.withMutation(async () => {
      calls.push("mutation-start")
      await mutation.promise
      calls.push("mutation-end")
    })
    const checkpoint = gate.withQuiescedRepositoryOperation(
      "Creating checkpoint",
      async () => {
        calls.push("repository-write")
        return "checkpointed"
      }
    )

    await Promise.resolve()
    expect(gate.current().phase).toBe("quiescing")
    await expect(gate.withMutation(async () => undefined)).rejects.toThrow(
      "paused"
    )
    mutation.resolve()

    await expect(checkpoint).resolves.toBe("checkpointed")
    await runningMutation
    expect(calls).toEqual([
      "mutation-start",
      "mutation-end",
      "repository-write",
    ])
    expect(gate.current().phase).toBe("ready")
    expect(await journal.read()).toBeNull()
  })

  it("returns to editable ready state after a recoverable materialization failure", async () => {
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
      phase: "ready",
      recoverable: true,
    })
    expect(await journal.read()).toBeNull()
    await expect(gate.withMutation(async () => "editable")).resolves.toBe(
      "editable"
    )
  })

  it("keeps mutations paused when a failed materialization cannot be recovered", async () => {
    const { gate, calls, journal } = await gateWithHooks({
      validateWorktree: async () => {
        calls.push("validate")
        throw new Error("Materialized Eidos File is invalid")
      },
    })

    await expect(
      gate.withMaterialization({
        kind: "pull",
        materialize: async () => {
          calls.push("materialize")
          throw new Error("Remote connection closed")
        },
      })
    ).rejects.toThrow("Materialized Eidos File is invalid")

    expect(calls).toEqual(["close", "materialize", "validate"])
    expect(gate.current()).toMatchObject({
      phase: "failed",
      recoverable: false,
    })
    expect((await journal.read())?.phase).toBe("materializing")
    await expect(gate.withMutation(async () => undefined)).rejects.toThrow(
      "paused"
    )
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

  it("keeps editing available when disk-full prevents the initial journal write", async () => {
    const state = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-gate-disk-full-")
    )
    const calls: string[] = []
    const gate = new SpaceOperationGate(new DiskFullOperationJournal(state), {
      closeRuntimes: async () => {
        calls.push("close")
      },
      validateWorktree: async () => {
        calls.push("validate")
      },
      reopenRuntimes: async () => {
        calls.push("reopen")
      },
    })

    await expect(
      gate.withMaterialization({
        kind: "pull",
        materialize: async () => {
          calls.push("materialize")
        },
      })
    ).rejects.toMatchObject({ code: "ENOSPC" })

    expect(calls).toEqual([])
    expect(gate.current()).toMatchObject({
      phase: "ready",
      recoverable: true,
    })
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

  it("keeps local mutations available during non-materializing repository work", async () => {
    const { gate, calls } = await gateWithHooks()
    const operation = deferred()
    const running = gate.withRepositoryOperation("Fetching", async () => {
      calls.push("fetch-start")
      await operation.promise
      calls.push("fetch-end")
    })
    await Promise.resolve()

    expect(gate.current().phase).toBe("syncing")
    await expect(
      gate.withMutation(async () => {
        calls.push("mutation")
        return "edited"
      })
    ).resolves.toBe("edited")

    operation.resolve()
    await running
    expect(calls).toEqual(["fetch-start", "mutation", "fetch-end"])
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
