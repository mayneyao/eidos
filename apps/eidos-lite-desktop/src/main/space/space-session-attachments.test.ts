import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

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
