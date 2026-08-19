// https://github.com/glideapps/glide-data-grid/blob/3041b6f44942ed6b38ab5761a6964fb55df09492/packages/source/src/use-undo-redo.ts

import type {
  EditableGridCell,
  GridCell,
  GridSelection,
  Item,
  DataEditorRef,
} from "@glideapps/glide-data-grid"

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"

export interface UndoRedoEdit {
  cell: Item
  newValue: EditableGridCell
}

export interface UndoRedoCommand {
  apply(): Promise<UndoRedoCommand>
  onError?(error: unknown): void
}

interface EditBatch {
  kind: "edits"
  edits: UndoRedoEdit[]
  selection: GridSelection
}

interface CommandBatch {
  kind: "command"
  command: UndoRedoCommand
}

type Batch = EditBatch | CommandBatch

interface ReducerState {
  undoHistory: Batch[]
  redoHistory: Batch[]
  canUndo: boolean
  canRedo: boolean
  isApplyingUndo: boolean
  isApplyingRedo: boolean

  operation?: Batch
}

const initialState: ReducerState = {
  undoHistory: [],
  redoHistory: [],
  canUndo: false,
  canRedo: false,
  isApplyingUndo: false,
  isApplyingRedo: false,
}

type Action =
  | UndoRedoAction
  | EditAction
  | CommandAppliedAction
  | CommandFailedAction
  | ResetAction

interface UndoRedoAction {
  type: "undo" | "redo" | "operationApplied"
}

interface EditAction {
  type: "edit"
  batch: Batch
  maxBatches: number
}

interface CommandAppliedAction {
  type: "commandApplied"
  inverse: CommandBatch
  maxBatches: number
}

interface CommandFailedAction {
  type: "commandFailed"
}

interface ResetAction {
  type: "reset"
}

function appendHistoryBatch(
  history: Batch[],
  batch: Batch,
  maxBatches: number
): Batch[] {
  const next = [...history, batch]
  if (!Number.isFinite(maxBatches)) return next
  const limit = Math.max(0, Math.floor(maxBatches))
  return limit === 0 ? [] : next.slice(-limit)
}

function reducer(state: ReducerState, action: Action) {
  const newState = { ...state }

  switch (action.type) {
    case "reset":
      return {
        ...initialState,
      }

    case "undo":
      if (state.canUndo && !state.isApplyingUndo && !state.isApplyingRedo) {
        newState.undoHistory = [...state.undoHistory]
        const operation = newState.undoHistory.pop()
        newState.operation = operation
        newState.canUndo = newState.undoHistory.length > 0
        newState.isApplyingUndo = true

        return newState
      }
      return state

    case "redo":
      if (state.canRedo && !state.isApplyingUndo && !state.isApplyingRedo) {
        newState.redoHistory = [...state.redoHistory]
        const operation = newState.redoHistory.pop()
        newState.operation = operation
        newState.canRedo = newState.redoHistory.length > 0
        newState.isApplyingRedo = true

        return newState
      }
      return state

    case "operationApplied":
      newState.operation = undefined
      newState.isApplyingRedo = false
      newState.isApplyingUndo = false

      return newState

    case "commandApplied":
      if (state.isApplyingUndo) {
        newState.redoHistory = appendHistoryBatch(
          state.redoHistory,
          action.inverse,
          action.maxBatches
        )
      } else if (state.isApplyingRedo) {
        newState.undoHistory = appendHistoryBatch(
          state.undoHistory,
          action.inverse,
          action.maxBatches
        )
      }
      newState.operation = undefined
      newState.isApplyingRedo = false
      newState.isApplyingUndo = false
      newState.canUndo = newState.undoHistory.length > 0
      newState.canRedo = newState.redoHistory.length > 0
      return newState

    case "commandFailed":
      if (state.operation) {
        if (state.isApplyingUndo) {
          newState.undoHistory = appendHistoryBatch(
            state.undoHistory,
            state.operation,
            Number.POSITIVE_INFINITY
          )
        } else if (state.isApplyingRedo) {
          newState.redoHistory = appendHistoryBatch(
            state.redoHistory,
            state.operation,
            Number.POSITIVE_INFINITY
          )
        }
      }
      newState.operation = undefined
      newState.isApplyingRedo = false
      newState.isApplyingUndo = false
      newState.canUndo = newState.undoHistory.length > 0
      newState.canRedo = newState.redoHistory.length > 0
      return newState

    case "edit":
      if (!state.isApplyingRedo && !state.isApplyingUndo) {
        newState.undoHistory = appendHistoryBatch(
          state.undoHistory,
          action.batch,
          action.maxBatches
        )
        newState.redoHistory = []
        newState.canUndo = newState.undoHistory.length > 0
        newState.canRedo = false
      }

      if (state.isApplyingUndo) {
        newState.redoHistory = appendHistoryBatch(
          state.redoHistory,
          action.batch,
          action.maxBatches
        )
        newState.canRedo = newState.redoHistory.length > 0
      }

      if (state.isApplyingRedo) {
        newState.undoHistory = appendHistoryBatch(
          state.undoHistory,
          action.batch,
          action.maxBatches
        )
        newState.canUndo = newState.undoHistory.length > 0
      }

      return newState

    default:
      throw new Error("Invalid action")
  }
}

