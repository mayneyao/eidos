// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import {
  encodeEidosFileAttachmentPaths,
  decodeEidosFileValues,
} from "@eidos.space/eidos-file"
import { EidosFileGalleryPreview } from "./eidos-file-gallery-preview"

vi.mock("./eidos-file-entry-surface", () => ({
  EidosFileEntrySurface: ({
    entry,
    onPrevious,
    onNext,
    onPreviewClose,
  }: {
    entry: { name: string }
    onPrevious?: () => void
    onNext?: () => void
    onPreviewClose: () => void
  }) => (
    <div>
      <span>{entry.name}</span>
      <button onClick={onPrevious} disabled={!onPrevious}>
        Previous
      </button>
      <button onClick={onNext} disabled={!onNext}>
        Next
      </button>
      <button onClick={onPreviewClose}>Close</button>
    </div>
  ),
}))
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

it("navigates cached covers and bounded pages in both directions, skipping empty covers", async () => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const row = (index: number) => ({
    _id: String(index),
    cover: encodeEidosFileAttachmentPaths([`${index}.jpg`]),
  })
  const rows = [row(0), { _id: "empty", cover: "[]" }, row(2), row(3)]
  const initialEntry = decodeEidosFileValues(rows[0]!.cover).at(0)!
  const loadPage = vi.fn(async (offset: number, limit: number) => ({
    tableId: "photos",
    offset,
    limit,
    total: 4,
    rows: rows.slice(offset, offset + limit),
  }))
  const close = vi.fn()
  const click = async (text: string) =>
    act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === text)!
        .click()
      await Promise.resolve()
    })
  try {
    await act(async () =>
      root.render(
        <EidosFileGalleryPreview
          initial={{ entry: initialEntry, index: 0 }}
          rowWindow={{ rows: rows.slice(0, 2), startOffset: 0, total: 4 }}
          coverColumn="cover"
          loadPage={loadPage}
          onClose={close}
        />
      )
    )
    expect(container.querySelector("span")!.textContent).toBe("0.jpg")
    await click("Next")
    expect(container.querySelector("span")!.textContent).toBe("2.jpg")
    expect(loadPage).toHaveBeenCalledWith(2, 2, 4)
    await click("Next")
    expect(container.querySelector("span")!.textContent).toBe("3.jpg")
    expect(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Next"
      )!.disabled
    ).toBe(true)
    await click("Previous")
    expect(container.querySelector("span")!.textContent).toBe("2.jpg")
    await click("Previous")
    expect(container.querySelector("span")!.textContent).toBe("0.jpg")
    await click("Close")
    expect(close).toHaveBeenCalledOnce()
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
