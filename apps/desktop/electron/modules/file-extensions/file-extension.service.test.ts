// @vitest-environment node

import "reflect-metadata"

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainWindowProvider } from "../space-management/main-window.provider"
import type { SpaceRegistry } from "../space-management/space-registry"

vi.mock("electron", () => ({
  app: { getVersion: () => "0.33.0" },
}))

const roots: string[] = []

async function createFileSpace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
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
      permissions: {
        files: { read: ["**/*.md"], write: [] },
        network: [],
      },
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

describe("FileExtensionService", () => {
  it("returns sanitized, inspection-only discovery for a file Space", async () => {
    const root = await createFileSpace()
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(registry, windowProvider)

    const result = await service.discover("space-a")

    expect(result).toMatchObject({
      root: ".eidos/extensions",
      phase: "inspection-only",
      executionAvailable: false,
      hostVersion: "0.33.0",
      packages: [
        {
          directoryName: "example.task-counter",
          canonicalId: "example.task-counter",
          status: "ready",
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain(root)

    await expect(service.startWatching("space-a")).resolves.toMatchObject({
      watching: true,
      generation: 0,
    })
    expect(service.stopWatching("space-a")).toEqual({
      watching: false,
      generation: 0,
    })
  })

  it("rejects missing and legacy database Spaces before touching disk", async () => {
    const registry = {
      getSpace: vi.fn().mockReturnValueOnce(undefined).mockReturnValueOnce({
        id: "legacy",
        name: "Legacy",
        path: "/not/read",
        mode: "legacy",
      }),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(registry, windowProvider)

    await expect(service.discover("missing")).rejects.toThrow("Space not found")
    await expect(service.discover("legacy")).rejects.toThrow(
      "only available in file Spaces"
    )
  })

  it("creates a local template as real package files without overwriting", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
    roots.push(root)
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(registry, windowProvider)

    await expect(
      service.createTemplate("space-a", "hello-tools")
    ).resolves.toEqual({
      canonicalId: "local.hello-tools",
      root: ".eidos/extensions/local.hello-tools",
      files: ["extension.json", "src/extension.ts", "README.md"],
    })
    const packageRoot = path.join(
      root,
      ".eidos",
      "extensions",
      "local.hello-tools"
    )
    expect(
      JSON.parse(
        await readFile(path.join(packageRoot, "extension.json"), "utf8")
      )
    ).toMatchObject({
      publisher: "local",
      name: "hello-tools",
      engines: { eidos: ">=0.33.0" },
    })
    expect(
      await readFile(path.join(packageRoot, "src", "extension.ts"), "utf8")
    ).toContain("local.hello-tools.hello")
    await expect(service.discover("space-a")).resolves.toMatchObject({
      packages: [
        {
          canonicalId: "local.hello-tools",
          status: "ready",
        },
      ],
    })
    await expect(
      service.createTemplate("space-a", "hello-tools")
    ).rejects.toThrow("already exists")
    await expect(service.createTemplate("space-a", "Bad Name")).rejects.toThrow(
      "Extension name"
    )
  })

  it("serializes concurrent creation of the same package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
    roots.push(root)
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(registry, windowProvider)

    const results = await Promise.allSettled([
      service.createTemplate("space-a", "same-name"),
      service.createTemplate("space-a", "same-name"),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
  })

  it("rejects an extensions path that escapes through .eidos", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
    const outside = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
    roots.push(root, outside)
    await mkdir(path.join(outside, "extensions"))
    await symlink(outside, path.join(root, ".eidos"), "dir")
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(registry, windowProvider)

    await expect(service.discover("space-a")).rejects.toThrow("symbolic link")
    await expect(service.startWatching("space-a")).resolves.toMatchObject({
      watching: false,
      reason: "invalid-root",
    })
    await expect(
      service.createTemplate("space-a", "hello-tools")
    ).rejects.toThrow("symbolic link")
  })
})
