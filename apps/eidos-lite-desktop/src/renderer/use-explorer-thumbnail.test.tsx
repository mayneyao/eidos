// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type { SpaceTreeEntry } from "../shared/contracts"
import { useExplorerThumbnail } from "./use-explorer-thumbnail"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => vi.unstubAllGlobals())
let testId = 0
function Thumb({
  spaceId,
  entry,
  visible,
}: {
  spaceId: string
  entry: SpaceTreeEntry
  visible: boolean
}) {
  const url = useExplorerThumbnail(spaceId, entry, visible)
  return <span data-path={entry.relativePath} data-thumbnail={url ?? ""} />
}
const file = (name: string): SpaceTreeEntry => ({
  name,
  relativePath: name,
  kind: "file",
  size: 20,
  modifiedAtMs: 100,
})

it("loads only visible media, deduplicates readers and reuses ready thumbnails on view switches", async () => {
  const request = vi.fn(async () => "data:image/png;base64,ready")
  vi.stubGlobal("eidosLite", { getExplorerFileThumbnail: request })
  const host = document.createElement("div")
  const root = createRoot(host)
  const spaceId = "thumbnail-cache-" + testId++
  const entry = file("photo.jpg")
  const render = (visible: boolean) =>
    root.render(
      <>
        <Thumb spaceId={spaceId} entry={entry} visible={visible} />
        <Thumb spaceId={spaceId} entry={entry} visible={visible} />
        <Thumb spaceId={spaceId} entry={file("notes.md")} visible={visible} />
      </>
    )
  try {
    await act(async () => render(false))
    expect(request).not.toHaveBeenCalled()
    await act(async () => render(true))
    expect(request).toHaveBeenCalledTimes(1)
    expect(
      host
        .querySelector('[data-path="photo.jpg"]')
        ?.getAttribute("data-thumbnail")
    ).toBe("data:image/png;base64,ready")
    await act(async () => render(false))
    await act(async () => render(true))
    expect(request).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
  }
})

it("limits concurrency, skips inactive queued rows and rejects late results after changing Space", async () => {
  const completions: ((value: string | null) => void)[] = []
  const request = vi.fn(
    () => new Promise<string | null>((resolve) => completions.push(resolve))
  )
  vi.stubGlobal("eidosLite", { getExplorerFileThumbnail: request })
  const host = document.createElement("div")
  const root = createRoot(host)
  const spaceId = "thumbnail-queue-" + testId++
  try {
    await act(async () =>
      root.render(
        <>
          {["a.jpg", "b.mp4", "c.jpg", "d.mov"].map((name) => (
            <Thumb key={name} spaceId={spaceId} entry={file(name)} visible />
          ))}
        </>
      )
    )
    expect(request).toHaveBeenCalledTimes(2)
    await act(async () =>
      root.render(
        <Thumb
          spaceId={spaceId + "-other"}
          entry={file("other.jpg")}
          visible={false}
        />
      )
    )
    await act(async () => {
      for (const finish of completions)
        finish("data:image/png;base64,old-space")
    })
    expect(request).toHaveBeenCalledTimes(2)
    expect(host.querySelector("span")?.getAttribute("data-thumbnail")).toBe("")
  } finally {
    await act(async () => root.unmount())
  }
})

it("upgrades for screen-density changes without blanking the decoded image or reusing it for another file", async () => {
  vi.stubGlobal("devicePixelRatio", 1)
  let complete: (url: string | null) => void = () => {}
  const request = vi
    .fn()
    .mockResolvedValueOnce("data:image/png;base64,standard")
    .mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          complete = resolve
        })
    )
  vi.stubGlobal("eidosLite", { getExplorerFileThumbnail: request })
  const host = document.createElement("div")
  const root = createRoot(host)
  const spaceId = "thumbnail-density-" + testId++
  const entry = file("photo.jpg")
  try {
    await act(async () =>
      root.render(<Thumb spaceId={spaceId} entry={entry} visible />)
    )
    expect(request.mock.calls[0]![0].pixelSize).toBe(56)
    vi.stubGlobal("devicePixelRatio", 2)
    await act(async () => window.dispatchEvent(new Event("resize")))
    expect(request.mock.calls[1]![0].pixelSize).toBe(112)
    expect(host.querySelector("span")?.getAttribute("data-thumbnail")).toBe(
      "data:image/png;base64,standard"
    )
    await act(async () => complete("data:image/png;base64,retina"))
    expect(host.querySelector("span")?.getAttribute("data-thumbnail")).toBe(
      "data:image/png;base64,retina"
    )
    vi.stubGlobal("devicePixelRatio", 3)
    await act(async () => window.dispatchEvent(new Event("resize")))
    await act(async () => complete(null))
    expect(host.querySelector("span")?.getAttribute("data-thumbnail")).toBe(
      "data:image/png;base64,retina"
    )
    await act(async () =>
      root.render(
        <Thumb spaceId={spaceId} entry={file("other.jpg")} visible={false} />
      )
    )
    expect(host.querySelector("span")?.getAttribute("data-thumbnail")).toBe("")
  } finally {
    await act(async () => root.unmount())
  }
})

it("refreshes the thumbnail when file metadata changes and keeps failures local", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce("data:image/png;base64,original")
    .mockRejectedValueOnce(Error("No preview"))
  vi.stubGlobal("eidosLite", { getExplorerFileThumbnail: request })
  const host = document.createElement("div")
  const root = createRoot(host)
  const spaceId = "thumbnail-refresh-" + testId++
  const entry = file("clip.mp4")
  try {
    await act(async () =>
      root.render(<Thumb spaceId={spaceId} entry={entry} visible />)
    )
    expect(host.querySelector("span")?.getAttribute("data-thumbnail")).toBe(
      "data:image/png;base64,original"
    )
    await act(async () =>
      root.render(
        <Thumb
          spaceId={spaceId}
          entry={{ ...entry, modifiedAtMs: 101 }}
          visible
        />
      )
    )
    expect(request).toHaveBeenCalledTimes(2)
    expect(host.querySelector("span")?.getAttribute("data-thumbnail")).toBe("")
  } finally {
    await act(async () => root.unmount())
  }
})
