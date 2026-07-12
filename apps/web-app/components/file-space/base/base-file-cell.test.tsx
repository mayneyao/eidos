// @vitest-environment jsdom

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { GridCellKind } from "@glideapps/glide-data-grid"

import {
  BaseFileCellEditor,
  BaseFileCellRenderer,
  baseFileDisplayData,
  type BaseFileCell,
} from "./base-file-cell"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function button(label: string) {
  return Array.from(document.body.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim().includes(label)
  )
}

describe("Base file cell", () => {
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

  it("renders Space assets and preserves portable paths on paste", () => {
    expect(baseFileDisplayData(["assets/cover image.png"])).toEqual([
      "/~/assets/cover%20image.png",
    ])
    const cell: BaseFileCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: { kind: "base-file-cell", paths: [], displayData: [] },
    }
    expect(
      BaseFileCellRenderer.onPaste?.(
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
    const cell: BaseFileCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: '["assets/cover.png"]',
      data: {
        kind: "base-file-cell",
        paths: ["assets/cover.png"],
        displayData: baseFileDisplayData(["assets/cover.png"]),
        onImport,
      },
    }
    await act(async () => {
      root.render(
        <BaseFileCellEditor
          value={cell}
          onChange={onChange}
          onFinishedEditing={vi.fn()}
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
