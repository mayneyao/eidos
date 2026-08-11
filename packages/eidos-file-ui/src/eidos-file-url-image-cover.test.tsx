// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
  UrlImageLease,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EidosFileUIProvider,
  type AssetPresenter,
  type EidosFileUIAssetSession,
} from "./context"
import { EidosFileUrlImageCoverSurface } from "./eidos-file-url-image-cover"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

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

const hostState: HostSessionState = {
  sessionId: "session-gallery",
  phase: "ready-clean",
  capabilities: {
    canWriteCurrent: false,
    canSaveCopy: false,
    canRequestPermission: false,
    hasRecovery: false,
    assetReadSchemes: ["https"],
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

const lease: UrlImageLease = {
  leaseId: "url-image-cover",
  purpose: "thumbnail",
  mediaType: "image/png",
  size: "12",
  expiresAt: "2099-01-01T00:00:00.000Z",
  resourceToken: "host-resource-cover",
}

describe("EidosFileUrlImageCoverSurface", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("deduplicates equal Gallery URLs and reuses the decoded image after remount", async () => {
    const resolveUrlImage = vi.fn(async () => lease)
    const releaseAsset = vi.fn(async () => undefined)
    const session: EidosFileUIAssetSession = {
      services: { resolveUrlImage, releaseAsset } as unknown as HostServices,
      serviceCapabilities,
      state: hostState,
    }
    const source = { height: 80, width: 120 } as unknown as CanvasImageSource
    const presenter: AssetPresenter<ReactNode> = {
      renderImage: vi.fn(() => null),
      loadImage: vi.fn(async () => source),
      activate: vi.fn(async () => undefined),
    }
    const uri = "https://images.example.test/cover.png"
    const renderCovers = (count: number) =>
      root.render(
        <EidosFileUIProvider assetSession={session} assetPresenter={presenter}>
          {Array.from({ length: count }, (_, index) => (
            <EidosFileUrlImageCoverSurface
              key={index}
              uri={uri}
              altText={`Cover ${index + 1}`}
            />
          ))}
        </EidosFileUIProvider>
      )

    await act(async () => renderCovers(2))
    await act(async () => {
      await vi.waitFor(() => expect(resolveUrlImage).toHaveBeenCalledOnce())
      await vi.waitFor(() =>
        expect(container.querySelectorAll("canvas")).toHaveLength(2)
      )
    })
    expect(presenter.loadImage).toHaveBeenCalledOnce()
    expect(releaseAsset).toHaveBeenCalledOnce()

    await act(async () => root.render(<div />))
    await act(async () => {
      renderCovers(1)
      await Promise.resolve()
    })

    expect(container.querySelectorAll("canvas")).toHaveLength(1)
    expect(resolveUrlImage).toHaveBeenCalledOnce()
  })

  it("keeps unsupported values inert", async () => {
    const resolveUrlImage = vi.fn()
    const session: EidosFileUIAssetSession = {
      services: { resolveUrlImage } as unknown as HostServices,
      serviceCapabilities,
      state: hostState,
    }
    const presenter: AssetPresenter<ReactNode> = {
      renderImage: vi.fn(() => null),
      loadImage: vi.fn(),
      activate: vi.fn(async () => undefined),
    }

    await act(async () => {
      root.render(
        <EidosFileUIProvider assetSession={session} assetPresenter={presenter}>
          <EidosFileUrlImageCoverSurface
            uri="http://images.example.test/cover.png"
            altText="Image URL"
          />
        </EidosFileUIProvider>
      )
      await Promise.resolve()
    })

    expect(resolveUrlImage).not.toHaveBeenCalled()
    expect(container.querySelector("canvas")).toBeNull()
    expect(
      container.querySelector('[role="img"][aria-label="Image URL"]')
    ).not.toBeNull()
  })
})
