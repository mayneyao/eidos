// @vitest-environment node

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { SyncService } from "./sync.service"

vi.mock("../../common/di", () => ({
  Inject: () => () => undefined,
  IpcInjectable: () => (target: unknown) => target,
}))
vi.mock("../data-space", () => ({ DataSpaceManager: class {} }))
vi.mock("../space-management/space-registry", () => ({
  SpaceRegistry: class {},
}))
vi.mock("../space-versioning/graft-runner", () => ({ GraftRunner: class {} }))
vi.mock("./credentials", () => ({ CredentialsManager: class {} }))
vi.mock("./official-graft-remote", () => ({
  EidosSyncError: class EidosSyncError extends Error {
    constructor(
      message: string,
      readonly status: number
    ) {
      super(message)
    }
  },
  OfficialGraftRemoteService: class {},
}))

const temporaryPaths: string[] = []

afterEach(() => {
  for (const temporaryPath of temporaryPaths.splice(0)) {
    fs.rmSync(temporaryPath, { recursive: true, force: true })
  }
})

describe("SyncService.cloneSpace", () => {
  it("clones a File Space into the selected folder root", async () => {
    const parentPath = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-clone-"))
    temporaryPaths.push(parentPath)
    const localPath = path.join(parentPath, "notes")
    fs.mkdirSync(localPath)

    const remoteUrl = "https://sync.eidos.space/u-alice/notes"
    const registry = {
      registerSpace: vi.fn().mockReturnValue({
        id: "notes",
        name: "Notes",
        path: localPath,
        mode: "file",
      }),
      removeSpace: vi.fn(),
    }
    const dataSpaceManager = { getOrSetDataSpace: vi.fn() }
    const graftRunner = {
      runRemoteJson: vi.fn(async (clonePath: string) => {
        fs.mkdirSync(path.join(clonePath, ".graft"))
        fs.writeFileSync(path.join(clonePath, "Untitled.md"), "hello")
        return { operation: "clone" }
      }),
    }
    const service = new SyncService(
      {} as never,
      {
        listRepositories: vi.fn().mockResolvedValue({
          namespace: "u-alice",
          repositories: [{ name: "notes", remoteUrl }],
        }),
      } as never,
      registry as never,
      dataSpaceManager as never,
      graftRunner as never
    )

    const result = await service.cloneSpace({
      localPath,
      repository: "notes",
    } as never)

    expect(result.success).toBe(true)
    expect(graftRunner.runRemoteJson).toHaveBeenCalledWith(expect.any(String), [
      "clone",
      "--json",
      remoteUrl,
    ])
    expect(fs.existsSync(path.join(localPath, ".graft"))).toBe(true)
    expect(fs.readFileSync(path.join(localPath, "Untitled.md"), "utf8")).toBe(
      "hello"
    )
    expect(fs.existsSync(path.join(localPath, ".eidos"))).toBe(false)
    expect(registry.registerSpace).toHaveBeenCalledWith(localPath, {
      customName: "notes",
      remoteUrl,
      provider: "eidos.space",
      mode: "file",
    })
    expect(dataSpaceManager.getOrSetDataSpace).not.toHaveBeenCalled()
  })

  it("keeps the legacy SQLite clone flow under .eidos", async () => {
    const localPath = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-legacy-"))
    temporaryPaths.push(localPath)
    const remoteUrl = "https://sync.eidos.space/u-alice/legacy"
    const registry = {
      registerSpace: vi.fn().mockReturnValue({
        id: "legacy",
        name: "Legacy",
        path: localPath,
        mode: "legacy",
      }),
      removeSpace: vi.fn(),
    }
    const dataSpaceManager = {
      getOrSetDataSpace: vi.fn().mockResolvedValue({}),
    }
    const graftRunner = { runRemoteJson: vi.fn() }
    const service = new SyncService(
      {} as never,
      {
        listRepositories: vi.fn().mockResolvedValue({
          namespace: "u-alice",
          repositories: [{ name: "legacy", remoteUrl }],
        }),
      } as never,
      registry as never,
      dataSpaceManager as never,
      graftRunner as never
    )

    const result = await service.cloneSpace({
      localPath,
      repository: "legacy",
      mode: "legacy",
    })

    expect(result.success).toBe(true)
    expect(registry.registerSpace).toHaveBeenCalledWith(localPath, {
      customName: "legacy",
      remoteUrl,
      provider: "eidos.space",
      mode: "legacy",
    })
    expect(dataSpaceManager.getOrSetDataSpace).toHaveBeenCalledWith("legacy", {
      enabled: true,
      remote: remoteUrl,
      requireRemoteClone: true,
    })
    expect(graftRunner.runRemoteJson).not.toHaveBeenCalled()
  })

  it("refuses to clone a File Space over existing files", async () => {
    const localPath = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-nonempty-"))
    temporaryPaths.push(localPath)
    fs.writeFileSync(path.join(localPath, "keep.md"), "do not replace")
    const registry = { registerSpace: vi.fn(), removeSpace: vi.fn() }
    const dataSpaceManager = { getOrSetDataSpace: vi.fn() }
    const graftRunner = { runRemoteJson: vi.fn() }
    const service = new SyncService(
      {} as never,
      {
        listRepositories: vi.fn().mockResolvedValue({
          namespace: "u-alice",
          repositories: [
            {
              name: "notes",
              remoteUrl: "https://sync.eidos.space/u-alice/notes",
            },
          ],
        }),
      } as never,
      registry as never,
      dataSpaceManager as never,
      graftRunner as never
    )

    const result = await service.cloneSpace({
      localPath,
      repository: "notes",
      mode: "file",
    })

    expect(result).toMatchObject({ success: false })
    expect(result.error).toContain("require an empty folder")
    expect(fs.readFileSync(path.join(localPath, "keep.md"), "utf8")).toBe(
      "do not replace"
    )
    expect(registry.registerSpace).not.toHaveBeenCalled()
    expect(graftRunner.runRemoteJson).not.toHaveBeenCalled()
  })

  it("cleans a failed File Space clone without touching the selected folder", async () => {
    const parentPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "eidos-clone-failure-")
    )
    temporaryPaths.push(parentPath)
    const localPath = path.join(parentPath, "notes")
    fs.mkdirSync(localPath)
    const registry = {
      registerSpace: vi.fn().mockReturnValue({
        id: "notes",
        name: "Notes",
        path: localPath,
        mode: "file",
      }),
      removeSpace: vi.fn(),
    }
    const graftRunner = {
      runRemoteJson: vi.fn(async (clonePath: string) => {
        fs.writeFileSync(path.join(clonePath, "partial"), "partial")
        throw new Error("remote temporarily unavailable")
      }),
    }
    const service = new SyncService(
      {} as never,
      {
        listRepositories: vi.fn().mockResolvedValue({
          namespace: "u-alice",
          repositories: [
            {
              name: "notes",
              remoteUrl: "https://sync.eidos.space/u-alice/notes",
            },
          ],
        }),
      } as never,
      registry as never,
      { getOrSetDataSpace: vi.fn() } as never,
      graftRunner as never
    )

    const result = await service.cloneSpace({
      localPath,
      repository: "notes",
      mode: "file",
    })

    expect(result).toMatchObject({
      success: false,
      error: "remote temporarily unavailable",
    })
    expect(fs.existsSync(localPath)).toBe(true)
    expect(fs.readdirSync(localPath)).toEqual([])
    expect(
      fs
        .readdirSync(parentPath)
        .some((entry) => entry.startsWith(".eidos-file-clone-"))
    ).toBe(false)
    expect(registry.removeSpace).toHaveBeenCalledWith("notes")
  })
})
