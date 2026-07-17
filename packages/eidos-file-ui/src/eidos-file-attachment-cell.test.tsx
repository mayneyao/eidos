// @vitest-environment jsdom

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { GridCellKind, type Theme } from "@glideapps/glide-data-grid"

import {
  EidosFileAttachmentCellEditor,
  EidosFileAttachmentCellRenderer,
  eidosFileAttachmentDisplayData,
  type EidosFileAttachmentCell,
} from "./eidos-file-attachment-cell"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function button(label: string) {
  return Array.from(document.body.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim().includes(label)
  )
}

describe("Eidos File cell", () => {
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

  it("delegates file previews and preserves portable paths on paste", () => {
    expect(
      eidosFileAttachmentDisplayData(
        ["assets/cover image.png"],
        (path) => `/~/${encodeURI(path)}`
      )
    ).toEqual(["/~/assets/cover%20image.png"])
    const cell: EidosFileAttachmentCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: { kind: "eidos-file-file-cell", paths: [], displayData: [] },
    }
    expect(
      EidosFileAttachmentCellRenderer.onPaste?.(
        '["/assets/cover.png","assets/report, final.pdf"]',
        cell.data
      )
    ).toMatchObject({
      paths: ["assets/cover.png", "assets/report, final.pdf"],
    })
  })

  it("adds imported files and removes attachments inside the cell editor", async () => {
    const onChange = vi.fn()
    const onImport = vi.fn().mockResolvedValue(["assets/report.pdf"])
    const cell: EidosFileAttachmentCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: '["assets/cover.png"]',
      data: {
        kind: "eidos-file-file-cell",
        paths: ["assets/cover.png"],
        displayData: eidosFileAttachmentDisplayData(["assets/cover.png"]),
        onImport,
      },
    }
    await act(async () => {
      root.render(
        <EidosFileAttachmentCellEditor
          value={cell}
          onChange={onChange}
          onFinishedEditing={vi.fn()}
          isHighlighted={false}
          target={{ x: 0, y: 0, width: 240, height: 36 }}
          forceEditMode={false}
          theme={{} as Theme}
        />
      )
    })

    await act(async () => {
      button("Add files")?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onImport).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paths: ["assets/cover.png", "assets/report.pdf"],
        }),
      })
    )

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Remove cover.png"]')
        ?.click()
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paths: [] }),
      })
    )
  })
})
