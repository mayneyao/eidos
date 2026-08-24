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

function hostState(
  assetReadSchemes = ["relative"],
  concurrentAssetLeasesMax = 8
): HostSessionState {
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
      concurrentAssetLeasesMax,
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
  it("loads through the Host lease and presenter, redraws, and releases after decoding", async () => {
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

    await vi.waitFor(() => expect(releaseAsset).toHaveBeenCalledOnce())
    expect(releaseAsset).toHaveBeenCalledWith(
      { sessionId: "session-1", leaseId: "lease-1" },
      expect.objectContaining({ requestId: expect.any(String) })
    )
    fetchSpy.mockRestore()
  })

  it("queues thumbnail decoding within the negotiated lease limit", async () => {
    const entries = Array.from({ length: 3 }, (_, index) => ({
      ...entry,
      id: `0198c6b9-c9a3-7cb9-82d0-dfb39d51c45${index}`,
      name: `cover-${index}.png`,
      uri: `assets/cover-${index}.png`,
    }))
    const resolveAsset = vi.fn(async (request: { entryId: string }) => {
      const candidate = entries.find((item) => item.id === request.entryId)!
      return {
        ...lease(),
        leaseId: `lease-${candidate.id}`,
        entryId: candidate.id,
        name: candidate.name,
        resourceToken: `blob:host/${candidate.id}`,
      }
    })
    const releaseAsset = vi.fn(async () => undefined)
    const decoders: Array<(source: CanvasImageSource) => void> = []
    const loadImage = vi.fn(
      () =>
        new Promise<CanvasImageSource>((resolve) => {
          decoders.push(resolve)
        })
    )
    const manager = new EidosFileAttachmentThumbnailManager(
      {
        services: { resolveAsset, releaseAsset } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(["relative"], 2),
      },
      { loadImage } as unknown as AssetPresenter<unknown>,
      vi.fn()
    )

    entries.forEach((candidate, row) => manager.prepare([candidate], 0, row))
    await vi.waitFor(() => expect(loadImage).toHaveBeenCalledTimes(2))
    expect(resolveAsset).toHaveBeenCalledTimes(2)

    decoders[0]!({ height: 32, width: 32 } as CanvasImageSource)
    await vi.waitFor(() => expect(resolveAsset).toHaveBeenCalledTimes(3))
    expect(releaseAsset).toHaveBeenCalledTimes(1)

    decoders
      .slice(1)
      .forEach((resolve) =>
        resolve({ height: 32, width: 32 } as CanvasImageSource)
      )
    await vi.waitFor(() => expect(releaseAsset).toHaveBeenCalledTimes(3))
  })

  it("shares one decoded thumbnail across cells that reference the same entry", async () => {
    const resolveAsset = vi.fn(async () => lease())
    const releaseAsset = vi.fn(async () => undefined)
    const source = { height: 32, width: 32 } as unknown as CanvasImageSource
    const onCellsReady = vi.fn()
    const manager = new EidosFileAttachmentThumbnailManager(
      {
        services: { resolveAsset, releaseAsset } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(),
      },
      {
        loadImage: vi.fn(async () => source),
      } as unknown as AssetPresenter<unknown>,
      onCellsReady
    )

    expect(manager.prepare([entry], 0, 0)).toEqual([])
    expect(manager.prepare([entry], 0, 1)).toEqual([])
    await vi.waitFor(() => expect(onCellsReady).toHaveBeenCalledOnce())

    expect(resolveAsset).toHaveBeenCalledOnce()
    expect(onCellsReady).toHaveBeenCalledWith([
      { cell: [0, 0] },
      { cell: [0, 1] },
    ])
    expect(manager.prepare([entry], 0, 0)).toEqual([source])
    expect(manager.prepare([entry], 0, 1)).toEqual([source])
  })

  it("keeps a decoded thumbnail when a Grid row leaves and re-enters the viewport", async () => {
    const resolveAsset = vi.fn(async () => lease())
    const releaseAsset = vi.fn(async () => undefined)
    const source = { height: 32, width: 32 } as unknown as CanvasImageSource
    const manager = new EidosFileAttachmentThumbnailManager(
      {
        services: { resolveAsset, releaseAsset } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(),
      },
      {
        loadImage: vi.fn(async () => source),
      } as unknown as AssetPresenter<unknown>,
      vi.fn()
    )

    expect(manager.prepare([entry], 0, 0)).toEqual([])
    await vi.waitFor(() => expect(resolveAsset).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(manager.prepare([entry], 0, 0)).toEqual([source])
    )

    manager.retainVisibleRows(100, 20)

    expect(manager.prepare([entry], 0, 0)).toEqual([source])
    expect(resolveAsset).toHaveBeenCalledOnce()
  })

  it("retries one transient thumbnail resolution failure", async () => {
    const resolveAsset = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary gateway failure"))
      .mockResolvedValueOnce(lease())
    const releaseAsset = vi.fn(async () => undefined)
    const source = { height: 32, width: 32 } as unknown as CanvasImageSource
    const onCellsReady = vi.fn()
    const manager = new EidosFileAttachmentThumbnailManager(
      {
        services: { resolveAsset, releaseAsset } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(),
      },
      {
        loadImage: vi.fn(async () => source),
      } as unknown as AssetPresenter<unknown>,
      onCellsReady
    )

    expect(manager.prepare([entry], 0, 0)).toEqual([])
    await vi.waitFor(() => expect(onCellsReady).toHaveBeenCalledOnce())

    expect(resolveAsset).toHaveBeenCalledTimes(2)
    expect(manager.prepare([entry], 0, 0)).toEqual([source])
  })

  it("evicts the least recently used offscreen thumbnail at the cache limit", async () => {
    const secondEntry: FileEntry = {
      ...entry,
      id: "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45f",
      name: "second.png",
      uri: "assets/second.png",
    }
    const entries = new Map(
      [entry, secondEntry].map((candidate) => [candidate.id, candidate])
    )
    const resolveAsset = vi.fn(async (request: { entryId: string }) => {
      const candidate = entries.get(request.entryId)!
      return {
        ...lease(),
        leaseId: `lease-${candidate.id}`,
        entryId: candidate.id,
        name: candidate.name,
        resourceToken: `blob:host/${candidate.id}`,
      }
    })
    const releaseAsset = vi.fn(async () => undefined)
    const source = { height: 32, width: 32 } as unknown as CanvasImageSource
    const manager = new EidosFileAttachmentThumbnailManager(
      {
        services: { resolveAsset, releaseAsset } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(),
      },
      {
        loadImage: vi.fn(async () => source),
      } as unknown as AssetPresenter<unknown>,
      vi.fn(),
      { decodedBytesMax: 1024 * 1024, entriesMax: 1 }
    )

    manager.prepare([entry], 0, 0)
    await vi.waitFor(() =>
      expect(manager.prepare([entry], 0, 0)).toEqual([source])
    )
    manager.retainVisibleRows(100, 20)

    manager.prepare([secondEntry], 0, 100)
    await vi.waitFor(() =>
      expect(manager.prepare([secondEntry], 0, 100)).toEqual([source])
    )
    manager.retainVisibleRows(200, 20)

    expect(manager.prepare([entry], 0, 0)).toEqual([])
    await vi.waitFor(() => expect(resolveAsset).toHaveBeenCalledTimes(3))
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
