// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

const officialRemote = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}))

vi.mock("../../common/di", () => ({
  Inject: () => () => undefined,
  Injectable: () => (target: unknown) => target,
  container: { get: () => officialRemote },
}))
vi.mock("electron-log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}))

const { DataSpaceManager } = await import("./data-space-manager.service")

describe("DataSpaceManager official remote boundary", () => {
  beforeEach(() => {
    officialRemote.getAccessToken.mockReset().mockResolvedValue("oauth-token")
    officialRemote.refreshAccessToken.mockReset()
  })

  it("injects the ephemeral token into root and namespaced remote calls", async () => {
    const pull = vi.fn().mockResolvedValue({ operation: "pull" })
    const executePayload = vi.fn().mockResolvedValue({ operation: "fetch" })
    const manager = new DataSpaceManager({} as never)
    const wrapped = (manager as any).withAuthenticatedRemoteCalls({
      pull,
      _executePayload: executePayload,
    })

    await wrapped.pull("renderer-supplied-token")
    await wrapped._executePayload({
      method: "graft.fetch",
      params: ["renderer-supplied-token"],
    })

    expect(pull).toHaveBeenCalledWith("oauth-token")
    expect(executePayload).toHaveBeenCalledWith({
      method: "graft.fetch",
      params: ["oauth-token"],
    })
  })

  it("rejects arbitrary remotes before retrieving or forwarding a token", async () => {
    const convertToGraft = vi.fn()
    const manager = new DataSpaceManager({} as never)
    const wrapped = (manager as any).withAuthenticatedRemoteCalls({
      convertToGraft,
    })

    expect(() =>
      wrapped.convertToGraft("https://attacker.invalid/repository")
    ).toThrow("provisioned Eidos Sync URL")
    expect(officialRemote.getAccessToken).not.toHaveBeenCalled()
    expect(convertToGraft).not.toHaveBeenCalled()
  })

  it("refreshes a Legacy remote token once after 401", async () => {
    officialRemote.refreshAccessToken.mockResolvedValue("fresh-token")
    const pull = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP remote returned 401"))
      .mockResolvedValueOnce({ operation: "pull" })
    const manager = new DataSpaceManager({} as never)
    const wrapped = (manager as any).withAuthenticatedRemoteCalls({ pull })

    await expect(wrapped.pull()).resolves.toEqual({ operation: "pull" })
    expect(pull).toHaveBeenNthCalledWith(1, "oauth-token")
    expect(pull).toHaveBeenNthCalledWith(2, "fresh-token")
    expect(officialRemote.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it("does not retry a Legacy CAS conflict", async () => {
    const pull = vi.fn().mockRejectedValue(new Error("HTTP 409 conflict"))
    const manager = new DataSpaceManager({} as never)
    const wrapped = (manager as any).withAuthenticatedRemoteCalls({ pull })

    await expect(wrapped.pull()).rejects.toThrow("changed concurrently")
    expect(pull).toHaveBeenCalledTimes(1)
    expect(officialRemote.refreshAccessToken).not.toHaveBeenCalled()
  })
})