export function useUndoRedo(
  gridRef: React.RefObject<DataEditorRef>,
  getCellContent: (cell: Item) => GridCell,
  onCellEdited: (cell: Item, newValue: EditableGridCell) => void,
  onGridSelectionChange?: (newVal: GridSelection) => void,
  isActive?: () => boolean,
  onCellsEdited?: (edits: readonly UndoRedoEdit[]) => void,
  maxHistoryBatches = Number.POSITIVE_INFINITY
) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const currentBatch = useRef<EditBatch | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isApplyingUndoRef = useRef(false)
  const isApplyingRedoRef = useRef(false)
  useEffect(() => {
    isApplyingUndoRef.current = state.isApplyingUndo
    isApplyingRedoRef.current = state.isApplyingRedo
  }, [state.isApplyingUndo, state.isApplyingRedo])

  const [gridSelection, setGridSelection] = useState<GridSelection | null>(null)
  const gridSelectionRef = useRef<GridSelection | null>(null)
  const onGridSelectionChangedEdited = useCallback(
    (newVal: GridSelection) => {
      if (onGridSelectionChange) {
        onGridSelectionChange(newVal)
      }
      setGridSelection(newVal)
      gridSelectionRef.current = newVal
    },
    [onGridSelectionChange]
  )

  const wrappedOnCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      const isApplyingUpdate =
        isApplyingUndoRef.current || isApplyingRedoRef.current

      if (!isApplyingUpdate && gridSelectionRef.current) {
        if (timeout.current) clearTimeout(timeout.current)
        const previousValue = getCellContent(cell) as EditableGridCell

        if (currentBatch.current === null) {
          currentBatch.current = {
            kind: "edits",
            edits: [],
            selection: gridSelectionRef.current,
          }
        }
        currentBatch.current.edits.push({ cell, newValue: previousValue })
        // When pasting lots of edits arrive sequentially. Undo/redo should replay in a batch so using a timeout to kick to the end of the event loop
        timeout.current = setTimeout(() => {
          if (currentBatch.current) {
            dispatch({
              type: "edit",
              batch: currentBatch.current,
              maxBatches: maxHistoryBatches,
            })
            currentBatch.current = null
          }
          timeout.current = null
        }, 0)
      }

      // Continue with the edit
      onCellEdited(cell, newValue)
    },
    [getCellContent, maxHistoryBatches, onCellEdited]
  )

  const wrappedOnCellsEdited = useCallback(
    (edits: readonly UndoRedoEdit[]) => {
      if (edits.length === 0) return
      const isApplyingUpdate =
        isApplyingUndoRef.current || isApplyingRedoRef.current

      if (!isApplyingUpdate && gridSelectionRef.current) {
        if (timeout.current) clearTimeout(timeout.current)
        timeout.current = null
        if (currentBatch.current) {
          dispatch({
            type: "edit",
            batch: currentBatch.current,
            maxBatches: maxHistoryBatches,
          })
          currentBatch.current = null
        }
        dispatch({
          type: "edit",
          batch: {
            kind: "edits",
            edits: edits.map(({ cell }) => ({
              cell,
              newValue: getCellContent(cell) as EditableGridCell,
            })),
            selection: gridSelectionRef.current,
          },
          maxBatches: maxHistoryBatches,
        })
      }

      if (onCellsEdited) {
        onCellsEdited(edits)
      } else {
        for (const edit of edits) onCellEdited(edit.cell, edit.newValue)
      }
    },
    [getCellContent, maxHistoryBatches, onCellEdited, onCellsEdited]
  )

  const undo = useCallback(() => {
    dispatch({ type: "undo" })
  }, [dispatch])

  const redo = useCallback(() => {
    dispatch({ type: "redo" })
  }, [dispatch])

  const reset = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current)
    timeout.current = null
    currentBatch.current = null
    dispatch({ type: "reset" })
  }, [dispatch])

  const recordCommand = useCallback(
    (command: UndoRedoCommand) => {
      if (timeout.current) clearTimeout(timeout.current)
      timeout.current = null
      if (currentBatch.current) {
        dispatch({
          type: "edit",
          batch: currentBatch.current,
          maxBatches: maxHistoryBatches,
        })
        currentBatch.current = null
      }
      dispatch({
        type: "edit",
        batch: { kind: "command", command },
        maxBatches: maxHistoryBatches,
      })
    },
    [maxHistoryBatches]
  )

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current)
    },
    []
  )

  // Apply an asynchronous semantic command. Keeping this separate from the
  // cell effect prevents a page refresh from restarting an in-flight command.
  useEffect(() => {
    if (state.operation?.kind !== "command") return
    let disposed = false
    const { command } = state.operation
    void command
      .apply()
      .then((inverse) => {
        if (disposed) return
        dispatch({
          type: "commandApplied",
          inverse: { kind: "command", command: inverse },
          maxBatches: maxHistoryBatches,
        })
      })
      .catch((error) => {
        if (disposed) return
        command.onError?.(error)
        dispatch({ type: "commandFailed" })
      })
    return () => {
      disposed = true
    }
  }, [maxHistoryBatches, state.operation])

  // Apply a batch of cell edits to the grid.
  useEffect(() => {
    if (
      state.operation?.kind === "edits" &&
      gridSelectionRef.current &&
      gridRef.current
    ) {
      const cells = [] as { cell: Item }[]
      const previousState: Batch = {
        kind: "edits",
        edits: [],
        selection: gridSelectionRef.current,
      }

      for (const edit of state.operation.edits) {
        const prevValue = getCellContent(edit.cell) as EditableGridCell
        previousState.edits.push({ cell: edit.cell, newValue: prevValue })
        cells.push({ cell: edit.cell })
      }
      if (onCellsEdited) {
        onCellsEdited(state.operation.edits)
      } else {
        for (const edit of state.operation.edits) {
          onCellEdited(edit.cell, edit.newValue)
        }
      }

      setGridSelection(state.operation.selection)
      gridSelectionRef.current = state.operation.selection
      gridRef.current.updateCells(cells)

      dispatch({
        type: "edit",
        batch: previousState,
        maxBatches: maxHistoryBatches,
      })

      dispatch({
        type: "operationApplied",
      })
    }
  }, [
    state.operation,
    gridRef,
    onCellEdited,
    onCellsEdited,
    setGridSelection,
    getCellContent,
    maxHistoryBatches,
  ])

  const historyRows = useMemo(() => {
    const rows = new Set<number>()
    const batches = [
      ...state.undoHistory,
      ...state.redoHistory,
      ...(state.operation ? [state.operation] : []),
    ]
    for (const batch of batches) {
      if (batch.kind !== "edits") continue
      for (const edit of batch.edits) rows.add(edit.cell[1])
    }
    return rows
  }, [state.operation, state.redoHistory, state.undoHistory])

  // Attach the keyboard shortcuts. CMD+Z and CMD+SHIFT+Z on mac, CTRL+Z and CTRL+Y on windows.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isActive && !isActive()) return
      if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      }

      if (e.key === "y" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isActive, redo, undo])

  return useMemo(() => {
    return {
      undo,
      redo,
      reset,
      recordCommand,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      onCellEdited: wrappedOnCellEdited,
      onCellsEdited: wrappedOnCellsEdited,
      onGridSelectionChange: onGridSelectionChangedEdited,
      gridSelection,
      historyRows,
    }
  }, [
    undo,
    redo,
    reset,
    recordCommand,
    wrappedOnCellEdited,
    wrappedOnCellsEdited,
    state.canUndo,
    state.canRedo,
    onGridSelectionChangedEdited,
    gridSelection,
    historyRows,
  ])
}
