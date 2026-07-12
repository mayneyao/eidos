// @vitest-environment node

import "reflect-metadata"

import { describe, expect, it, vi } from "vitest"

import type { MainWindowProvider } from "../space-management/main-window.provider"
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
      restorePath: vi.fn().mockResolvedValue({ path: "records/tasks.base" }),
      restoreVersion: vi
        .fn()
        .mockResolvedValue({ restoredPaths: ["records/tasks.base"] }),
    } as unknown as SpaceVersioningCoordinator
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const service = new SpaceVersioningService(coordinator, windowProvider)

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
      path: "records/tasks.base",
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
          path: "records/tasks.base",
        },
      ],
      [
        "space-files:changed",
        { spaceId: "space-a", eventType: "rescan", path: "" },
      ],
    ])
  })
})
