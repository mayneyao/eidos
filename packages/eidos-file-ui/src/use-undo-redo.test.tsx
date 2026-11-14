// @vitest-environment jsdom
import { act, StrictMode, useCallback, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  CompactSelection,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
} from "@glideapps/glide-data-grid"
import { expect, it, vi } from "vitest"
import { useUndoRedo, type UndoRedoEdit } from "./use-undo-redo"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

it.each(["command", "keyboard"])(
  "applies each cell history entry once across synchronous renders in StrictMode (%s)",
  async (entry) => {
    const element = document.createElement("div")
    document.body.append(element)
    const root = createRoot(element)
    const values = [true, true]
    const updateCells = vi.fn()
    const apply = vi.fn((edits: readonly UndoRedoEdit[]) => {
      for (const edit of edits)
        values[edit.cell[0]] = Boolean(
          (edit.newValue as EditableGridCell & { data: unknown }).data
        )
    })
    let history: ReturnType<typeof useUndoRedo> | undefined
    function Harness() {
      const [version, setVersion] = useState(0)
      const grid = useRef({ updateCells } as unknown as DataEditorRef)
      const getCell = useCallback(
        ([column]: readonly [number, number]): GridCell => ({
          kind: GridCellKind.Boolean,
          allowOverlay: false,
          data: values[column]!,
        }),
        [version]
      )
      const commit = (edits: readonly UndoRedoEdit[]) => {
        apply(edits)
        setVersion((current) => current + 1)
      }
      history = useUndoRedo(
        grid,
        getCell,
        (cell, newValue) => commit([{ cell, newValue }]),
        undefined,
        () => true,
        commit
      )
      return <span>{version}</span>
    }
    const invoke = async (redo = false) => {
      await act(async () => {
        if (entry === "command") (redo ? history!.redo : history!.undo)()
        else
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "z",
              metaKey: true,
              shiftKey: redo,
            })
          )
      })
    }
    const edit = async (value: boolean) => {
      await act(async () =>
        history!.onCellsEdited(
          values.map((_, column) => ({
            cell: [column, 0] as const,
            newValue: {
              kind: GridCellKind.Boolean,
              allowOverlay: false,
              data: value,
            },
          }))
        )
      )
    }
    try {
      await act(async () =>
        root.render(
          <StrictMode>
            <Harness />
          </StrictMode>
        )
      )
      act(() =>
        history!.onGridSelectionChange({
          columns: CompactSelection.empty(),
          rows: CompactSelection.empty(),
          current: {
            cell: [0, 0],
            range: { x: 0, y: 0, width: 2, height: 1 },
            rangeStack: [],
          },
        })
      )
      await edit(false)
      expect(values).toEqual([false, false])
      apply.mockClear()
      updateCells.mockClear()
      await invoke()
      expect(values).toEqual([true, true])
      expect(apply).toHaveBeenCalledOnce()
      expect(updateCells).toHaveBeenCalledOnce()
      await invoke(true)
      expect(values).toEqual([false, false])
      expect(apply).toHaveBeenCalledTimes(2)
      // Equal-valued history entries are still separate operations.
      await edit(false)
      apply.mockClear()
      await invoke()
      expect(values).toEqual([false, false])
      expect(apply).toHaveBeenCalledOnce()
      await invoke()
      expect(values).toEqual([true, true])
      expect(apply).toHaveBeenCalledTimes(2)
      act(() => history!.reset())
      apply.mockClear()
      await invoke()
      expect(apply).not.toHaveBeenCalled()
    } finally {
      act(() => root.unmount())
      element.remove()
    }
    apply.mockClear()
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", metaKey: true })
    )
    expect(apply).not.toHaveBeenCalled()
  }
)
