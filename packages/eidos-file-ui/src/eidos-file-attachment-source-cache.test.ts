import type {
  AssetLease,
  FileEntry,
  HostServices,
  HostSessionState,
} from "@eidos.space/eidos-file"
import type { AssetPresenter, EidosFileUIAssetSession } from "./context"
import {
  EidosFileAttachmentSourceCache,
  sharedEidosFileAttachmentSourceCache,
} from "./eidos-file-attachment-source-cache"

const entries: FileEntry[] = ["a", "b", "c"].map((id) => ({
  id,
  uri: `assets/${id}.png`,
  name: `${id}.png`,
  mediaType: "image/png",
  size: "10",
}))

function fixture() {
  const state: HostSessionState = {
    sessionId: "session",
    phase: "ready-clean",
    capabilities: {
      canWriteCurrent: true,
      canSaveCopy: false,
      canRequestPermission: false,
      hasRecovery: false,
      assetReadSchemes: ["relative"],
      assetWriteSchemes: [],
      casGuarantee: "cooperative",
      atomicReplace: true,
      durability: "best-effort",
    },
    limits: {
      sourceBytesMax: "1024",
      candidateBytesMax: "1024",
      recoveryBytesMax: "0",
      recoveryEntriesMax: 0,
      recoveryRetentionSecondsMax: 0,
      assetBytesMax: "1024",
      assetPreviewBytesMax: "1024",
      concurrentAssetLeasesMax: 4,
      concurrentSessionsMax: 1,
    },
  }
  const resolveAsset = vi.fn(
    async (request: { entryId: string }): Promise<AssetLease> => {
      const entry = entries.find((entry) => entry.id === request.entryId)!
      return {
        leaseId: `lease-${entry.id}`,
        entryId: entry.id,
        purpose: "thumbnail",
        mediaType: entry.mediaType,
        name: entry.name,
        size: entry.size,
        expiresAt: "2099-01-01T00:00:00Z",
        resourceToken: entry.id,
      }
    }
  )
  const releaseAsset = vi.fn(async () => undefined)
  const session: EidosFileUIAssetSession = {
    state,
    services: { resolveAsset, releaseAsset } as unknown as HostServices,
    serviceCapabilities: {
      canOpenSource: true,
      canCreateSource: false,
      canRequestPermission: false,
      canSaveCopy: false,
      canReconcileCommit: false,
      canResolveConflict: false,
      canRecover: false,
      canUseAssets: true,
    },
  }
  const close = vi.fn()
  const source = {
    width: 2,
    height: 2,
    close,
  } as unknown as CanvasImageSource
  const loadImage = vi.fn(async () => source)
  const presenter = { loadImage } as unknown as AssetPresenter<unknown>
  return {
    session,
    presenter,
    source,
    close,
    resolveAsset,
    releaseAsset,
    loadImage,
  }
}

