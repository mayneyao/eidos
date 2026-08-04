// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  AssetLease,
  FileEntry,
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileUIProvider, type AssetPresenter } from "./context"
import {
  EidosFileEntryCoverSurface,
  EidosFileEntrySurface,
} from "./eidos-file-entry-surface"

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

function hostState(schemes = ["relative", "https", "data"]): HostSessionState {
  return {
    sessionId: "session-1",
    phase: "ready-clean",
    capabilities: {
      canWriteCurrent: false,
      canSaveCopy: false,
      canRequestPermission: false,
      hasRecovery: false,
      assetReadSchemes: schemes,
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

function entry(
  id: string,
  uri: string,
  name: string,
  mediaType = "image/png",
  size = "1"
): FileEntry {
  return { id, uri, name, mediaType, size }
}

function leaseFor(file: FileEntry, purpose: AssetLease["purpose"]): AssetLease {
  return {
    leaseId: `${purpose}-${file.id}`,
    entryId: file.id,
    purpose,
    mediaType: file.mediaType,
    name: file.name,
    size: file.size,
    expiresAt: "2099-01-01T00:00:00.000Z",
    resourceToken: `blob:host/${purpose}/${file.id}`,
  }
}

describe("EidosFileEntrySurface", () => {
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

  it("uses Host leases for relative, HTTPS, and Data thumbnails with zero direct URI fetch", async () => {
    const files = [
      entry("relative", "assets/a.png", "a.png"),
      entry("https", "https://example.test/b.png", "b.png"),
      entry("data", "data:image/png;base64,AA==", "c.png"),
    ]
    const resolveAsset = vi.fn(
      async (request: { entryId: string; purpose: AssetLease["purpose"] }) => {
        const file = files.find(
          (candidate) => candidate.id === request.entryId
        )!
        return leaseFor(file, request.purpose)
      }
    )
    const releaseAsset = vi.fn(async () => undefined)
    const services = { resolveAsset, releaseAsset } as unknown as HostServices
    const presenter: AssetPresenter<ReactNode> = {
      renderImage: ({ lease, altText }) => (
        <img src={lease.resourceToken} alt={altText} />
      ),
      activate: vi.fn(async () => undefined),
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await act(async () => {
      root.render(
        <EidosFileUIProvider
          assetSession={{
            services,
            serviceCapabilities,
            state: hostState(),
          }}
          assetPresenter={presenter}
        >
          {files.map((file) => (
            <EidosFileEntrySurface key={file.id} entry={file} />
          ))}
        </EidosFileUIProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(resolveAsset).toHaveBeenCalledTimes(3)
    expect(fetchSpy).not.toHaveBeenCalled()
    const sources = Array.from(container.querySelectorAll("img")).map((image) =>
      image.getAttribute("src")
    )
    expect(sources).toEqual([
      "blob:host/thumbnail/relative",
      "blob:host/thumbnail/https",
      "blob:host/thumbnail/data",
    ])
    for (const file of files) expect(sources).not.toContain(file.uri)
    await act(async () => root.render(<div />))
    expect(releaseAsset).toHaveBeenCalledTimes(3)
    fetchSpy.mockRestore()
  })

  it("keeps a loaded Gallery cover free of attachment metadata overlays", async () => {
    const file = entry("cover", "assets/cover.png", "cover.png")
    const services = {
      resolveAsset: vi.fn(async () => leaseFor(file, "thumbnail")),
      releaseAsset: vi.fn(async () => undefined),
    } as unknown as HostServices
    const presenter: AssetPresenter<ReactNode> = {
      renderImage: ({ lease, altText }) => (
        <img src={lease.resourceToken} alt={altText} />
      ),
      activate: vi.fn(async () => undefined),
    }

    await act(async () => {
      root.render(
        <EidosFileUIProvider
          assetSession={{
            services,
            serviceCapabilities,
            state: hostState(),
          }}
          assetPresenter={presenter}
        >
          <EidosFileEntryCoverSurface entry={file} />
        </EidosFileUIProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector("img")?.getAttribute("alt")).toBe(file.name)
    expect(container.textContent).toBe("")
    expect(container.querySelector("details")).toBeNull()
    expect(container.querySelector("code")).toBeNull()
  })

  it("falls back to trusted metadata and the lossless URI when policy denies a scheme", async () => {
    const file = entry("relative", "assets/private.png", "private.png")
    const resolveAsset = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileUIProvider
          assetSession={{
            services: { resolveAsset } as unknown as HostServices,
            serviceCapabilities,
            state: hostState(["data"]),
          }}
        >
          <EidosFileEntrySurface entry={file} />
        </EidosFileUIProvider>
      )
    })
    expect(resolveAsset).not.toHaveBeenCalled()
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("code")?.textContent).toBe(file.uri)
    expect(container.textContent).toContain(file.mediaType)
  })

  it("keeps compact file rows quiet and summarizes preview failures", async () => {
    const file = entry("compact", "assets/private.png", "private.png")
    const services = {
      resolveAsset: vi.fn(async () => {
        throw new Error("Error invoking remote method with internal details")
      }),
      releaseAsset: vi.fn(async () => undefined),
    } as unknown as HostServices
    const presenter: AssetPresenter<ReactNode> = {
      renderImage: () => null,
      activate: vi.fn(async () => undefined),
    }
    await act(async () => {
      root.render(
        <EidosFileUIProvider
          assetSession={{
            services,
            serviceCapabilities,
            state: hostState(),
          }}
          assetPresenter={presenter}
        >
          <EidosFileEntrySurface entry={file} compact />
        </EidosFileUIProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector("code")).toBeNull()
    expect(container.textContent).not.toContain(file.mediaType)
    expect(container.textContent).not.toContain("internal details")
    expect(container.textContent).toContain("Preview unavailable")
  })

  it("opens only through an explicit preview lease and presenter activation", async () => {
    const file = entry(
      "document",
      "https://example.test/report.pdf",
      "report.pdf",
      "application/pdf",
      "42"
    )
    const resolveAsset = vi.fn(async (request) =>
      leaseFor(file, request.purpose)
    )
    const releaseAsset = vi.fn(async () => undefined)
    const activate = vi.fn(async () => undefined)
    const services = { resolveAsset, releaseAsset } as unknown as HostServices
    const presenter: AssetPresenter<ReactNode> = {
      renderImage: () => null,
      activate,
    }
    await act(async () => {
      root.render(
        <EidosFileUIProvider
          assetSession={{
            services,
            serviceCapabilities,
            state: hostState(),
          }}
          assetPresenter={presenter}
        >
          <EidosFileEntrySurface entry={file} />
        </EidosFileUIProvider>
      )
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open report.pdf"]')
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(resolveAsset).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: file.id, purpose: "preview" }),
      expect.objectContaining({ requestId: expect.any(String) })
    )
    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "open", sessionId: "session-1" }),
      expect.objectContaining({ requestId: expect.any(String) })
    )
    expect(releaseAsset).toHaveBeenCalledOnce()
  })
})
