import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runtimeReadTrace } from "../../runtime/read-trace"

import type { GraftSpaceStatus } from "../../shared/contracts"
import type { GraftClient } from "../graft/graft-client"
import { SpaceSession } from "./space-session"

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
])

function graftStub(): GraftClient {
  const status: GraftSpaceStatus = {
    available: true,
    backend: "sdk",
    version: "0.3.8",
    expectedVersion: "0.3.8",
    initialized: false,
    clean: true,
    changedPaths: 0,
  }
  return {
    backend: "sdk",
    syncRemoteOrigin: "https://sync-staging.eidos.space",
    expectedVersion: () => "0.3.8",
    close: async () => undefined,
    inspectSpace: async () => status,
    inspectIgnores: async (_root: string, relativePaths: string[]) =>
      relativePaths.map((relativePath) => ({
        path: relativePath,
        isIgnored: false,
        isTracked: false,
        isDirectory: false,
        hasTrackedDescendants: false,
      })),
  } as unknown as GraftClient
}

describe("SpaceSession attachment drafts", () => {
  it("marks read-gate admission before the pool call without bypassing quiescence or changing result/error identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-asset-gate-"))
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-asset-gate-state-")
    )
    let session: SpaceSession | null = null
    let release = () => {}
    const point = vi.spyOn(runtimeReadTrace, "point")
    try {
      session = await SpaceSession.create(root, userData, {
        graft: graftStub(),
      })
      const value = { id: "public-fixture" }
      const call = vi
        .spyOn(session.runtimePool, "call")
        .mockResolvedValue(value as never)
      let admitted = () => {}
      const admission = new Promise<void>((resolve) => {
        admitted = resolve
      })
      const paused = new Promise<void>((resolve) => {
        release = resolve
      })
      const barrier = session.gate.withQuiescedRepositoryOperation(
        "fixture",
        async () => {
          admitted()
          await paused
        }
      )
      await admission
      const result = session.callRuntime("fixture-session", "findFileEntry", [
        "public-fixture",
      ])
      expect(point).toHaveBeenCalledWith("space-read-gate-wait", {
        method: "findFileEntry",
      })
      expect(point).not.toHaveBeenCalledWith("space-read-gate-ready", {
        method: "findFileEntry",
      })
      expect(call).not.toHaveBeenCalled()
      release()
      await barrier
      expect(await result).toBe(value)
      expect(point).toHaveBeenCalledWith("space-read-gate-ready", {
        method: "findFileEntry",
      })
      const error = new Error("private fixture failure")
      call.mockRejectedValueOnce(error)
      await expect(
        session.callRuntime("fixture-session", "findFileEntry", [
          "public-fixture",
        ])
      ).rejects.toBe(error)
    } finally {
      release()
      point.mockRestore()
      await session?.close().catch(() => undefined)
      await fs.rm(root, { recursive: true, force: true })
      await fs.rm(userData, { recursive: true, force: true })
    }
  })
  it("resolves a Host-imported attachment before the editor commits its File value", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-attachment-draft-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-attachment-draft-state-")
    )
    let session: SpaceSession | null = null
    try {
      await fs.writeFile(path.join(root, "data.eidos"), "fixture")
      const source = path.join(root, "photo.png")
      await fs.writeFile(source, PNG)
      session = await SpaceSession.create(root, userData, {
        graft: graftStub(),
      })
      vi.spyOn(session.runtimePool, "relativePathForSession").mockReturnValue(
        "data.eidos"
      )
      const callRuntime = vi
        .spyOn(session, "callRuntime")
        .mockResolvedValue(null as never)

      const [entry] = await session.importEidosFileAssets("runtime-1", [source])

      await expect(
        session.resolveEidosFileAsset("runtime-1", entry!.id, "thumbnail")
      ).resolves.toMatchObject({
        entry,
        resolved: { bytes: PNG },
      })

      callRuntime.mockResolvedValue({
        ...entry!,
        uri: "assets/different.png",
      } as never)
      await expect(
        session.resolveEidosFileAsset("runtime-1", entry!.id, "preview")
      ).rejects.toThrow("conflicts with its imported asset")

      callRuntime.mockResolvedValue(entry as never)
      await expect(
        session.resolveEidosFileAsset("runtime-1", entry!.id, "preview")
      ).resolves.toMatchObject({ entry })
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })
})
