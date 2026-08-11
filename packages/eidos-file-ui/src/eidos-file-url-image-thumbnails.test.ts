// @vitest-environment node

import type {
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
  UrlImageLease,
} from "@eidos.space/eidos-file"
import { describe, expect, it, vi } from "vitest"

import type { AssetPresenter, EidosFileUIAssetSession } from "./context"
import { EidosFileUrlImageThumbnailManager } from "./eidos-file-url-image-thumbnails"

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

function hostState(assetReadSchemes = ["https"]): HostSessionState {
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
      concurrentAssetLeasesMax: 4,
      concurrentSessionsMax: 1,
    },
  }
}

function lease(id = "1"): UrlImageLease {
  return {
    leaseId: `url-image-${id}`,
    purpose: "thumbnail",
    mediaType: "image/png",
    size: "12",
    expiresAt: "2099-01-01T00:00:00.000Z",
    resourceToken: `host-resource-${id}`,
  }
}

describe("EidosFileUrlImageThumbnailManager", () => {
  it("deduplicates visible URLs and resolves them only through the Host", async () => {
    const resolveUrlImage = vi.fn(async () => lease())
    const releaseAsset = vi.fn(async () => undefined)
    const source = { height: 32, width: 32 } as unknown as CanvasImageSource
    const loadImage = vi.fn(async () => source)
    const onCellsReady = vi.fn()
    const session: EidosFileUIAssetSession = {
      services: { resolveUrlImage, releaseAsset } as unknown as HostServices,
      serviceCapabilities,
      state: hostState(),
    }
    const manager = new EidosFileUrlImageThumbnailManager(
      session,
      { loadImage } as unknown as AssetPresenter<unknown>,
      onCellsReady
    )
    const uri = "https://cdn.example.com/avatar.png"

    expect(manager.prepare(uri, 1, 2)).toBeUndefined()
    expect(manager.prepare(uri, 1, 3)).toBeUndefined()
    await vi.waitFor(() => expect(onCellsReady).toHaveBeenCalledOnce())

    expect(resolveUrlImage).toHaveBeenCalledOnce()
    expect(resolveUrlImage).toHaveBeenCalledWith(
      { sessionId: "session-1", uri, purpose: "thumbnail" },
      expect.objectContaining({ requestId: expect.any(String) })
    )
    expect(loadImage).toHaveBeenCalledWith({
      sessionId: "session-1",
      lease: lease(),
      altText: "",
    })
    expect(onCellsReady).toHaveBeenCalledWith([
      { cell: [1, 2] },
      { cell: [1, 3] },
    ])
    expect(manager.prepare(uri, 1, 2)).toBe(source)
    await vi.waitFor(() => expect(releaseAsset).toHaveBeenCalledOnce())
  })

  it("reuses a decoded image after its row leaves and re-enters the viewport", async () => {
    const resolveUrlImage = vi.fn(async () => lease())
    const source = { height: 32, width: 32 } as unknown as CanvasImageSource
    const onCellsReady = vi.fn()
    const manager = new EidosFileUrlImageThumbnailManager(
      {
        services: {
          resolveUrlImage,
          releaseAsset: vi.fn(async () => undefined),
        } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(),
      },
      {
        loadImage: vi.fn(async () => source),
      } as unknown as AssetPresenter<unknown>,
      onCellsReady
    )
    const uri = "https://cdn.example.com/avatar.png"

    expect(manager.prepare(uri, 1, 2)).toBeUndefined()
    await vi.waitFor(() => expect(onCellsReady).toHaveBeenCalledOnce())
    expect(manager.prepare(uri, 1, 2)).toBe(source)

    manager.retainVisibleRows(100, 20)

    expect(manager.prepare(uri, 1, 2)).toBe(source)
    expect(resolveUrlImage).toHaveBeenCalledOnce()

    manager.clear()

    expect(manager.prepare(uri, 1, 2)).toBeUndefined()
    await vi.waitFor(() => expect(resolveUrlImage).toHaveBeenCalledTimes(2))
  })

  it("evicts the least-recently-used offscreen image when the cache is full", async () => {
    let leaseIndex = 0
    let sourceIndex = 0
    const resolveUrlImage = vi.fn(async () => lease(String(++leaseIndex)))
    const sources = [
      { height: 32, width: 32 },
      { height: 32, width: 32 },
      { height: 32, width: 32 },
    ] as unknown as CanvasImageSource[]
    const onCellsReady = vi.fn()
    const manager = new EidosFileUrlImageThumbnailManager(
      {
        services: {
          resolveUrlImage,
          releaseAsset: vi.fn(async () => undefined),
        } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(),
      },
      {
        loadImage: vi.fn(async () => sources[sourceIndex++]!),
      } as unknown as AssetPresenter<unknown>,
      onCellsReady,
      { decodedBytesMax: 1024 * 1024, entriesMax: 1 }
    )
    const first = "https://cdn.example.com/first.png"
    const second = "https://cdn.example.com/second.png"

    manager.prepare(first, 1, 0)
    await vi.waitFor(() => expect(onCellsReady).toHaveBeenCalledTimes(1))
    manager.retainVisibleRows(10, 1)

    manager.prepare(second, 1, 10)
    await vi.waitFor(() => expect(onCellsReady).toHaveBeenCalledTimes(2))
    manager.retainVisibleRows(20, 1)

    expect(manager.prepare(first, 1, 0)).toBeUndefined()
    await vi.waitFor(() => expect(resolveUrlImage).toHaveBeenCalledTimes(3))
  })

  it("does not retain an offscreen image beyond the decoded-byte budget", async () => {
    let leaseIndex = 0
    const resolveUrlImage = vi.fn(async () => lease(String(++leaseIndex)))
    const onCellsReady = vi.fn()
    const manager = new EidosFileUrlImageThumbnailManager(
      {
        services: {
          resolveUrlImage,
          releaseAsset: vi.fn(async () => undefined),
        } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(),
      },
      {
        loadImage: vi.fn(
          async () =>
            ({ height: 32, width: 32 }) as unknown as CanvasImageSource
        ),
      } as unknown as AssetPresenter<unknown>,
      onCellsReady,
      { decodedBytesMax: 4095, entriesMax: 10 }
    )
    const uri = "https://cdn.example.com/large.png"

    manager.prepare(uri, 1, 0)
    await vi.waitFor(() => expect(onCellsReady).toHaveBeenCalledTimes(1))
    manager.retainVisibleRows(10, 1)

    expect(manager.prepare(uri, 1, 0)).toBeUndefined()
    await vi.waitFor(() => expect(resolveUrlImage).toHaveBeenCalledTimes(2))
  })

  it("rejects direct HTTP, credential-bearing, and Host-denied URLs", () => {
    const resolveUrlImage = vi.fn()
    const manager = new EidosFileUrlImageThumbnailManager(
      {
        services: { resolveUrlImage } as unknown as HostServices,
        serviceCapabilities,
        state: hostState(["relative"]),
      },
      { loadImage: vi.fn() } as unknown as AssetPresenter<unknown>,
      vi.fn()
    )

    expect(manager.prepare("http://example.com/a.png", 0, 0)).toBeUndefined()
    expect(
      manager.prepare("https://user@example.com/a.png", 0, 1)
    ).toBeUndefined()
    expect(manager.prepare("https://example.com/a.png", 0, 2)).toBeUndefined()
    expect(resolveUrlImage).not.toHaveBeenCalled()
  })
})
