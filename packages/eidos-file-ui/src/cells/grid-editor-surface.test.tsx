// @vitest-environment jsdom

import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { GridCellKind } from "@glideapps/glide-data-grid"

import {
  EidosFileAttachmentCellRenderer,
  type EidosFileAttachmentCell,
} from "../eidos-file-attachment-cell"
import {
  EidosFileRelationCellRenderer,
  type EidosFileRelationCell,
} from "../eidos-file-relation-cell"

import DatePickerCellRenderer, { type DatePickerCell } from "./date-picker-cell"
import {
  EIDOS_FILE_GRID_EDITOR_ALIGN_OFFSET,
  EIDOS_FILE_GRID_EDITOR_CELL_EDGE_COMPENSATION,
  EIDOS_FILE_GRID_EDITOR_COLLISION_PADDING,
  EIDOS_FILE_GRID_EDITOR_PORTAL_CLASS_NAME,
  EIDOS_FILE_GRID_EDITOR_SIDE_OFFSET,
  EidosFileGridEditorHeader,
  EidosFileGridEditorSurface,
  eidosFileGridPopupEditor,
} from "./grid-editor-surface"
import MultiSelectCellRenderer, {
  type MultiSelectCell,
} from "./multi-select-cell"
import SelectCellRenderer, { type SelectCell } from "./select-cell"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("Eidos File Grid popup editors", () => {
  it("uses one unstyled Glide overlay contract", () => {
    const select: SelectCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "select-cell",
        value: null,
        allowedValues: [],
      },
    }
    const multiSelect: MultiSelectCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "multi-select-cell",
        values: [],
        allowedValues: [],
      },
    }
    const date: DatePickerCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "date-picker-cell",
        date: undefined,
        displayDate: "",
        format: "date",
      },
    }
    const file: EidosFileAttachmentCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "eidos-file-file-cell",
        entries: [],
      },
    }
    const relation: EidosFileRelationCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "eidos-file-relation-cell",
        values: [],
        multiple: true,
      },
    }

    for (const provider of [
      SelectCellRenderer.provideEditor?.(select),
      MultiSelectCellRenderer.provideEditor?.(multiSelect),
      DatePickerCellRenderer.provideEditor?.(date),
      EidosFileAttachmentCellRenderer.provideEditor?.(file),
      EidosFileRelationCellRenderer.provideEditor?.(relation),
    ]) {
      expect(provider).toMatchObject({
        disablePadding: true,
        disableStyling: true,
      })
    }
  })

  it("provides one canonical surface for popup editor chrome", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(<EidosFileGridEditorSurface />)
    })

    const surface = container.querySelector(
      "[data-eidos-file-grid-editor-surface]"
    )
    expect(surface?.className).toContain("w-80")
    expect(surface?.className).toContain("rounded-md")
    expect(surface?.className).toContain("border")
    expect(surface?.className).toContain("bg-popover")
    expect(surface?.className).toContain(
      "[box-shadow:var(--floating-surface-shadow)]"
    )
    expect(EIDOS_FILE_GRID_EDITOR_PORTAL_CLASS_NAME).toContain("shadow-none")
    expect(EIDOS_FILE_GRID_EDITOR_COLLISION_PADDING).toBe(12)
    expect(EIDOS_FILE_GRID_EDITOR_ALIGN_OFFSET).toBe(0)
    expect(EIDOS_FILE_GRID_EDITOR_SIDE_OFFSET).toBe(0)
    expect(EIDOS_FILE_GRID_EDITOR_CELL_EDGE_COMPENSATION).toBe(1)
    expect(eidosFileGridPopupEditor(() => null)).toMatchObject({
      disablePadding: true,
      disableStyling: true,
      styleOverride: {
        marginLeft: 1,
        marginTop: 1,
      },
    })

    act(() => root.unmount())
    container.remove()
  })

  it("provides one canonical header for popup editor hierarchy", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <EidosFileGridEditorSurface>
          <EidosFileGridEditorHeader
            icon={<span data-testid="icon" />}
            title="Editor title"
          />
        </EidosFileGridEditorSurface>
      )
    })

    const header = container.querySelector(
      "[data-eidos-file-grid-editor-header]"
    )
    expect(header?.className).toContain("h-10")
    expect(header?.className).toContain("border-b")
    expect(header?.textContent).toContain("Editor title")

    act(() => root.unmount())
    container.remove()
  })
})
