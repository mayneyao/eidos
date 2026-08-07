// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { TextFilePreviewResult } from "../shared/contracts"
import { MediaFilePreview } from "./media-file-preview"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

type MediaPreview = Extract<TextFilePreviewResult, { type: "media" }>

function mediaPreview(mediaKind: MediaPreview["mediaKind"]): MediaPreview {
  return {
    type: "media",
    relativePath: `assets/sample.${mediaKind === "image" ? "png" : mediaKind === "video" ? "mp4" : "mp3"}`,
    mediaKind,
    mimeType: "application/octet-stream",
    previewUrl: "eidos-space-media://preview/token-1",
    size: 42_000,
    modifiedAtMs: 0,
  }
}

describe("MediaFilePreview", () => {
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
  })

  async function render(preview: MediaPreview, onReveal = vi.fn()) {
    await act(async () => {
      root.render(createElement(MediaFilePreview, { preview, onReveal }))
    })
    return onReveal
  }

  it("renders browser-native surfaces for each media kind", async () => {
    await render(mediaPreview("image"))
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "eidos-space-media://preview/token-1"
    )
    expect(
      host
        .querySelector("[data-media-file-preview-kind]")
        ?.getAttribute("data-media-file-preview-kind")
    ).toBe("image")

    await act(async () => {
      root.render(
        createElement(MediaFilePreview, {
          preview: mediaPreview("video"),
          onReveal: vi.fn(),
        })
      )
    })
    expect(host.querySelector("video")?.getAttribute("src")).toBe(
      "eidos-space-media://preview/token-1"
    )
    expect(host.querySelector("video")?.hasAttribute("controls")).toBe(true)

    await act(async () => {
      root.render(
        createElement(MediaFilePreview, {
          preview: mediaPreview("audio"),
          onReveal: vi.fn(),
        })
      )
    })
    expect(host.querySelector("audio")?.getAttribute("src")).toBe(
      "eidos-space-media://preview/token-1"
    )
    expect(host.querySelector("audio")?.hasAttribute("controls")).toBe(true)
  })

  it("reveals the file in Finder from the meta bar", async () => {
    const onReveal = await render(mediaPreview("image"))
    const button = Array.from(host.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("Reveal in Finder")
    )
    expect(button).toBeDefined()
    await act(async () => {
      button?.click()
    })
    expect(onReveal).toHaveBeenCalledTimes(1)
  })

  it("labels the preview with its kind and path", async () => {
    await render(mediaPreview("audio"))
    expect(host.textContent).toContain("Audio")
    expect(host.textContent).toContain("41.0 KB")
    expect(
      host
        .querySelector("[data-media-file-preview]")
        ?.getAttribute("aria-label")
    ).toContain("assets/sample.mp3")
  })
})