describe("decoded attachment thumbnail cache", () => {
  it("keeps offscreen sources drawable and defers their revalidation until return", async () => {
    const f = fixture()
    const cache = new EidosFileAttachmentSourceCache(f.session, f.presenter)
    const stop = cache.subscribe(entries[0]!, vi.fn())
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[0]!).state).toBe("ready")
    )
    stop()
    cache.revalidate()
    expect(f.resolveAsset).toHaveBeenCalledOnce()
    expect(cache.snapshot(entries[0]!).source).toBe(f.source)
    const stopAgain = cache.subscribe(entries[0]!, vi.fn())
    expect(cache.snapshot(entries[0]!).state).toBe("ready")
    await vi.waitFor(() => expect(f.resolveAsset).toHaveBeenCalledTimes(2))
    stopAgain()
    cache.clear()
  })

  it("does not lose another file change arriving during an in-flight decode", async () => {
    const f = fixture()
    let finish: (source: CanvasImageSource) => void = () => undefined
    f.loadImage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const cache = new EidosFileAttachmentSourceCache(f.session, f.presenter)
    const stop = cache.subscribe(entries[0]!, vi.fn())
    await vi.waitFor(() => expect(f.loadImage).toHaveBeenCalledOnce())
    cache.revalidate()
    cache.revalidate()
    finish(f.source)
    await vi.waitFor(() => expect(f.loadImage).toHaveBeenCalledTimes(2))
    expect(cache.snapshot(entries[0]!).state).toBe("ready")
    stop()
    cache.clear()
  })

  it("keeps visible thumbnails ready throughout watcher revalidation and replaces changed content", async () => {
    const f = fixture()
    f.session.thumbnailRevision = 0
    const cache = sharedEidosFileAttachmentSourceCache(f.session, f.presenter)!
    const observed: string[] = []
    const stop = cache.subscribe(entries[0]!, () => {
      observed.push(cache.snapshot(entries[0]!).state)
    })
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[0]!).state).toBe("ready")
    )
    let finish: (source: CanvasImageSource) => void = () => undefined
    f.loadImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    f.session.thumbnailRevision = 1
    expect(sharedEidosFileAttachmentSourceCache(f.session, f.presenter)).toBe(
      cache
    )
    await vi.waitFor(() => expect(f.loadImage).toHaveBeenCalledTimes(2))
    expect(cache.snapshot(entries[0]!)).toEqual({
      state: "ready",
      source: f.source,
    })
    expect(f.close).not.toHaveBeenCalled()
    const changed = {
      width: 3,
      height: 2,
      close: vi.fn(),
    } as unknown as CanvasImageSource
    finish(changed)
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[0]!).source).toBe(changed)
    )
    expect(observed).toEqual(["ready", "ready"])
    expect(f.close).toHaveBeenCalledOnce()
    stop()
    cache.clear()
  })

  it("drops stale content when background revalidation fails", async () => {
    const f = fixture()
    const cache = new EidosFileAttachmentSourceCache(f.session, f.presenter)
    const stop = cache.subscribe(entries[0]!, vi.fn())
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[0]!).state).toBe("ready")
    )
    f.resolveAsset.mockRejectedValue(new Error("File removed"))
    cache.revalidate()
    expect(cache.snapshot(entries[0]!).source).toBe(f.source)
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[0]!).state).toBe("failed")
    )
    expect(cache.snapshot(entries[0]!).source).toBeUndefined()
    expect(f.close).toHaveBeenCalledOnce()
    stop()
    cache.clear()
  })

  it("returns a ready source synchronously after scroll-out and scroll-back without a lease or decode", async () => {
    const f = fixture()
    const cache = new EidosFileAttachmentSourceCache(f.session, f.presenter)
    const unsubscribe = cache.subscribe(entries[0]!, vi.fn())
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[0]!).state).toBe("ready")
    )
    unsubscribe()
    expect(cache.snapshot(entries[0]!).source).toBe(f.source)
    const stop = cache.subscribe(entries[0]!, vi.fn())
    expect(cache.snapshot(entries[0]!).state).toBe("ready")
    expect(f.resolveAsset).toHaveBeenCalledOnce()
    expect(f.loadImage).toHaveBeenCalledOnce()
    expect(f.releaseAsset).toHaveBeenCalledOnce()
    stop()
    cache.clear()
  })

  it("retains in-flight work when a card leaves and re-enters the viewport", async () => {
    const f = fixture()
    let finish: (source: CanvasImageSource) => void = () => undefined
    f.loadImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const cache = new EidosFileAttachmentSourceCache(f.session, f.presenter)
    const stop = cache.subscribe(entries[0]!, vi.fn())
    await vi.waitFor(() => expect(f.loadImage).toHaveBeenCalledOnce())
    stop()
    const stopAgain = cache.subscribe(entries[0]!, vi.fn())
    finish(f.source)
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[0]!).state).toBe("ready")
    )
    expect(f.resolveAsset).toHaveBeenCalledOnce()
    expect(f.loadImage).toHaveBeenCalledOnce()
    expect(f.releaseAsset).toHaveBeenCalledOnce()
    stopAgain()
    cache.clear()
  })

  it("evicts the least recently used offscreen source within the decoded-byte budget", async () => {
    const f = fixture()
    const cache = new EidosFileAttachmentSourceCache(f.session, f.presenter, {
      decodedBytesMax: 32,
      entriesMax: 3,
    })
    for (const entry of entries.slice(0, 2)) {
      const stop = cache.subscribe(entry, vi.fn())
      await vi.waitFor(() => expect(cache.snapshot(entry).state).toBe("ready"))
      stop()
    }
    cache.subscribe(entries[0]!, vi.fn())()
    const stop = cache.subscribe(entries[2]!, vi.fn())
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[2]!).state).toBe("ready")
    )
    stop()
    expect(cache.snapshot(entries[0]!).state).toBe("ready")
    expect(cache.snapshot(entries[1]!).state).toBe("unavailable")
    expect(cache.snapshot(entries[2]!).state).toBe("ready")
    cache.clear()
  })

  it("retains a failed result across remounts and retries after its TTL", async () => {
    const f = fixture()
    f.resolveAsset.mockRejectedValue(new Error("unsupported"))
    const cache = new EidosFileAttachmentSourceCache(f.session, f.presenter)
    const stop = cache.subscribe(entries[0]!, vi.fn())
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[0]!).state).toBe("failed")
    )
    stop()
    cache.subscribe(entries[0]!, vi.fn())()
    expect(f.resolveAsset).toHaveBeenCalledOnce()
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000)
    try {
      const unsubscribe = cache.subscribe(entries[0]!, vi.fn())
      await vi.waitFor(() => expect(f.resolveAsset).toHaveBeenCalledTimes(2))
      unsubscribe()
    } finally {
      clock.mockRestore()
      cache.clear()
    }
  })

  it("keeps clean/dirty transitions cached, separates sizes and clears on authorization changes", async () => {
    const f = fixture()
    const cache = sharedEidosFileAttachmentSourceCache(
      f.session,
      f.presenter,
      512
    )!
    const stop = cache.subscribe(entries[0]!, vi.fn())
    await vi.waitFor(() =>
      expect(cache.snapshot(entries[0]!).state).toBe("ready")
    )
    stop()
    f.session.state.phase = "ready-dirty"
    expect(
      sharedEidosFileAttachmentSourceCache(f.session, f.presenter, 512)
    ).toBe(cache)
    expect(
      sharedEidosFileAttachmentSourceCache(f.session, f.presenter, 128)
    ).not.toBe(cache)
    f.session.state.capabilities.assetReadSchemes = []
    expect(
      sharedEidosFileAttachmentSourceCache(f.session, f.presenter, 512)
    ).not.toBe(cache)
    expect(cache.snapshot(entries[0]!).state).toBe("unavailable")
  })
})
