import type {
  AssetLease,
  FileEntry,
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
} from "@eidos.space/eidos-file"
import { describe, expect, it, vi } from "vitest"

import type { AssetPresenter, EidosFileUIAssetSession } from "./context"
import { EidosFileAttachmentThumbnailManager } from "./eidos-file-attachment-thumbnails"

const serviceCapabilities: HostServiceCapabilities = {
  canOpenSource: true,
  canCreateSource: false,
  canRequestPermission: false,
  canSaveCopy: false,
  canReconcileCommit: false,
  canResolveConflict: false,
  canRecover: false,
  canUseAssets: true,
}

function hostState(assetReadSchemes = ["relative"]): HostSessionState {
  return {
    sessionId: "session-1",
    phase: "ready-clean",
    capabilities: {
      canWriteCurrent: false,
      canSaveCopy: false,
      canRequestPermission: false,
      hasRecovery: false,
      assetReadSchemes,
      assetWriteSchemes: [],
      casGuarantee: "none",
      atomicReplace: false,
      durability: "best-effort",
    },
    limits: {
      sourceBytesMax: "16777216",
      candidateBytesMax: "16777216",
      recoveryBytesMax: "0",
      recoveryEntriesMax: 0,
      recoveryRetentionSecondsMax: 0,
      assetBytesMax: "16777216",
      assetPreviewBytesMax: "1048576",
      concurrentAssetLeasesMax: 8,
      concurrentSessionsMax: 1,
    },
  }
}

const entry: FileEntry = {
  id: "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
  mediaType: "image/png",
  name: "cover.png",
  size: "12",
  uri: "assets/cover.png",
}

function lease(): AssetLease {
  return {
    leaseId: "lease-1",
    entryId: entry.id,
    purpose: "thumbnail",
    mediaType: entry.mediaType,
    name: entry.name,
    size: entry.size,
    expiresAt: "2099-01-01T00:00:00.000Z",
    resourceToken: "blob:host/lease-1",
  }
}

describe("EidosFileAttachmentThumbnailManager", () => {
  it("loads through the Host lease and presenter, redraws, and releases offscreen", async () => {
    const resolveAsset = vi.fn(async () => lease())
    const releaseAsset = vi.fn(async () => undefined)
    const services = { resolveAsset, releaseAsset } as unknown as HostServices
    const session: EidosFileUIAssetSession = {
      services,
      serviceCapabilities,
      state: hostState(),
    }
    const source = { height: 32, width: 32 } as unknown as CanvasImageSource
    const loadImage = vi.fn(async () => source)
    const presenter = { loadImage } as unknown as AssetPresenter<unknown>
    const onCellsReady = vi.fn()
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const manager = new EidosFileAttachmentThumbnailManager(
      session,
      presenter,
      onCellsReady
    )

    expect(manager.prepare([entry], 2, 3)).toEqual([])
    await vi.waitFor(() => expect(onCellsReady).toHaveBeenCalled())
    expect(manager.prepare([entry], 2, 3)).toEqual([source])
    expect(resolveAsset).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
        entryId: entry.id,
        purpose: "thumbnail",
      },
      expect.objectContaining({ requestId: expect.any(String) })
    )
    expect(loadImage).toHaveBeenCalledWith({
      sessionId: "session-1",
      lease: lease(),
      altText: "cover.png",
    })
    expect(fetchSpy).not.toHaveBeenCalled()

    manager.retainVisibleRows(100, 10)
    await vi.waitFor(() => expect(releaseAsset).toHaveBeenCalledOnce())
    expect(releaseAsset).toHaveBeenCalledWith(
      { sessionId: "session-1", leaseId: "lease-1" },
      expect.objectContaining({ requestId: expect.any(String) })
    )
    fetchSpy.mockRestore()
  })

  it("does not resolve a URI scheme denied by the Host session", () => {
    const resolveAsset = vi.fn()
    const manager = new EidosFileAttachmentThumbnailManager(
      {
        services: { resolveAsset } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(["data"]),
      },
      { loadImage: vi.fn() } as unknown as AssetPresenter<unknown>,
      vi.fn()
    )

    expect(manager.prepare([entry], 0, 0)).toEqual([])
    expect(resolveAsset).not.toHaveBeenCalled()
  })
})
