// @vitest-environment node

import "reflect-metadata"

import { describe, expect, it, vi } from "vitest"

import type { MainWindowProvider } from "../space-management/main-window.provider"
import type { SpaceRegistry } from "../space-management/space-registry"
import type { OfficialGraftRemoteService } from "../sync/official-graft-remote"
import type { SpaceVersioningCoordinator } from "./space-versioning.coordinator"
import { SpaceVersioningService } from "./space-versioning.service"

vi.mock("electron", () => ({}))
vi.mock("@eidos.space/electron-ipc", () => ({
  IpcServiceBase: class IpcServiceBase {},
}))
vi.mock("../space-management/main-window.provider", () => ({
  MainWindowProvider: class MainWindowProvider {},
}))
vi.mock("./space-versioning.coordinator", () => ({
  SpaceVersioningCoordinator: class SpaceVersioningCoordinator {},
}))
vi.mock("../../common/di", () => ({
  Inject: () => () => undefined,
  Injectable: () => (target: unknown) => target,
  IpcInjectable: () => (target: unknown) => target,
}))

describe("SpaceVersioningService file notifications", () => {
  it("rescans open files after version operations replace Space content", async () => {
    const send = vi.fn()
    const coordinator = {
      pullRemote: vi.fn().mockResolvedValue({ operation: "pull" }),
      resolveConflict: vi.fn().mockResolvedValue({ path: "notes/today.md" }),
      discardPath: vi.fn().mockResolvedValue({ path: "projects" }),
      restorePath: vi.fn().mockResolvedValue({ path: "records/tasks.eidos" }),
      restoreVersion: vi
        .fn()
        .mockResolvedValue({ restoredPaths: ["records/tasks.eidos"] }),
    } as unknown as SpaceVersioningCoordinator
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const registry = {
      getSpace: () => ({
        sync: {
          enabled: true,
          remote: "https://sync.eidos.space/u-space/space-a",
        },
      }),
    } as unknown as SpaceRegistry
    const officialRemote = {} as OfficialGraftRemoteService
    const service = new SpaceVersioningService(
      coordinator,
      windowProvider,
      registry,
      officialRemote
    )

    await service.pullRemote("space-a")
    await service.resolveConflict("space-a", {
      path: "notes/today.md",
      resolution: "ours",
      expectedHead: "head-1",
    })
    await service.discardPath("space-a", {
      path: "projects",
      expectedHead: "head-1",
      confirmed: true,
    })
    await service.restorePath("space-a", {
      revision: "commit-1",
      path: "records/tasks.eidos",
      expectedHead: "head-1",
    })
    await service.restoreVersion("space-a", {
      revision: "commit-1",
      expectedHead: "head-1",
    })

    expect(send.mock.calls).toEqual([
      [
        "space-files:changed",
        { spaceId: "space-a", eventType: "rescan", path: "" },
      ],
      [
        "space-files:changed",
        {
          spaceId: "space-a",
          eventType: "rescan",
          path: "notes/today.md",
        },
      ],
      [
        "space-files:changed",
        {
          spaceId: "space-a",
          eventType: "rescan",
          path: "projects",
        },
      ],
      [
        "space-files:changed",
        {
          spaceId: "space-a",
          eventType: "rescan",
          path: "records/tasks.eidos",
        },
      ],
      [
        "space-files:changed",
        { spaceId: "space-a", eventType: "rescan", path: "" },
      ],
    ])
  })

  it("provisions, stores, and initializes a newly created official remote", async () => {
    const coordinator = {
      configureRemote: vi.fn().mockResolvedValue({
        remote: {
          name: "origin",
          url: "graft+https://sync.eidos.space/u-space/space-a",
        },
        status: { enabled: true, currentHead: "head-1" },
      }),
      pushRemote: vi.fn().mockResolvedValue({
        status: { enabled: true, currentHead: "head-1", ahead: 0 },
      }),
      fetchRemote: vi.fn(),
    } as unknown as SpaceVersioningCoordinator
    const officialRemote = {
      provisionRepository: vi.fn().mockResolvedValue({
        created: true,
        remoteUrl: "graft+https://sync.eidos.space/u-space/space-a",
      }),
    } as unknown as OfficialGraftRemoteService
    const service = new SpaceVersioningService(
      coordinator,
      { getWindow: vi.fn() } as unknown as MainWindowProvider,
      { getSpace: vi.fn() } as unknown as SpaceRegistry,
      officialRemote
    )

    const result = await service.configureRemote("space-a", {
      url: "https://attacker.invalid/token",
      branch: "main",
    })

    expect(officialRemote.provisionRepository).toHaveBeenCalledWith("space-a")
    expect(coordinator.configureRemote).toHaveBeenCalledWith("space-a", {
      name: "origin",
      branch: "main",
      url: "graft+https://sync.eidos.space/u-space/space-a",
    })
    expect(coordinator.pushRemote).toHaveBeenCalledWith("space-a", {
      remote: "origin",
      branch: "main",
      expectedHead: "head-1",
    })
    expect(coordinator.fetchRemote).not.toHaveBeenCalled()
    expect(result.status).toMatchObject({ currentHead: "head-1", ahead: 0 })
  })

  it("fetches instead of blindly pushing when reconnecting an existing official remote", async () => {
    const coordinator = {
      configureRemote: vi.fn().mockResolvedValue({
        remote: {
          name: "origin",
          url: "https://sync.eidos.space/u-space/space-a",
        },
        status: { enabled: true, currentHead: "head-1" },
      }),
      fetchRemote: vi.fn().mockResolvedValue({
        status: { enabled: true, currentHead: "head-1", behind: 1 },
      }),
      pushRemote: vi.fn(),
    } as unknown as SpaceVersioningCoordinator
    const officialRemote = {
      provisionRepository: vi.fn().mockResolvedValue({
        created: false,
        remoteUrl: "https://sync.eidos.space/u-space/space-a",
      }),
    } as unknown as OfficialGraftRemoteService
    const service = new SpaceVersioningService(
      coordinator,
      { getWindow: vi.fn() } as unknown as MainWindowProvider,
      { getSpace: vi.fn() } as unknown as SpaceRegistry,
      officialRemote
    )

    const result = await service.configureRemote("space-a", { branch: "main" })

    expect(coordinator.fetchRemote).toHaveBeenCalledWith("space-a", {
      remote: "origin",
      branch: "main",
      expectedHead: "head-1",
    })
    expect(coordinator.pushRemote).not.toHaveBeenCalled()
    expect(result.status).toMatchObject({ behind: 1 })
  })

  it("initializes an already provisioned remote when its branch is still empty", async () => {
    const coordinator = {
      configureRemote: vi.fn().mockResolvedValue({
        remote: {
          name: "origin",
          url: "https://sync.eidos.space/u-space/space-a",
        },
        status: { enabled: true, currentHead: "head-1" },
      }),
      fetchRemote: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Eidos Sync has no versions yet. Push versions to initialize the remote branch."
          )
        ),
      pushRemote: vi.fn().mockResolvedValue({
        status: { enabled: true, currentHead: "head-1", ahead: 0 },
      }),
    } as unknown as SpaceVersioningCoordinator
    const officialRemote = {
      provisionRepository: vi.fn().mockResolvedValue({
        created: false,
        remoteUrl: "https://sync.eidos.space/u-space/space-a",
      }),
    } as unknown as OfficialGraftRemoteService
    const service = new SpaceVersioningService(
      coordinator,
      { getWindow: vi.fn() } as unknown as MainWindowProvider,
      { getSpace: vi.fn() } as unknown as SpaceRegistry,
      officialRemote
    )

    const result = await service.configureRemote("space-a", { branch: "main" })

    expect(coordinator.pushRemote).toHaveBeenCalledWith("space-a", {
      remote: "origin",
      branch: "main",
      expectedHead: "head-1",
    })
    expect(result.status).toMatchObject({ ahead: 0 })
  })
})
