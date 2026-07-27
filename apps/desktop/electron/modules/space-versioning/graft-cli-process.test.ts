// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock("node:child_process", () => ({ execFile: execFileMock }))

const { GraftCliProcess } = await import("./graft-cli-process")

describe("GraftCliProcess remote authentication", () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })

  it("passes an OAuth token only through GRAFT_REMOTE_TOKEN", async () => {
    execFileMock
      .mockImplementationOnce(
        (
          _file: string,
          _args: string[],
          _options: unknown,
          callback: Function
        ) => callback(null, "graft-tool 0.8.1\n", "")
      )
      .mockImplementationOnce(
        (_file: string, args: string[], options: any, callback: Function) => {
          expect(args).toEqual(["fetch", "--json"])
          expect(options.env.GRAFT_REMOTE_TOKEN).toBe("ephemeral-token")
          callback(null, '{"operation":"fetch"}\n', "")
        }
      )

    const process = new GraftCliProcess("/fixture/graft")
    await expect(
      process.runJson("/fixture/repository", ["fetch", "--json"], {
        remoteToken: "ephemeral-token",
      })
    ).resolves.toEqual({ operation: "fetch" })
  })

  it("redacts the token from CLI failures", async () => {
    execFileMock
      .mockImplementationOnce(
        (
          _file: string,
          _args: string[],
          _options: unknown,
          callback: Function
        ) => callback(null, "graft-tool 0.8.1\n", "")
      )
      .mockImplementationOnce(
        (
          _file: string,
          _args: string[],
          _options: unknown,
          callback: Function
        ) =>
          callback(
            Object.assign(new Error("failed with super-secret"), { code: 1 }),
            "",
            "authorization super-secret rejected with HTTP 401"
          )
      )

    const process = new GraftCliProcess("/fixture/graft")
    const failure = process.runJson(
      "/fixture/repository",
      ["fetch", "--json"],
      { remoteToken: "super-secret" }
    )
    await expect(failure).rejects.toThrow(
      "authorization [redacted] rejected with HTTP 401"
    )
    await expect(failure).rejects.not.toThrow("super-secret")
  })
})
