import { SyncSessionLifecycle } from "./sync-session-lifecycle"

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
