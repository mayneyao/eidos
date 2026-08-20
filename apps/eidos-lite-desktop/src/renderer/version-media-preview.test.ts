// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { EidosLiteApi, TextFilePreviewResult } from "../shared/contracts"
import { VersionWorkingMediaPreview } from "./version-media-preview"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe("VersionWorkingMediaPreview", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  function installPreview(preview: TextFilePreviewResult) {
    const previewTextFile = vi.fn().mockResolvedValue(preview)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: { previewTextFile } as unknown as EidosLiteApi,
    })
    return previewTextFile
  }

  it("renders a newly added local image through the existing media surface", async () => {
    const previewTextFile = installPreview({
      type: "media",
      relativePath: "dev/assets/image.png",
      mediaKind: "image",
      mimeType: "image/png",
      previewUrl: "eidos-space-media://preview/image-token",
      size: 595_461,
      modifiedAtMs: 1_700_000_000_000,
    })

    await act(async () => {
      root.render(
        createElement(VersionWorkingMediaPreview, {
          path: "dev/assets/image.png",
        })
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(previewTextFile).toHaveBeenCalledWith("dev/assets/image.png")
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "eidos-space-media://preview/image-token"
    )
    expect(host.textContent).toContain("581.5 KB")
    expect(host.textContent).not.toContain("File change recorded")
  })

  it("keeps unsupported local binary files in an honest fallback", async () => {
    installPreview({
      type: "unavailable",
      relativePath: "dev/assets/archive.bin",
      reason: "binary",
      size: 42,
      modifiedAtMs: 1_700_000_000_000,
    })

    await act(async () => {
      root.render(
        createElement(VersionWorkingMediaPreview, {
          path: "dev/assets/archive.bin",
        })
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(host.textContent).toContain("Preview not available")
    expect(host.textContent).toContain("dev/assets/archive.bin")
    expect(host.querySelector("img")).toBeNull()
  })
})
