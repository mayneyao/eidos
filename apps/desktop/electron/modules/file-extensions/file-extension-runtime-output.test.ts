// @vitest-environment node

import "reflect-metadata"

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainWindowProvider } from "../space-management/main-window.provider"
import type { SpaceRegistry } from "../space-management/space-registry"
import { FileExtensionDocumentManager } from "./file-extension-document-manager"
import type {
  FileExtensionRuntimeExecution,
  FileExtensionRuntimeManager,
} from "./runtime/file-extension-runtime-manager"

vi.mock("electron", () => ({
  app: { getVersion: () => "0.33.0" },
}))

const roots: string[] = []

async function createFileSpace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-runtime-output-"))
  roots.push(root)
  const packageRoot = path.join(
    root,
    ".eidos",
    "extensions",
    "example.task-counter"
  )
  await mkdir(path.join(packageRoot, "src"), { recursive: true })
  await writeFile(
    path.join(packageRoot, "extension.json"),
    JSON.stringify({
      manifestVersion: 1,
      publisher: "example",
      name: "task-counter",
      displayName: "Task Counter",
      version: "1.0.0",
      engines: { eidos: ">=0.33.0 <1.0.0" },
      entrypoints: { worker: "src/extension.ts" },
      contributes: {
        commands: [{ id: "example.task-counter.count", title: "Count tasks" }],
      },
      permissions: { files: { read: [], write: [] }, network: [] },
    })
  )
  await writeFile(
    path.join(packageRoot, "src", "extension.ts"),
    "export const activate = () => undefined\n"
  )
  return root
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("FileExtensionService runtime output", () => {
  it("captures live console output, command failures, and clear events", async () => {
    const root = await createFileSpace()
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const send = vi.fn()
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const execute = vi.fn(async (execution: FileExtensionRuntimeExecution) => {
      execution.handleLog?.({
        type: "log",
        generation: "generation-1",
        level: "info",
        message: "Counted 3 tasks",
      })
    })
    const runtimeManager = {
      execute,
      disposePackage: vi.fn(),
      disposeSpace: vi.fn(),
      disposeAll: vi.fn(),
      has: vi.fn(() => false),
    } as unknown as FileExtensionRuntimeManager
    const documentManager = new FileExtensionDocumentManager(windowProvider)
    vi.spyOn(documentManager, "getRuntimeOutputTarget").mockReturnValue({
      packageId: "example.task-counter",
      generation: "surface-generation-1",
    })
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManager,
      undefined,
      documentManager
    )
    const extension = (await service.discover("space-a")).packages[0]!
    const snapshot = {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    }
    const request = {
      ...snapshot,
      commandId: "example.task-counter.count",
      resource: { path: "tasks.md" },
    }
    await service.trust("space-a", snapshot)
    await service.setEnabled("space-a", snapshot, true)

    await expect(service.executeCommand("space-a", request)).resolves.toEqual({
      success: true,
    })
    await expect(service.discover("space-a")).resolves.toMatchObject({
      packages: [
        {
          runtimeOutput: [{ level: "info", message: "Counted 3 tasks" }],
        },
      ],
    })
    expect(send).toHaveBeenCalledWith(
      "file-extensions:runtime-output",
      expect.objectContaining({
        spaceId: "space-a",
        packageId: "example.task-counter",
        entry: expect.objectContaining({
          level: "info",
          message: "Counted 3 tasks",
        }),
      })
    )

    expect(() =>
      service.reportSurfaceOutput("space-a", {
        surfaceKind: "file-editor",
        sessionId: "editor-session-1",
        viewId: "editor-view-1",
        generation: "stale-generation",
        level: "warn",
        message: "Stale surface output",
      })
    ).toThrow("stale generation")
    expect(
      service.reportSurfaceOutput("space-a", {
        surfaceKind: "file-editor",
        sessionId: "editor-session-1",
        viewId: "editor-view-1",
        generation: "surface-generation-1",
        level: "warn",
        message: "Task has no title",
      })
    ).toEqual({ success: true })

    vi.mocked(runtimeManager.execute).mockRejectedValueOnce(
      new Error("The task parser crashed")
    )
    await expect(service.executeCommand("space-a", request)).rejects.toThrow(
      "The task parser crashed"
    )
    await expect(service.discover("space-a")).resolves.toMatchObject({
      packages: [
        {
          runtimeOutput: [
            { level: "info", message: "Counted 3 tasks" },
            { level: "warn", message: "Task has no title" },
            {
              level: "error",
              message: "RUNTIME_COMMAND_FAILED: The task parser crashed",
            },
          ],
        },
      ],
    })

    expect(
      service.clearRuntimeOutput("space-a", "example.task-counter")
    ).toEqual({ success: true })
    await expect(service.discover("space-a")).resolves.toMatchObject({
      packages: [{ runtimeOutput: [] }],
    })
    expect(send).toHaveBeenLastCalledWith(
      "file-extensions:runtime-output",
      expect.objectContaining({
        spaceId: "space-a",
        packageId: "example.task-counter",
        cleared: true,
      })
    )
  })
})
