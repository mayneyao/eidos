import { rendererPlatform } from "./renderer-platform"

describe("renderer platform", () => {
  it("distinguishes Windows so the titlebar reserves overlay controls", () => {
    expect(
      rendererPlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      )
    ).toBe("win32")
  })

  it("keeps macOS and other platforms distinct", () => {
    expect(rendererPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe(
      "darwin"
    )
    expect(rendererPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("other")
  })
})
