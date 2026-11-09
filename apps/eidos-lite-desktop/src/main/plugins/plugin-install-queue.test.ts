import { expect, it, vi } from "vitest"
import { PluginInstallQueue } from "./plugin-install-queue"

it("deduplicates installs across callers and serializes reviews while retaining progress", async () => {
  const changed = vi.fn()
  const queue = new PluginInstallQueue(changed)
  let finish!: (value: boolean) => void
  const first = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  )
  const duplicate = vi.fn(async () => true)
  const second = vi.fn(async () => false)
  const work = queue.run("one", first, undefined, "preview-one")
  expect(queue.run("one", duplicate)).toBe(work)
  const next = queue.run("two", second)
  await Promise.resolve()
  queue.progress({ id: "one", phase: "downloading", percent: 45 })
  expect(queue.snapshot().one.percent).toBe(45)
  expect(queue.snapshot().one.packageToken).toBe("preview-one")
  expect(queue.snapshot().two.status).toBe("queued")
  expect(second).not.toHaveBeenCalled()
  finish(true)
  await expect(work).resolves.toBe(true)
  await expect(next).resolves.toBe(false)
  expect(duplicate).not.toHaveBeenCalled()
  expect(queue.snapshot().one.status).toBe("installed")
  expect(queue.snapshot().one.packageToken).toBe("preview-one")
  expect(queue.snapshot().two.status).toBe("cancelled")
})

it("retains failure details and allows a retry without blocking later installs", async () => {
  const queue = new PluginInstallQueue(() => {})
  await expect(
    queue.run("one", async () => {
      throw new Error("Offline")
    })
  ).rejects.toThrow("Offline")
  expect(queue.snapshot().one).toMatchObject({
    status: "failed",
    error: "Offline",
  })
  await expect(queue.run("two", async () => true)).resolves.toBe(true)
  await expect(queue.run("one", async () => true)).resolves.toBe(true)
  expect(queue.snapshot().one).toMatchObject({ status: "installed" })
  expect(queue.snapshot().one.error).toBeUndefined()
})

it("keeps requests for the same plugin in different Spaces separate", async () => {
  const queue = new PluginInstallQueue(() => {})
  let finish!: (installed: boolean) => void
  const first = queue.run(
    "plugin",
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
    "space-one"
  )
  const installSecond = vi.fn(async () => true)
  const second = queue.run("plugin", installSecond, "space-two")
  expect(second).not.toBe(first)
  await Promise.resolve()
  queue.progress(
    { id: "plugin", phase: "downloading", percent: 45 },
    "space-one"
  )
  expect(queue.snapshot("space-one").plugin.percent).toBe(45)
  expect(queue.snapshot("space-two").plugin.status).toBe("queued")
  finish(true)
  await first
  await second
  expect(installSecond).toHaveBeenCalledOnce()
  expect(queue.snapshot()).toEqual({})
})
