import { EventEmitter } from "node:events"
import {
  bindSyncSessionLifecycle,
  SyncSessionLifecycle,
} from "./sync-session-lifecycle"

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture() {
  const hooks = {
    suspendAutomatic: vi.fn(),
    resumeAutomatic: vi.fn(),
    lockSessions: vi.fn(async () => {}),
    onError: vi.fn(),
  }
  return { hooks, lifecycle: new SyncSessionLifecycle(hooks) }
}

it.each(["active", "idle", "unknown"] as const)(
  "subscribes before checking initial %s state without suspending Sync",
  async (initialState) => {
    const { hooks, lifecycle } = fixture()
    const events = ["lock-screen", "suspend", "unlock-screen", "resume"]
    const powerMonitor = Object.assign(new EventEmitter(), {
      getSystemIdleState: vi.fn((_threshold: number) => {
        for (const event of events)
          expect(powerMonitor.listenerCount(event)).toBe(1)
        return initialState
      }),
    })
    const unbind = bindSyncSessionLifecycle(powerMonitor, lifecycle, "darwin")
    expect(powerMonitor.getSystemIdleState).toHaveBeenCalledWith(1)
    expect(hooks.suspendAutomatic).not.toHaveBeenCalled()
    expect(hooks.resumeAutomatic).not.toHaveBeenCalled()
    expect(hooks.lockSessions).not.toHaveBeenCalled()
    unbind()
    for (const event of events)
      expect(powerMonitor.listenerCount(event)).toBe(0)
    await lifecycle.close()
  }
)

it("does not resume an initially locked session when a second lock overtakes its drain", async () => {
  const { hooks, lifecycle } = fixture()
  const firstDrain = deferred()
  const secondDrain = deferred()
  hooks.lockSessions
    .mockReturnValueOnce(firstDrain.promise)
    .mockReturnValueOnce(secondDrain.promise)
  const powerMonitor = Object.assign(new EventEmitter(), {
    getSystemIdleState: () => "locked" as const,
  })
  const unbind = bindSyncSessionLifecycle(powerMonitor, lifecycle, "darwin")
  expect(hooks.suspendAutomatic).toHaveBeenCalledOnce()
  powerMonitor.emit("unlock-screen")
  powerMonitor.emit("lock-screen")
  firstDrain.resolve()
  await vi.waitFor(() => expect(hooks.lockSessions).toHaveBeenCalledTimes(2))
  expect(hooks.resumeAutomatic).not.toHaveBeenCalled()
  powerMonitor.emit("resume")
  secondDrain.resolve()
  await new Promise<void>((resolve) => setImmediate(resolve))
  expect(hooks.resumeAutomatic).not.toHaveBeenCalled()
  powerMonitor.emit("unlock-screen")
  await vi.waitFor(() => expect(hooks.resumeAutomatic).toHaveBeenCalledOnce())
  unbind()
  await lifecycle.close()
})

it("does not seed a Linux screen lock that has no matching unlock event, but handles sleep", async () => {
  const { hooks, lifecycle } = fixture()
  const powerMonitor = Object.assign(new EventEmitter(), {
    getSystemIdleState: vi.fn(() => "locked" as const),
  })
  const unbind = bindSyncSessionLifecycle(powerMonitor, lifecycle, "linux")
  expect(powerMonitor.getSystemIdleState).not.toHaveBeenCalled()
  expect(hooks.suspendAutomatic).not.toHaveBeenCalled()
  powerMonitor.emit("suspend")
  expect(hooks.suspendAutomatic).toHaveBeenCalledOnce()
  powerMonitor.emit("resume")
  await vi.waitFor(() => expect(hooks.resumeAutomatic).toHaveBeenCalledOnce())
  unbind()
  await lifecycle.close()
})

it("waits for in-flight lock before allowing remembered credentials after unlock", async () => {
  const { hooks, lifecycle } = fixture()
  const locked = deferred()
  hooks.lockSessions.mockReturnValueOnce(locked.promise)
  lifecycle.lockScreen()
  lifecycle.unlockScreen()
  await vi.waitFor(() => expect(hooks.lockSessions).toHaveBeenCalledOnce())
  expect(hooks.resumeAutomatic).not.toHaveBeenCalled()
  locked.resolve()
  await vi.waitFor(() => expect(hooks.resumeAutomatic).toHaveBeenCalledOnce())
})

it("does not resume on wake while the screen is still locked", async () => {
  const { hooks, lifecycle } = fixture()
  lifecycle.lockScreen()
  lifecycle.suspend()
  lifecycle.wake()
  await vi.waitFor(() => expect(hooks.lockSessions).toHaveBeenCalledTimes(2))
  expect(hooks.resumeAutomatic).not.toHaveBeenCalled()
  lifecycle.unlockScreen()
  await vi.waitFor(() => expect(hooks.resumeAutomatic).toHaveBeenCalledOnce())
})

it("discards a stale wake when another lock arrives", async () => {
  const { hooks, lifecycle } = fixture()
  const locked = deferred()
  hooks.lockSessions.mockReturnValueOnce(locked.promise)
  lifecycle.suspend()
  lifecycle.wake()
  lifecycle.lockScreen()
  locked.resolve()
  await vi.waitFor(() => expect(hooks.lockSessions).toHaveBeenCalledTimes(2))
  expect(hooks.resumeAutomatic).not.toHaveBeenCalled()
  lifecycle.unlockScreen()
  await vi.waitFor(() => expect(hooks.resumeAutomatic).toHaveBeenCalledOnce())
})

it("does not resume after a failed lock or after shutdown", async () => {
  const { hooks, lifecycle } = fixture()
  hooks.lockSessions.mockRejectedValueOnce(new Error("lock failed"))
  lifecycle.lockScreen()
  lifecycle.unlockScreen()
  await vi.waitFor(() => expect(hooks.onError).toHaveBeenCalledOnce())
  expect(hooks.resumeAutomatic).not.toHaveBeenCalled()
  await lifecycle.close()
  lifecycle.wake()
  expect(hooks.resumeAutomatic).not.toHaveBeenCalled()
})
