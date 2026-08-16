import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type {
  EidosSyncFailureCode,
  EidosSyncQueueStatus,
  EidosSyncRunResponse,
  SpaceSnapshot,
} from "../../shared/contracts"
import { BackgroundSyncQueue } from "./background-sync-queue"
import { SyncQueueStore } from "./sync-queue-store"

const spaceId = "space-queue-test"

class TestScheduler {
  now = 10_000
  private nextId = 0
  private readonly tasks = new Map<
    number,
    { at: number; task: () => Promise<void> }
  >()

  schedule = (task: () => Promise<void>, delayMs: number): number => {
    const id = ++this.nextId
    this.tasks.set(id, { at: this.now + delayMs, task })
    return id
  }

  cancel = (timer: unknown): void => {
    this.tasks.delete(Number(timer))
  }

  async advanceBy(delayMs: number): Promise<void> {
    this.now += delayMs
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= this.now)
        .sort((left, right) => left[1].at - right[1].at)[0]
      if (!due) return
      this.tasks.delete(due[0])
      await due[1].task()
    }
  }
}

function failed(
  code: EidosSyncFailureCode = "offline",
  retryAfterMs?: number
): Extract<EidosSyncRunResponse, { ok: false }> {
  return {
    ok: false,
    runId: "failed-run",
    failure: {
      code,
      state: code === "offline" ? "offline" : "needs-attention",
      title: "Sync did not complete",
      message: "Local files remain safe.",
      action: "retry-now",
      actionLabel: "Retry now",
      retryable: true,
      localSafe: true,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    },
    telemetry: {
      startedAtMs: 0,
      completedAtMs: 1,
      durationMs: 1,
      phases: [],
    },
  }
}

function succeeded(): EidosSyncRunResponse {
  return {
    ok: true,
    result: {
      state: "synced",
      message: "Synced",
      pulled: false,
      pushed: true,
      ahead: 0,
      behind: 0,
      snapshot: {} as SpaceSnapshot,
      runId: "successful-run",
      telemetry: {
        startedAtMs: 0,
        completedAtMs: 1,
        durationMs: 1,
        phases: [],
      },
    },
  }
}

function quotaExceeded(): EidosSyncRunResponse {
  const response = failed("quota-exceeded")
  return {
    ...response,
    failure: {
      ...response.failure,
      retryable: false,
    },
  }
}

function localChanges(): EidosSyncRunResponse {
  const response = failed("local-changes")
  return {
    ...response,
    failure: {
      ...response.failure,
      action: "review-local",
      actionLabel: "Review local changes",
      retryable: false,
    },
  }
}

