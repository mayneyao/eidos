import {
  resolveEfmImagePresentationUri,
  resolveEfmResourceUri,
} from "./efm-uri"

describe("EFM resource URI policy", () => {
  it("allows declared active schemes and same-document fragments", () => {
    expect(resolveEfmResourceUri("https://eidos.space/docs")).toBe(
      "https://eidos.space/docs"
    )
    expect(resolveEfmResourceUri("mailto:hello@eidos.space")).toBe(
      "mailto:hello@eidos.space"
    )
    expect(resolveEfmResourceUri("#footnote")).toBe("#footnote")
  })

  it("resolves relative resources only against a declared base", () => {
    expect(resolveEfmResourceUri("./guide.md")).toBeNull()
    expect(
      resolveEfmResourceUri("./guide.md", "https://eidos.space/docs/")
    ).toBe("https://eidos.space/docs/guide.md")
  })

  it("rejects denied schemes even when controls obscure the scheme", () => {
    expect(resolveEfmResourceUri("java\nscript:alert(1)")).toBeNull()
    expect(resolveEfmResourceUri("data:text/html,unsafe")).toBeNull()
    expect(resolveEfmResourceUri("file:///tmp/private")).toBeNull()
  })

  it("limits image resources to HTTP and HTTPS", () => {
    expect(
      resolveEfmResourceUri("https://eidos.space/image.png", undefined, {
        image: true,
      })
    ).toBe("https://eidos.space/image.png")
    expect(
      resolveEfmResourceUri("mailto:image@eidos.space", undefined, {
        image: true,
      })
    ).toBeNull()
    expect(
      resolveEfmResourceUri("#image", undefined, { image: true })
    ).toBeNull()
  })
})

describe("EFM host image presentation URIs", () => {
  it("allows transient blob URLs without allowing data or file URLs", () => {
    expect(
      resolveEfmImagePresentationUri("blob:https://eidos.space/asset")
    ).toBe("blob:https://eidos.space/asset")
    expect(
      resolveEfmImagePresentationUri("https://eidos.space/image.png")
    ).toBe("https://eidos.space/image.png")
    expect(
      resolveEfmImagePresentationUri("data:image/png;base64,unsafe")
    ).toBeNull()
    expect(resolveEfmImagePresentationUri("file:///tmp/private.png")).toBeNull()
  })
})
