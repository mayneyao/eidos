// @vitest-environment node

import { describe, expect, it, vi } from "vitest"

import { GraftRunner } from "./graft-runner"

vi.mock("../../common/di", () => ({
  Inject: () => () => undefined,
  Injectable: () => (target: unknown) => target,
}))

describe("GraftRunner official remote authentication", () => {
  it("refreshes once after a remote 401", async () => {
    const processRunner = {
      runJson: vi
        .fn()
        .mockRejectedValueOnce(new Error("remote returned 401"))
        .mockResolvedValueOnce({ operation: "fetch" }),
    }
    const officialRemote = {
      getAccessToken: vi.fn().mockResolvedValue("expired"),
      refreshAccessToken: vi.fn().mockResolvedValue("fresh"),
    }
    const runner = new GraftRunner(
      processRunner as never,
      officialRemote as never
    )

    await expect(
      runner.runRemoteJson("/repository", ["fetch", "--json"])
    ).resolves.toEqual({ operation: "fetch" })
    expect(processRunner.runJson).toHaveBeenNthCalledWith(
      1,
      "/repository",
      ["fetch", "--json"],
      { remoteToken: "expired" }
    )
    expect(processRunner.runJson).toHaveBeenNthCalledWith(
      2,
      "/repository",
      ["fetch", "--json"],
      { remoteToken: "fresh" }
    )
  })

  it("does not retry a CAS conflict", async () => {
    const processRunner = {
      runJson: vi.fn().mockRejectedValue(new Error("HTTP 409 conflict")),
    }
    const officialRemote = {
      getAccessToken: vi.fn().mockResolvedValue("token"),
      refreshAccessToken: vi.fn(),
    }
    const runner = new GraftRunner(
      processRunner as never,
      officialRemote as never
    )

    await expect(
      runner.runRemoteJson("/repository", ["push", "--json"])
    ).rejects.toThrow("Fetch the latest state")
    expect(processRunner.runJson).toHaveBeenCalledTimes(1)
    expect(officialRemote.refreshAccessToken).not.toHaveBeenCalled()
  })
})
