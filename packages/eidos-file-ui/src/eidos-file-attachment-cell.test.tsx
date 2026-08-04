// @vitest-environment jsdom

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  decodeEidosFileValues,
  encodeEidosFileAttachmentPaths,
  encodeEidosFileValues,
  type FileEntry,
} from "@eidos.space/eidos-file"
import { GridCellKind, type Theme } from "@glideapps/glide-data-grid"

import {
  EidosFileAttachmentCellEditor,
  EidosFileAttachmentCellRenderer,
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

  it("preserves complete Host-issued entries on paste", () => {
    const entry: FileEntry = {
      id: "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
      mediaType: "image/png",
      name: "cover.png",
      size: "12",
      uri: "assets/cover.png",
      "example.test": "preserved",
    }
    const cell: EidosFileAttachmentCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: { kind: "eidos-file-file-cell", entries: [] },
    }
    expect(
      EidosFileAttachmentCellRenderer.onPaste?.(
        encodeEidosFileValues([entry]),
        cell.data
      )
    ).toMatchObject({
      entries: [entry],
    })
  })

  it("draws Host-approved image sources in the Canvas cell", () => {
    const source = {
      naturalHeight: 48,
      naturalWidth: 96,
    } as unknown as CanvasImageSource
    const drawImage = vi.fn()
    const context = {
      beginPath: vi.fn(),
      clip: vi.fn(),
      drawImage,
      fillText: vi.fn(),
      rect: vi.fn(),
      restore: vi.fn(),
      roundRect: vi.fn(),
      save: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const cell: EidosFileAttachmentCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "eidos-file-file-cell",
        entries: [
          {
            id: "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
            mediaType: "image/png",
            name: "cover.png",
            size: "12",
            uri: "assets/cover.png",
          },
        ],
        thumbnails: [source],
      },
    }

    const drawArgs = {
      cell,
      col: 0,
      ctx: context,
      highlighted: false,
      hoverAmount: 0,
      hoverX: undefined,
      hoverY: undefined,
      imageLoader: {} as never,
      rect: { x: 0, y: 0, width: 180, height: 36 },
      row: 0,
      spriteManager: {} as never,
      theme: {
        baseFontStyle: "13px",
        cellHorizontalPadding: 8,
        cellVerticalPadding: 3,
        fontFamily: "sans-serif",
        textLight: "#666",
      } as never,
    } as unknown as Parameters<
      NonNullable<typeof EidosFileAttachmentCellRenderer.draw>
    >[0]
    EidosFileAttachmentCellRenderer.draw?.(drawArgs, cell)

    expect(drawImage).toHaveBeenCalledWith(source, 24, 0, 48, 48, 8, 3, 30, 30)
  })

  it("adds imported files and removes attachments inside the cell editor", async () => {
    const onChange = vi.fn()
    const existing = decodeEidosFileValues(
      encodeEidosFileAttachmentPaths(["assets/cover.png"])
    )
    const imported = decodeEidosFileValues(
      encodeEidosFileAttachmentPaths(["assets/report.pdf"])
    )
    const duplicate: FileEntry = {
      ...existing[0]!,
      id: "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45f",
    }
    const onImport = vi.fn().mockResolvedValue([duplicate, ...imported])
    const cell: EidosFileAttachmentCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: encodeEidosFileValues(existing),
      data: {
        kind: "eidos-file-file-cell",
        entries: existing,
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
    expect(container.textContent).toContain("Files")
    expect(container.textContent).not.toContain("application/octet-stream")
    expect(container.querySelector("code")).toBeNull()

    await act(async () => {
      button("Add files")?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onImport).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entries: [...existing, ...imported],
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
        data: expect.objectContaining({ entries: [] }),
      })
    )
  })
})
