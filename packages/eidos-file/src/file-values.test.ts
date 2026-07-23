import { describe, expect, it } from "vitest"

import {
  assertEidosFileValues,
  decodeEidosFileAttachmentPaths,
  decodeEidosFileValues,
  eidosFileUriClass,
  encodeEidosFileAttachmentPaths,
  encodeEidosFileValues,
  normalizeEidosFileAttachmentPath,
} from "./file-values"

const FILE_ID = "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e"

function entry(
  uri: string,
  mediaType = "image/png",
  size = "1",
  extensions: Record<string, unknown> = {}
) {
  return {
    ...extensions,
    id: FILE_ID,
    mediaType,
    name: "asset",
    size,
    uri,
  }
}

describe("Eidos File field values", () => {
  it("stores portable File objects with stable UUIDv7 identities", () => {
    const encoded = encodeEidosFileAttachmentPaths([
      "assets/roadmap, final.pdf",
      "assets/cover.png",
      "assets/cover.png",
    ])
    expect(decodeEidosFileAttachmentPaths(encoded ?? undefined)).toEqual([
      "assets/roadmap%2C%20final.pdf",
      "assets/cover.png",
    ])
    expect(JSON.parse(encoded ?? "[]")).toEqual([
      expect.objectContaining({ uri: "assets/roadmap%2C%20final.pdf" }),
      expect.objectContaining({ uri: "assets/cover.png" }),
    ])
  })

  it("reads only canonical File object arrays", () => {
    const encoded = encodeEidosFileAttachmentPaths([
      "assets/a.png",
      "assets/report, final.pdf",
    ])
    expect(decodeEidosFileAttachmentPaths(encoded ?? undefined)).toEqual([
      "assets/a.png",
      "assets/report%2C%20final.pdf",
    ])
    expect(() => decodeEidosFileAttachmentPaths('["assets/a.png"]')).toThrow(
      /invalid entry/
    )
    expect(() =>
      decodeEidosFileAttachmentPaths("/files/a.png, /files/b.pdf")
    ).toThrow(/valid JSON/)
  })

  it("rejects paths that escape the Space or use unsafe schemes", () => {
    expect(normalizeEidosFileAttachmentPath("../../secret.txt")).toBeNull()
    expect(
      normalizeEidosFileAttachmentPath("file:///Users/me/secret.txt")
    ).toBeNull()
    expect(
      normalizeEidosFileAttachmentPath("https://example.com/image.png")
    ).toBe("https://example.com/image.png")
  })

  it("accepts only relative, HTTPS, and canonical inline-image URI classes", () => {
    expect(eidosFileUriClass("assets/a/../cover.png")).toBe("relative")
    expect(eidosFileUriClass("https://example.com/cover.png")).toBe("https")
    expect(eidosFileUriClass("HTTPs://[2001:db8::1]/cover.png")).toBe("https")
    expect(eidosFileUriClass("data:image/png;base64,AA==")).toBe("data")
    expect(eidosFileUriClass("//example.com/cover.png")).toBeNull()
    expect(eidosFileUriClass("https:cover.png")).toBeNull()
    expect(eidosFileUriClass("https:/cover.png")).toBeNull()
    expect(eidosFileUriClass("file:///tmp/cover.png")).toBeNull()
    expect(eidosFileUriClass("assets/%2e%2e/%2e%2e/secret.png")).toBeNull()
    expect(eidosFileUriClass("data:text/plain;base64,AA==")).toBeNull()
  })

  it("enforces RFC 6838 restricted media-type names", () => {
    expect(() =>
      assertEidosFileValues([entry("assets/a.bin", "application/vnd.eidos")])
    ).not.toThrow()
    for (const mediaType of [
      "*/png",
      ".image/png",
      "image/*",
      `${"a".repeat(128)}/png`,
    ]) {
      expect(() =>
        assertEidosFileValues([entry("assets/a.bin", mediaType)])
      ).toThrow(/invalid entry/)
    }
  })

  it("rejects non-canonical File JSON text before decoding", () => {
    const canonical = encodeEidosFileValues([entry("assets/a.png")])
    expect(decodeEidosFileValues(canonical)).toHaveLength(1)
    expect(() => decodeEidosFileValues(` ${canonical}`)).toThrow(
      /canonical JSON/
    )
    const nonCanonical = JSON.stringify([
      {
        uri: "assets/a.png",
        size: "1",
        name: "asset",
        mediaType: "image/png",
        id: FILE_ID,
      },
    ])
    expect(() => decodeEidosFileValues(nonCanonical)).toThrow(/canonical JSON/)
    expect(() => decodeEidosFileValues("")).toThrow(/valid JSON/)
  })

  it("validates canonical Base64, media type, decoded size, and padding bits", () => {
    expect(() =>
      assertEidosFileValues([entry("data:image/png;base64,AA==")])
    ).not.toThrow()
    expect(() =>
      assertEidosFileValues([
        entry("data:image/png;base64,AAA=", "image/png", "2"),
      ])
    ).not.toThrow()
    for (const candidate of [
      entry("data:image/png;base64,AA"),
      entry("data:image/png;base64,AA==\n"),
      entry("data:image/png;base64,AB=="),
      entry("data:image/png;base64,AA==", "image/jpeg"),
      entry("data:image/PNG;base64,AA==", "image/PNG"),
      entry("data:image/png;base64,AA==", "image/png", "2"),
      entry("data:image/png;base64,"),
    ]) {
      expect(() => assertEidosFileValues([candidate])).toThrow(/invalid entry/)
    }
  })

  it("accepts the 1 MiB inline boundary and rejects the next decoded byte", () => {
    const prefix = "AAAA".repeat(349_525)
    expect(() =>
      assertEidosFileValues([
        entry(`data:image/png;base64,${prefix}AA==`, "image/png", "1048576"),
      ])
    ).not.toThrow()
    expect(() =>
      assertEidosFileValues([
        entry(`data:image/png;base64,${prefix}AAA=`, "image/png", "1048577"),
      ])
    ).toThrow(/invalid entry/)
  })

  it("enforces the complete 16 MiB canonical File-cell limit", () => {
    const base = encodeEidosFileValues([
      entry("assets/cover.png", "image/png", "0", {
        "vendor.example.payload": "",
      }),
    ])
    const exactPayloadBytes =
      16 * 1_024 * 1_024 - new TextEncoder().encode(base).byteLength
    const exact = [
      entry("assets/cover.png", "image/png", "0", {
        "vendor.example.payload": "x".repeat(exactPayloadBytes),
      }),
    ]
    expect(new TextEncoder().encode(encodeEidosFileValues(exact))).toHaveLength(
      16 * 1_024 * 1_024
    )
    expect(() =>
      assertEidosFileValues([
        entry("assets/cover.png", "image/png", "0", {
          "vendor.example.payload": "x".repeat(exactPayloadBytes + 1),
        }),
      ])
    ).toThrow(/16 MiB/)
  })
})
