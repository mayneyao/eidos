import type { CodeMirrorFormulaEditorRef } from "@/components/formula-editor/codemirror-editor"
import { FieldType } from "@/packages/core/fields/const"
import type { FormulaProperty } from "@/packages/core/fields/formula"
import type { IField } from "@/packages/core/types/IField"
import type {
  DataEditorRef,
  GridSelection,
  Item,
} from "@glideapps/glide-data-grid"
import { useCallback, useEffect, useRef, useState } from "react"
import { defaultConfig } from "../helper"
import { getFieldInstance } from "@/packages/core/fields"

export const useFormulaEditor = (
  showColumns: IField<any>[],
  glideDataGridRef: React.RefObject<DataEditorRef>,
  formulaEditorRef: React.RefObject<HTMLDivElement>,
  selection: GridSelection
) => {
  const [isActiveFormulaCell, setIsActiveFormulaCell] = useState<boolean>(false)
  const editorRef = useRef<CodeMirrorFormulaEditorRef>(null)
  const [formulaField, setFormulaField] =
    useState<IField<FormulaProperty> | null>(null)
  const [rowIndex, setRowIndex] = useState<number | null>(null)
  const handleFocus = useCallback(() => {
    editorRef.current?.focus()
  }, [])

  const refreshEditorPosition = useCallback(() => {
    if (selection.current && formulaField && rowIndex !== null) {
      const bounds = glideDataGridRef.current?.getBounds(
        selection.current.cell[0],
        selection.current.cell[1]
      )
      const newTop =
        (defaultConfig.rowHeight as number) + (bounds?.y as number) + 8

      if (bounds && formulaEditorRef.current) {
        // Get editor dimensions
        const editorWidth = formulaEditorRef.current.offsetWidth
        const editorHeight = formulaEditorRef.current.offsetHeight

        // Get viewport dimensions
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        // Calculate positions ensuring editor stays within viewport
        let left = bounds.x
        let top = newTop

        // Adjust horizontal position if needed
        if (left + editorWidth > viewportWidth) {
          left = Math.max(0, viewportWidth - editorWidth)
        }

        // Adjust vertical position if needed
        if (top + editorHeight > viewportHeight) {
          // Try to position above the cell if there's not enough space below
          const topAbove = bounds.y - editorHeight - 8
          if (topAbove > 0) {
            top = topAbove
          } else {
            // If not enough space above either, just ensure it's visible
            top = Math.max(0, viewportHeight - editorHeight)
          }
        }

        // Add smooth transition for position changes
        formulaEditorRef.current.style.transition =
          "left 0.15s ease-out, top 0.15s ease-out"
        formulaEditorRef.current.style.left = `${left}px`
        formulaEditorRef.current.style.top = `${top}px`
      }
    }
  }, [selection, formulaField, rowIndex, glideDataGridRef, formulaEditorRef])

  // Add effect to initialize transition property when component mounts
  useEffect(() => {
    if (formulaEditorRef.current) {
      formulaEditorRef.current.style.transition =
        "left 0.15s ease-out, top 0.15s ease-out"
    }
  }, [formulaEditorRef])

  // Add window resize listener to reposition editor when window size changes
  useEffect(() => {
    if (isActiveFormulaCell) {
      const handleResize = () => {
        refreshEditorPosition()
      }

      window.addEventListener("resize", handleResize)

      // Initial positioning
      refreshEditorPosition()

      return () => {
        window.removeEventListener("resize", handleResize)
      }
    }
  }, [isActiveFormulaCell, refreshEditorPosition])

  useEffect(() => {
    if (selection.current) {
      const column = showColumns[selection.current?.cell[0]]
      const rowIndex = selection.current?.cell[1]
      if (column && column.type === FieldType.Formula) {
        setFormulaField(column as IField<FormulaProperty>)
        setRowIndex(rowIndex)
        setTimeout(() => refreshEditorPosition(), 0)
      } else {
        setIsActiveFormulaCell(false)
        setFormulaField(null)
      }
    }
  }, [selection, refreshEditorPosition])

  const onCellActivated = useCallback(
    (cell: Item) => {
      const column = showColumns[cell[0]]
      const open =
        column.type === FieldType.Formula &&
        getFieldInstance(column)?.displayType !== FieldType.File
      setIsActiveFormulaCell(open)
    },
    [showColumns, glideDataGridRef, formulaEditorRef]
  )

  const closeEditor = useCallback(() => {
    try {
      setIsActiveFormulaCell(false)
      setFormulaField(null)

      setTimeout(() => {
        glideDataGridRef.current?.focus()
      }, 0)
    } catch (error) {
      console.error("Error closing formula editor:", error)
    }
  }, [])

  useEffect(() => {
    if (isActiveFormulaCell) {
      setTimeout(() => {
        handleFocus()
      }, 100)
    }
  }, [isActiveFormulaCell, handleFocus, selection])

  return {
    onCellActivated,
    showEditor: isActiveFormulaCell,
    editorRef,
    handleFocus,
    closeEditor,
    formulaField,
    rowIndex,
    refreshEditorPosition,
  }
}
