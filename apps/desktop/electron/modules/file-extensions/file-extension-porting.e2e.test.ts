// @vitest-environment node

import "reflect-metadata"

import { mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createLegacyPortingProject } from "@eidos.space/extension-cli"
import type { LegacyExtension } from "@eidos.space/legacy-space-migration"
import { exportLegacyExtensionArchive } from "@eidos.space/legacy-space-migration/better-sqlite3"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainWindowProvider } from "../space-management/main-window.provider"
import type { SpaceRegistry } from "../space-management/space-registry"
import type { FileExtensionRuntimeManager } from "./runtime/file-extension-runtime-manager"

vi.mock("electron", () => ({
  app: { getVersion: () => "0.33.0" },
}))

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("legacy extension porting delivery", () => {
  it("archives, ports, installs, links, enables, and executes one command", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-porting-e2e-"))
    roots.push(root)
    const spaceRoot = path.join(root, "space")
    const archiveRoot = path.join(root, "archive")
    const portsRoot = path.join(root, "ports")
    await mkdir(spaceRoot, { recursive: true })
    const legacy: LegacyExtension = {
      id: "legacy-task-counter",
      slug: "task-counter",
      name: "Task Counter",
      description: "Counts legacy tasks",
      type: "script",
      version: "0.1.0",
      code: "exports.activate = () => undefined\n",
      tsCode: "export const activate = () => undefined\n",
      metaJson: JSON.stringify({ type: "docAction" }),
      icon: null,
      marketplaceId: null,
      enabled: true,
      bindingsJson: null,
      createdAt: null,
      updatedAt: null,
    }

    const archive = await exportLegacyExtensionArchive(legacy, {
      targetDirectory: archiveRoot,
    })
    const port = await createLegacyPortingProject({
      archiveRoot,
      publisher: "example",
      outDir: portsRoot,
    })
    expect(port.portingReceipt.source.archiveDigest).toBe(archive.archiveDigest)

    await rename(
      port.draftManifestPath,
      path.join(port.packageRoot, "extension.json")
    )
    const extensionsRoot = path.join(spaceRoot, ".eidos", "extensions")
    await mkdir(extensionsRoot, { recursive: true })
    const installedRoot = path.join(extensionsRoot, port.canonicalId)
    await rename(port.packageRoot, installedRoot)

    const execute = vi.fn().mockResolvedValue(undefined)
    const runtimeManager = {
      execute,
      disposePackage: vi.fn(),
      disposeSpace: vi.fn(),
      disposeAll: vi.fn(),
      has: vi.fn(() => false),
    } as unknown as FileExtensionRuntimeManager
    const registry = {
      getSpace: vi.fn(() => ({
        id: "ported-space",
        name: "Ported Space",
        path: spaceRoot,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManager
    )

    const discovered = (await service.discover("ported-space")).packages[0]!
    expect(discovered).toMatchObject({
      canonicalId: "example.task-counter",
      status: "ready",
      lifecycleStatus: "untrusted",
      legacyPorting: {
        valid: true,
        receipt: {
          source: {
            legacyExtensionId: "legacy-task-counter",
            archiveDigest: archive.archiveDigest,
          },
        },
      },
    })
    const snapshot = {
      packageId: discovered.canonicalId!,
      contentDigest: discovered.contentDigest!,
      permissionHash: discovered.permissionHash!,
    }
    await expect(
      service.confirmLegacyPorting("ported-space", snapshot)
    ).resolves.toMatchObject({
      active: true,
      legacyExtensionId: "legacy-task-counter",
      canonicalPackageId: "example.task-counter",
      archiveDigest: archive.archiveDigest,
    })
    await service.trust("ported-space", snapshot)
    await service.setEnabled("ported-space", snapshot, true)

    const commands = await service.listCommands("ported-space")
    expect(commands).toMatchObject([
      {
        id: "example.task-counter.hello",
        packageId: "example.task-counter",
      },
    ])
    await service.executeCommand("ported-space", {
      ...snapshot,
      commandId: commands[0]!.id,
      resource: { path: "" },
    })
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptor: expect.objectContaining({
          spaceId: "ported-space",
          snapshot,
          commandIds: ["example.task-counter.hello"],
          bundleCode: expect.stringContaining("Hello from Task Counter"),
        }),
      })
    )
  })
})
