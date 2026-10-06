import { describe, expect, it } from "vitest"
import { createMobileAssets } from "./mobile-assets"
import {
  assertEidosFileAssetLease,
  eidosFileAssetResolutionAllowed,
} from "./eidos-file-asset-lease"

const entry = {
  id: "0198c72d-82b5-7968-b163-98be4b7477df",
  name: "图片.png",
  mediaType: "image/png",
  size: "4",
  uri: "assets/%E5%9B%BE.png",
}
const context = { requestId: "test", deadlineMilliseconds: 30000 }
const request = {
  sessionId: "test",
  entryId: entry.id,
  purpose: "thumbnail" as const,
}
const base = "https://appassets.androidplatform.net/document/test/"

describe("mobile attachment host", () => {
  it("resolves canonical encoded Runtime cells for gallery and record fields", async () => {
    const assets = createMobileAssets("test", base)
    assets.observe({ rows: [{ values: { image: JSON.stringify([entry]) } }] })
    expect(
      eidosFileAssetResolutionAllowed(assets.session, entry, "thumbnail")
    ).toBe(true)
    const lease = await assets.session.services.resolveAsset(request, context)
    assertEidosFileAssetLease(assets.session, entry, "thumbnail", lease)
    expect(lease.resourceToken).toBe(`${base}${entry.uri}`)
  })
  it("resolves decoded embedded images without network access", async () => {
    const assets = createMobileAssets("test", base)
    const inline = { ...entry, uri: "data:image/png;base64,AQIDBA==" }
    assets.observe({ rows: [{ image: [inline] }] })
    const lease = await assets.session.services.resolveAsset(request, context)
    expect(lease.resourceToken).toBe(inline.uri)
  })
  it("rejects unknown entries and closed or wrong sessions", async () => {
    const assets = createMobileAssets("test", base)
    await expect(
      assets.session.services.resolveAsset(request, context)
    ).rejects.toThrow()
    assets.observe([entry])
    await expect(
      assets.session.services.resolveAsset(
        { ...request, sessionId: "other" },
        context
      )
    ).rejects.toThrow()
    assets.close()
    assets.observe([entry])
    await expect(
      assets.session.services.resolveAsset(request, context)
    ).rejects.toThrow()
  })
  it("does not resolve local references outside the document directory", async () => {
    const assets = createMobileAssets("test", base)
    assets.observe([{ ...entry, uri: "../secret.png" }])
    await expect(
      assets.session.services.resolveAsset(request, context)
    ).rejects.toThrow()
  })
  it("uses the iOS scheme and bounds image size", async () => {
    const assets = createMobileAssets("test", "eidos://app/document/")
    assets.observe([entry])
    expect(
      (await assets.session.services.resolveAsset(request, context))
        .resourceToken
    ).toBe(`eidos://app/document/${entry.uri}`)
    assets.observe([{ ...entry, size: "16777217" }])
    await expect(
      assets.session.services.resolveAsset(request, context)
    ).rejects.toThrow("16 MB")
  })
})
