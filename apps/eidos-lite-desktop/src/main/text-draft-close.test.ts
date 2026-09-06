import { TextDraftCloseCoordinator } from "./text-draft-close"
import { IPC_CHANNELS } from "../shared/contracts"

describe("draft close IPC correlation", () => {
  it("cancels safely if the renderer disappears during send", async () => {
    const coordinator = new TextDraftCloseCoordinator()
    const owner = {
      id: 9,
      isDestroyed: () => false,
      send: () => {
        throw new Error("destroyed")
      },
    }
    expect(await coordinator.prepare(owner)).toBe(false)
    expect(() => coordinator.cancel(owner)).not.toThrow()
  })
  it("coalesces close requests and rejects other windows and stale replies", async () => {
    const coordinator = new TextDraftCloseCoordinator()
    const owner = { id: 1, isDestroyed: () => false, send: vi.fn() }
    const first = coordinator.prepare(owner)
    expect(coordinator.prepare(owner)).toBe(first)
    const token = owner.send.mock.calls[0]![1]
    coordinator.reply(2, token, true)
    coordinator.reply(1, "old-token", true)
    expect(coordinator.prepare(owner)).toBe(first)
    coordinator.reply(1, token, true)
    expect(await first).toBe(true)
    const second = coordinator.prepare(owner)
    coordinator.reply(1, token, true)
    coordinator.cancel(owner)
    expect(await second).toBe(false)
    expect(owner.send).toHaveBeenLastCalledWith(
      IPC_CHANNELS.textDraftReleaseClose
    )
  })

  it("fails closed on timeout", async () => {
    vi.useFakeTimers()
    try {
      const coordinator = new TextDraftCloseCoordinator()
      const result = coordinator.prepare({
        id: 1,
        isDestroyed: () => false,
        send: vi.fn(),
      })
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(await result).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
