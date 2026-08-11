import { vi } from "vitest"

import {
  createEidosLiteAssetSession,
  eidosLiteAssetPresenter,
} from "./eidos-file-assets"

const lease = {
  leaseId: "lease-1",
  entryId: "0198c72d-82b5-7968-b163-98be4b7477df",
  purpose: "thumbnail" as const,
  mediaType: "image/png",
  name: "photo.png",
  size: "9",
  expiresAt: "2099-01-01T00:00:00.000Z",
  resourceToken: "resource-1",
}

describe("Eidos Lite renderer attachment leases", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("acquires remote File entries through main-process IPC", async () => {
    const entry = {
      id: "0198c72d-82b5-7968-b163-98be4b7477de",
      name: "report.pdf",
      mediaType: "application/pdf",
      size: "1024",
      uri: "https://cdn.example.com/report.pdf",
    }
    const acquireRemoteEidosFileAsset = vi.fn(async () => entry)
    vi.stubGlobal("window", { eidosLite: { acquireRemoteEidosFileAsset } })
    const session = createEidosLiteAssetSession("session-1", "file-1")

    await expect(
      session.services.acquireRemoteAsset!(
        {
          sessionId: "session-1",
          uri: entry.uri,
          name: entry.name,
        },
        { requestId: "remote-file" }
      )
    ).resolves.toEqual({ entry })
    expect(acquireRemoteEidosFileAsset).toHaveBeenCalledWith(
      "session-1",
      entry.uri,
      entry.name
    )
    expect(session.state.capabilities.assetWriteSchemes).toContain("https")
  })

  it("keeps filesystem paths behind IPC while presenting and releasing blobs", async () => {
    const resolveEidosFileAsset = vi.fn(async () => ({
      lease,
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    }))
    const releaseEidosFileAsset = vi.fn(async () => undefined)
    const activateEidosFileAsset = vi.fn(async () => undefined)
    vi.stubGlobal("window", {
      eidosLite: {
        resolveEidosFileAsset,
        releaseEidosFileAsset,
        activateEidosFileAsset,
      },
    })
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:eidos-lite")
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined)
    const session = createEidosLiteAssetSession("session-1", "file-1")

    const acquired = await session.services.resolveAsset(
      {
        sessionId: "session-1",
        entryId: lease.entryId,
        purpose: "thumbnail",
      },
      { requestId: "test" }
    )
    const image = eidosLiteAssetPresenter.renderImage({
      sessionId: "session-1",
      lease: acquired,
      altText: "Photo",
    }) as { props: { src: string; alt: string } }

    expect(image.props).toMatchObject({ src: "blob:eidos-lite", alt: "Photo" })
    expect(resolveEidosFileAsset).toHaveBeenCalledWith(
      "session-1",
      lease.entryId,
      "thumbnail"
    )
    expect(createObjectURL).toHaveBeenCalledOnce()

    await session.services.releaseAsset(
      { sessionId: "session-1", leaseId: lease.leaseId },
      { requestId: "release" }
    )
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:eidos-lite")
    expect(releaseEidosFileAsset).toHaveBeenCalledWith(
      "session-1",
      lease.leaseId
    )
  })

  it("routes activation through the opaque lease instead of a path", async () => {
    const activateEidosFileAsset = vi.fn(async () => undefined)
    vi.stubGlobal("window", { eidosLite: { activateEidosFileAsset } })

    await eidosLiteAssetPresenter.activate(
      {
        sessionId: "session-1",
        lease: { ...lease, purpose: "preview" },
        action: "open",
      },
      { requestId: "open" }
    )

    expect(activateEidosFileAsset).toHaveBeenCalledWith(
      "session-1",
      lease.leaseId,
      "open"
    )
  })

  it("resolves network images through main-process IPC and presents only a blob URL", async () => {
    const urlLease = {
      leaseId: "url-image-1",
      purpose: "thumbnail" as const,
      mediaType: "image/png",
      size: "9",
      expiresAt: "2099-01-01T00:00:00.000Z",
      resourceToken: "url-resource-1",
    }
    const resolveEidosFileUrlImage = vi.fn(async () => ({
      lease: urlLease,
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    }))
    const releaseEidosFileAsset = vi.fn(async () => undefined)
    vi.stubGlobal("window", {
      eidosLite: { resolveEidosFileUrlImage, releaseEidosFileAsset },
    })
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:eidos-url-image")
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined)
    const session = createEidosLiteAssetSession("session-1", "file-1")
    const uri = "https://cdn.example.com/avatar.png"

    const acquired = await session.services.resolveUrlImage!(
      { sessionId: "session-1", uri, purpose: "thumbnail" },
      { requestId: "network-image" }
    )
    const image = eidosLiteAssetPresenter.renderImage({
      sessionId: "session-1",
      lease: acquired,
      altText: "Avatar",
    }) as { props: { src: string } }

    expect(resolveEidosFileUrlImage).toHaveBeenCalledWith(
      "session-1",
      uri,
      "thumbnail"
    )
    expect(image.props.src).toBe("blob:eidos-url-image")
    expect(image.props.src).not.toBe(uri)

    await session.services.releaseAsset(
      { sessionId: "session-1", leaseId: urlLease.leaseId },
      { requestId: "release-network-image" }
    )
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:eidos-url-image")
    expect(releaseEidosFileAsset).toHaveBeenCalledWith(
      "session-1",
      urlLease.leaseId
    )
  })
})