describe("BackgroundSyncQueue", () => {
  let directory: string
  let store: SyncQueueStore
  let statuses: EidosSyncQueueStatus[]
  let scheduler: TestScheduler

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-sync-queue-"))
    store = new SyncQueueStore(directory)
    statuses = []
    scheduler = new TestScheduler()
  })

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  function queue(maxAttempts?: number): BackgroundSyncQueue {
    return new BackgroundSyncQueue({
      store,
      now: () => scheduler.now,
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
      ...(maxAttempts === undefined ? {} : { maxAttempts }),
    })
  }

  it("clears durable queue state after a successful manual run", async () => {
    const execute = vi.fn().mockResolvedValue(succeeded())
    const syncQueue = queue()
    await syncQueue.attach({
      spaceId,
      execute,
      emit: (status) => statuses.push(status),
    })

    const result = await syncQueue.runNow(spaceId)

    expect(result.ok).toBe(true)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(syncQueue.status(spaceId).state).toBe("idle")
    expect(await store.read(spaceId)).toBeNull()
    await syncQueue.close()
  })

  it("retries transient failures with bounded exponential delays", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(failed())
      .mockResolvedValueOnce(failed())
      .mockResolvedValueOnce(succeeded())
    const syncQueue = queue()
    await syncQueue.attach({
      spaceId,
      execute,
      emit: (status) => statuses.push(status),
    })

    await syncQueue.runNow(spaceId)
    expect(syncQueue.status(spaceId)).toMatchObject({
      state: "retry-wait",
      attempt: 1,
      nextAttemptAtMs: 11_000,
    })

    await scheduler.advanceBy(1_000)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(syncQueue.status(spaceId)).toMatchObject({
      state: "retry-wait",
      attempt: 2,
      nextAttemptAtMs: 13_000,
    })

    await scheduler.advanceBy(2_000)
    expect(execute).toHaveBeenCalledTimes(3)
    expect(syncQueue.status(spaceId).state).toBe("idle")
    await syncQueue.close()
  })

  it("uses Retry-After as a floor and clamps hostile delays", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(failed("rate-limited", 5_000))
      .mockResolvedValueOnce(succeeded())
    const syncQueue = queue()
    await syncQueue.attach({
      spaceId,
      execute,
      emit: (status) => statuses.push(status),
    })

    await syncQueue.runNow(spaceId)
    expect(syncQueue.status(spaceId).nextAttemptAtMs).toBe(15_000)
    await scheduler.advanceBy(4_999)
    expect(execute).toHaveBeenCalledTimes(1)
    await scheduler.advanceBy(1)
    expect(execute).toHaveBeenCalledTimes(2)
    await syncQueue.close()
  })

  it("pauses after the bounded attempt budget", async () => {
    const execute = vi.fn().mockResolvedValue(failed())
    const syncQueue = queue(3)
    await syncQueue.attach({
      spaceId,
      execute,
      emit: (status) => statuses.push(status),
    })

    await syncQueue.runNow(spaceId)
    await scheduler.advanceBy(1_000)
    await scheduler.advanceBy(2_000)

    expect(execute).toHaveBeenCalledTimes(3)
    expect(syncQueue.status(spaceId)).toMatchObject({
      state: "paused",
      attempt: 3,
      maxAttempts: 3,
      lastFailure: { localSafe: true },
    })
    await syncQueue.close()
  })

  it("pauses a quota crossing until capacity is restored explicitly", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(quotaExceeded())
      .mockResolvedValueOnce(succeeded())
    const syncQueue = queue()
    await syncQueue.attach({
      spaceId,
      execute,
      emit: (status) => statuses.push(status),
    })

    const exceeded = await syncQueue.runNow(spaceId)

    expect(exceeded).toMatchObject({
      ok: false,
      failure: {
        code: "quota-exceeded",
        retryable: false,
        localSafe: true,
      },
    })
    expect(syncQueue.status(spaceId)).toMatchObject({
      state: "paused",
      attempt: 1,
      lastFailure: { code: "quota-exceeded" },
    })
    expect(await store.read(spaceId)).toMatchObject({
      state: "paused",
      lastFailure: { code: "quota-exceeded" },
    })
    await scheduler.advanceBy(60_000)
    expect(execute).toHaveBeenCalledTimes(1)

    const restored = await syncQueue.runNow(spaceId)

    expect(restored.ok).toBe(true)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(syncQueue.status(spaceId).state).toBe("idle")
    await expect(store.read(spaceId)).resolves.toBeNull()
    await syncQueue.close()
  })

  it("clears a paused local-changes failure after the worktree becomes clean", async () => {
    const execute = vi.fn().mockResolvedValue(localChanges())
    const syncQueue = queue()
    await syncQueue.attach({
      spaceId,
      execute,
      emit: (status) => statuses.push(status),
    })

    await syncQueue.runNow(spaceId)
    expect(syncQueue.status(spaceId)).toMatchObject({
      state: "paused",
      lastFailure: { code: "local-changes" },
    })

    const cleared = await syncQueue.clearResolvedFailure(
      spaceId,
      "local-changes"
    )

    expect(cleared.state).toBe("idle")
    await expect(store.read(spaceId)).resolves.toBeNull()
    expect(statuses.at(-1)?.state).toBe("idle")
    await syncQueue.close()
  })

  it("does not clear unrelated paused failures when the worktree changes", async () => {
    const execute = vi.fn().mockResolvedValue(quotaExceeded())
    const syncQueue = queue()
    await syncQueue.attach({
      spaceId,
      execute,
      emit: (status) => statuses.push(status),
    })

    await syncQueue.runNow(spaceId)
    const unchanged = await syncQueue.clearResolvedFailure(
      spaceId,
      "local-changes"
    )

    expect(unchanged).toMatchObject({
      state: "paused",
      lastFailure: { code: "quota-exceeded" },
    })
    await expect(store.read(spaceId)).resolves.toMatchObject({
      state: "paused",
      lastFailure: { code: "quota-exceeded" },
    })
    await syncQueue.close()
  })

  it("coalesces multiple pending checkpoints into one whole-Space run", async () => {
    const execute = vi.fn().mockResolvedValue(succeeded())
    const syncQueue = queue()
    await syncQueue.attach({
      spaceId,
      execute,
      emit: (status) => statuses.push(status),
    })

    await syncQueue.enqueue(spaceId, "local-checkpoint")
    await syncQueue.enqueue(spaceId, "local-checkpoint")
    await scheduler.advanceBy(0)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(syncQueue.status(spaceId).state).toBe("idle")
    await syncQueue.close()
  })

  it("recovers an interrupted running item without persisted credentials", async () => {
    await store.write(spaceId, {
      version: 1,
      state: "running",
      trigger: "manual",
      attempt: 1,
      queuedAtMs: 5_000,
    })
    const execute = vi.fn().mockResolvedValue(succeeded())
    const syncQueue = queue()

    const recovered = await syncQueue.attach({
      spaceId,
      execute,
      emit: (status) => statuses.push(status),
    })

    expect(recovered).toMatchObject({
      state: "pending",
      trigger: "crash-recovery",
      attempt: 1,
    })
    expect(
      await fs.readFile(
        path.join(directory, "spaces", spaceId, "sync-queue.json"),
        "utf8"
      )
    ).not.toContain("token")
    await scheduler.advanceBy(0)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(syncQueue.status(spaceId).state).toBe("idle")
    await syncQueue.close()
  })
})
