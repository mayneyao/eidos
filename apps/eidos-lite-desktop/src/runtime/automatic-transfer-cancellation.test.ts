import {
  AutomaticTransferCancellation,
  AUTOMATIC_TRANSFER_CANCEL_GRACE_MS,
} from "./automatic-transfer-cancellation"

describe("utility-owned automatic transfer cancellation", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("seals admission and exits only after the grace period with no other active request", async () => {
    const exit = vi.fn()
    const policy = new AutomaticTransferCancellation(exit)
    policy.start({
      requestId: 1,
      type: "command",
      command: "fetchForCheckout",
      args: [],
      automaticTransfer: true,
    })
    policy.cancel(1)
    expect(() =>
      policy.start({
        requestId: 2,
        type: "command",
        command: "applyMerge",
        args: [],
      })
    ).toThrow("cancelling")
    expect(() =>
      policy.start({ requestId: 3, type: "open", root: "/tmp/other" })
    ).toThrow("cancelling")
    await vi.advanceTimersByTimeAsync(AUTOMATIC_TRANSFER_CANCEL_GRACE_MS - 1)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(exit).toHaveBeenCalledOnce()
    policy.finish(1)
    expect(() =>
      policy.start({
        requestId: 4,
        type: "command",
        command: "applyMerge",
        args: [],
      })
    ).toThrow("cancelling")
  })

  it.each(["applyMerge", "commit", "addAll", "unlockEncryptedSync"] as const)(
    "never exits while another %s is active",
    async (command) => {
      const exit = vi.fn()
      const policy = new AutomaticTransferCancellation(exit)
      policy.start({ requestId: 1, type: "command", command, args: [] })
      policy.start({
        requestId: 2,
        type: "command",
        command: "push",
        args: [],
        automaticTransfer: true,
      })
      policy.cancel(2)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(exit).not.toHaveBeenCalled()
      policy.finish(1)
      expect(exit).toHaveBeenCalledOnce()
    }
  )

  it("ignores late cancellation after fetch completed and cannot retire its successor", async () => {
    const exit = vi.fn()
    const policy = new AutomaticTransferCancellation(exit)
    policy.start({
      requestId: 1,
      type: "command",
      command: "fetch",
      args: [],
      automaticTransfer: true,
    })
    policy.finish(1)
    policy.start({
      requestId: 2,
      type: "command",
      command: "applyMerge",
      args: [],
    })
    policy.cancel(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(exit).not.toHaveBeenCalled()
  })

  it("clears the retirement seal when cooperative cancellation completes", async () => {
    const exit = vi.fn()
    const policy = new AutomaticTransferCancellation(exit)
    policy.start({
      requestId: 1,
      type: "command",
      command: "fetch",
      args: [],
      automaticTransfer: true,
    })
    policy.cancel(1)
    policy.finish(1)
    expect(() =>
      policy.start({
        requestId: 2,
        type: "command",
        command: "commit",
        args: [],
      })
    ).not.toThrow()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(exit).not.toHaveBeenCalled()
  })

  it("rejects mislabelled local mutations and leaves manual transfers cooperative", async () => {
    const exit = vi.fn()
    const policy = new AutomaticTransferCancellation(exit)
    expect(() =>
      policy.start({
        requestId: 1,
        type: "command",
        command: "applyMerge",
        args: [],
        automaticTransfer: true,
      })
    ).toThrow("network-only")
    policy.start({ requestId: 2, type: "command", command: "fetch", args: [] })
    policy.cancel(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(exit).not.toHaveBeenCalled()
  })
})
