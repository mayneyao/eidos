import { describe, expect, it, vi } from "vitest"
import { AutomaticMaterializationCoordinator } from "./automatic-materialization"
import { IPC_CHANNELS } from "../../shared/contracts"

describe("automatic materialization renderer admission", () => {
  it("waits for the exact owner/token confirmation before allowing apply and releases only explicitly", async () => {
    const coordinator = new AutomaticMaterializationCoordinator()
    const owner = { id: 1, isDestroyed: () => false, send: vi.fn() }
    let admitted = false
    const preparing = coordinator
      .prepare(owner, "space", new AbortController().signal)
      .then((release) => {
        admitted = true
        return release
      })
    const token = owner.send.mock.calls[0]![1]
    expect(owner.send).toHaveBeenCalledWith(
      IPC_CHANNELS.syncPrepareMaterialization,
      token,
      "space"
    )
    coordinator.reply(2, token, true)
    coordinator.reply(1, "old token", true)
    await Promise.resolve()
    expect(admitted).toBe(false)
    coordinator.reply(1, token, true)
    const release = await preparing
    expect(admitted).toBe(true)
    expect(owner.send).toHaveBeenCalledTimes(1)
    release()
    expect(owner.send).toHaveBeenLastCalledWith(
      IPC_CHANNELS.syncReleaseMaterialization,
      token
    )
    release()
    expect(owner.send).toHaveBeenCalledTimes(2)
  })

  it("never admits a dirty renderer and releases its attempted token", async () => {
    const coordinator = new AutomaticMaterializationCoordinator()
    const owner = { id: 1, isDestroyed: () => false, send: vi.fn() }
    const preparing = coordinator.prepare(
      owner,
      "space",
      new AbortController().signal
    )
    const token = owner.send.mock.calls[0]![1]
    coordinator.reply(1, token, false)
    await expect(preparing).rejects.toMatchObject({ name: "AbortError" })
    expect(owner.send).toHaveBeenLastCalledWith(
      IPC_CHANNELS.syncReleaseMaterialization,
      token
    )
  })

  it("cancels a pending handshake and makes late replies harmless", async () => {
    const coordinator = new AutomaticMaterializationCoordinator()
    const owner = { id: 1, isDestroyed: () => false, send: vi.fn() }
    const controller = new AbortController()
    const preparing = coordinator.prepare(owner, "space", controller.signal)
    const token = owner.send.mock.calls[0]![1]
    controller.abort()
    await expect(preparing).rejects.toMatchObject({ name: "AbortError" })
    coordinator.reply(1, token, true)
    expect(owner.send).toHaveBeenLastCalledWith(
      IPC_CHANNELS.syncReleaseMaterialization,
      token
    )
  })
})
