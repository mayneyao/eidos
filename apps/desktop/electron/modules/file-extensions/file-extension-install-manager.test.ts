// @vitest-environment node

import "reflect-metadata"

import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { PreparedExtensionInstall } from "@eidos.space/extension-installer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const prepareMock = vi.hoisted(() => vi.fn())
const commitMock = vi.hoisted(() => vi.fn())
const discardMock = vi.hoisted(() => vi.fn())
const uninstallMock = vi.hoisted(() => vi.fn())

vi.mock("@eidos.space/extension-installer/node", () => ({
  prepareGitHubExtensionInstall: prepareMock,
  commitPreparedExtensionInstall: commitMock,
  discardPreparedExtensionInstall: discardMock,
  uninstallExtensionPackage: uninstallMock,
}))

const roots: string[] = []
const contentDigest = `sha256:${"a".repeat(64)}`
const permissionHash = `sha256:${"b".repeat(64)}`

async function createSpace(): Promise<string> {
  const root = await mkdtemp(
    path.join(tmpdir(), "eidos-extension-install-manager-")
  )
  roots.push(root)
  await mkdir(path.join(root, ".eidos", "extensions"), { recursive: true })
  return root
}

function preparedFixture(): PreparedExtensionInstall {
  return {
    operation: "install",
    stagingRoot: "/private/staging/session",
    packageRoot: "/private/staging/session/example.task-counter",
    canonicalId: "example.task-counter",
    source: {
      kind: "github",
      repository: "https://github.com/example/task-counter",
      requested: "main",
      commit: "c".repeat(40),
    },
    lock: {
      lockVersion: 1,
      source: {
        kind: "github",
        repository: "https://github.com/example/task-counter",
        requested: "main",
        commit: "c".repeat(40),
      },
      contentDigest,
    },
    inspection: {
      packageRoot: "/private/staging/session/example.task-counter",
      directoryName: "example.task-counter",
      status: "ready",
      canonicalId: "example.task-counter",
      manifest: {
        manifestVersion: 1,
        publisher: "example",
        name: "task-counter",
        displayName: "Task Counter",
        version: "1.0.0",
        engines: { eidos: ">=0.33.0" },
        entrypoints: { worker: "src/extension.ts" },
        contributes: {
          commands: [
            { id: "example.task-counter.count", title: "Count tasks" },
          ],
        },
        permissions: {
          files: { read: ["**/*.md"], write: [] },
          network: [],
        },
      },
      normalizedPermissions: {
        files: { read: ["**/*.md"], write: [] },
        network: [],
      },
      contentDigest,
      permissionHash,
      locallyModified: false,
      files: [
        { path: "extension.json", size: 100 },
        { path: "src/extension.ts", size: 40 },
      ],
      diagnostics: [],
    },
    fileCount: 2,
    fileChanges: [{ path: "extension.json", kind: "added", afterSize: 100 }],
    permissionChanges: [
      { kind: "files.read", value: "**/*.md", change: "added" },
    ],
  }
}

beforeEach(() => {
  prepareMock.mockReset().mockResolvedValue(preparedFixture())
  commitMock.mockReset().mockResolvedValue({
    canonicalId: "example.task-counter",
    operation: "install",
  })
  discardMock.mockReset().mockResolvedValue(undefined)
  uninstallMock.mockReset().mockResolvedValue(undefined)
})

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("FileExtensionInstallManager", () => {
  it("returns only a sanitized preview and consumes its token on apply", async () => {
    const root = await createSpace()
    const { FileExtensionInstallManager } =
      await import("./file-extension-install-manager")
    const manager = new FileExtensionInstallManager()

    const preview = await manager.prepare(
      "space-a",
      root,
      { repository: "example/task-counter", requested: "main" },
      "0.33.0"
    )
    expect(preview).toMatchObject({
      operation: "install",
      canonicalId: "example.task-counter",
      displayName: "Task Counter",
      contentDigest,
      permissionHash,
    })
    expect(JSON.stringify(preview)).not.toContain("/private/staging")

    await expect(
      manager.apply(
        "space-a",
        root,
        {
          previewId: preview.previewId,
          contentDigest,
          permissionHash,
        },
        "0.33.0"
      )
    ).resolves.toMatchObject({
      canonicalId: "example.task-counter",
      root: ".eidos/extensions/example.task-counter",
    })
    await expect(
      manager.apply(
        "space-a",
        root,
        {
          previewId: preview.previewId,
          contentDigest,
          permissionHash,
        },
        "0.33.0"
      )
    ).rejects.toThrow("expired")
  })

  it("binds a preview to its Space and reviewed digests", async () => {
    const root = await createSpace()
    const { FileExtensionInstallManager } =
      await import("./file-extension-install-manager")
    const manager = new FileExtensionInstallManager()
    const preview = await manager.prepare(
      "space-a",
      root,
      { repository: "example/task-counter" },
      "0.33.0"
    )

    await expect(manager.cancel("space-b", preview.previewId)).rejects.toThrow(
      "another Space"
    )
    await expect(
      manager.apply(
        "space-a",
        root,
        {
          previewId: preview.previewId,
          contentDigest: `sha256:${"d".repeat(64)}`,
          permissionHash,
        },
        "0.33.0"
      )
    ).rejects.toThrow("preview changed")
    expect(commitMock).not.toHaveBeenCalled()
    await manager.cancel("space-a", preview.previewId)
    expect(discardMock).toHaveBeenCalledTimes(1)
  })

  it("automatically discards private staging when a preview expires", async () => {
    vi.useFakeTimers()
    const root = await createSpace()
    const { FileExtensionInstallManager } =
      await import("./file-extension-install-manager")
    const manager = new FileExtensionInstallManager()
    await manager.prepare(
      "space-a",
      root,
      { repository: "example/task-counter" },
      "0.33.0"
    )

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(discardMock).toHaveBeenCalledTimes(1)
  })

  it("allows a reviewed invalid package without a digest to be removed", async () => {
    const root = await createSpace()
    const { FileExtensionInstallManager } =
      await import("./file-extension-install-manager")
    const manager = new FileExtensionInstallManager()

    await manager.uninstall(root, { directoryName: "broken-package" }, "0.33.0")

    expect(uninstallMock).toHaveBeenCalledWith(
      expect.stringContaining(
        path.join(".eidos", "extensions", "broken-package")
      ),
      expect.stringContaining(
        path.join(".eidos", "cache", "extensions", "staging")
      ),
      undefined,
      "0.33.0"
    )
  })
})
