import { afterEach, beforeEach, expect, it, vi } from "vitest"

const child = vi.hoisted(() => ({
  failure: Object.assign(new Error("PowerShell exited with 1"), {
    code: 1,
    stderr: "Directory preparation diagnostic",
    cmd: "synthetic encoded command",
  }),
  execute: vi.fn(),
}))

vi.mock("node:child_process", () => ({ execFile: child.execute }))

import { windowsSyncSecretFiles } from "./windows-sync-secret-files"
import { verifyNativeWindowsSyncSecretFiles } from "./windows-sync-secret-files-test-support"

beforeEach(() => {
  vi.stubEnv(
    "SystemRoot",
    process.platform === "win32" ? "C:\\Windows" : "/Windows"
  )
  child.execute.mockImplementation(
    (
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error) => void
    ) => callback(child.failure)
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  child.execute.mockReset()
})

it("retains the PowerShell cause behind the safe storage error", async () => {
  const directory = process.platform === "win32" ? "C:\\private" : "/private"
  const failure = await windowsSyncSecretFiles
    .prepareDirectory(directory)
    .catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(Error)
  expect((failure as Error).message).toBe(
    "Windows Sync password storage could not be protected"
  )
  expect((failure as Error).cause).toBe(child.failure)
})

it.each(["PSModulePath", "PSMODULEPATH", "psmodulepath"])(
  "does not inherit %s from a PowerShell 7 parent",
  async (variable) => {
    const inherited = "C:\\Program Files\\PowerShell\\7\\Modules"
    vi.stubEnv(variable, inherited)
    const directory = process.platform === "win32" ? "C:\\private" : "/private"
    await expect(
      windowsSyncSecretFiles.prepareDirectory(directory)
    ).rejects.toThrow("Windows Sync password storage could not be protected")
    const options = child.execute.mock.calls[0]?.[2] as {
      env: NodeJS.ProcessEnv
    }
    expect(
      Object.keys(options.env).filter(
        (name) => name.toLowerCase() === "psmodulepath"
      )
    ).toEqual([])
    expect(options.env).toMatchObject({
      SystemRoot: process.env.SystemRoot,
      EIDOS_SYNC_SECRET_PATH: directory,
      EIDOS_SYNC_SECRET_OPERATION: "prepare-directory",
    })
    expect(process.env[variable]).toBe(inherited)
  }
)

it("reports only exit code and stderr when the native directory setup fails", async () => {
  const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {})
  await expect(verifyNativeWindowsSyncSecretFiles()).rejects.toMatchObject({
    cause: child.failure,
  })
  expect(diagnostic.mock.calls).toEqual([
    [
      "Windows Sync directory protection failed",
      { exitCode: 1, stderr: "Directory preparation diagnostic" },
    ],
  ])
  expect(child.execute).toHaveBeenCalledOnce()
})
