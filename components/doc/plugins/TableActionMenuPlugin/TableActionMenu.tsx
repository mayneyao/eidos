import { useCallback, useEffect, useRef, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $getNodeTriplet,
  $getTableColumnIndexFromTableCellNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $getTableRowIndexFromTableCellNode,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
  $isTableCellNode,
  $isTableRowNode,
  $isTableSelection,
  $unmergeCell,
  TableCellHeaderStates,
  TableCellNode,
  TableRowNode,
  getTableElement,
  getTableObserverFromTableElement,
} from "@lexical/table"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
} from "lexical"
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  GripHorizontal,
  GripVertical,
  MergeIcon,
  SplitIcon,
  Table,
  TableProperties,
  Trash2,
} from "lucide-react"
import { createPortal } from "react-dom"

import invariant from "../../utils/invariant"
import {
  $canUnmerge,
  $cellContainsEmptyParagraph,
  $selectLastDescendant,
  computeSelectionCount,
  currentCellBackgroundColor,
} from "./helper"

export type TableCellActionMenuProps = Readonly<{
  contextRef: { current: null | HTMLElement }
  onClose: () => void
  setIsMenuOpen: (isOpen: boolean) => void
  showColorPickerModal: (
    title: string,
    showModal: (onClose: () => void) => JSX.Element
  ) => void
  tableCellNode: TableCellNode
  cellMerge: boolean
}>
export function TableActionMenu({
  onClose,
  tableCellNode: _tableCellNode,
  setIsMenuOpen,
  contextRef,
  cellMerge,
  showColorPickerModal,
}: TableCellActionMenuProps) {
  const [editor] = useLexicalComposerContext()
  const dropDownRef = useRef<HTMLDivElement | null>(null)
  const [tableCellNode, updateTableCellNode] = useState(_tableCellNode)
  const [selectionCounts, updateSelectionCounts] = useState({
    columns: 1,
    rows: 1,
  })
  const [canMergeCells, setCanMergeCells] = useState(false)
  const [canUnmergeCell, setCanUnmergeCell] = useState(false)
  const [backgroundColor, setBackgroundColor] = useState(
    () => currentCellBackgroundColor(editor) || ""
  )

  useEffect(() => {
    return editor.registerMutationListener(
      TableCellNode,
      (nodeMutations) => {
        const nodeUpdated =
          nodeMutations.get(tableCellNode.getKey()) === "updated"

        if (nodeUpdated) {
          editor.getEditorState().read(() => {
            updateTableCellNode(tableCellNode.getLatest())
          })
          setBackgroundColor(currentCellBackgroundColor(editor) || "")
        }
      },
      { skipInitialization: true }
    )
  }, [editor, tableCellNode])

  useEffect(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      // Merge cells
      if ($isTableSelection(selection)) {
        const currentSelectionCounts = computeSelectionCount(selection)
        updateSelectionCounts(computeSelectionCount(selection))
        setCanMergeCells(
          currentSelectionCounts.columns > 1 || currentSelectionCounts.rows > 1
        )
      }
      // Unmerge cell
      setCanUnmergeCell($canUnmerge())
    })
  }, [editor])

  useEffect(() => {
    const menuButtonElement = contextRef.current
    const dropDownElement = dropDownRef.current
    const rootElement = editor.getRootElement()

    if (
      menuButtonElement != null &&
      dropDownElement != null &&
      rootElement != null
    ) {
      const rootEleRect = rootElement.getBoundingClientRect()
      const menuButtonRect = menuButtonElement.getBoundingClientRect()
      dropDownElement.style.opacity = "1"
      const dropDownElementRect = dropDownElement.getBoundingClientRect()
      const margin = 5
      let leftPosition = menuButtonRect.right + margin
      if (
        leftPosition + dropDownElementRect.width > window.innerWidth ||
        leftPosition + dropDownElementRect.width > rootEleRect.right
      ) {
        const position =
          menuButtonRect.left - dropDownElementRect.width - margin
        leftPosition = (position < 0 ? margin : position) + window.pageXOffset
      }
      dropDownElement.style.left = `${leftPosition + window.pageXOffset}px`

      let topPosition = menuButtonRect.top
      if (topPosition + dropDownElementRect.height > window.innerHeight) {
        const position = menuButtonRect.bottom - dropDownElementRect.height
        topPosition = (position < 0 ? margin : position) + window.pageYOffset
      }
      dropDownElement.style.top = `${topPosition + +window.pageYOffset}px`
    }
  }, [contextRef, dropDownRef, editor])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropDownRef.current != null &&
        contextRef.current != null &&
        !dropDownRef.current.contains(event.target as Node) &&
        !contextRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false)
      }
    }

    window.addEventListener("click", handleClickOutside)

    return () => window.removeEventListener("click", handleClickOutside)
  }, [setIsMenuOpen, contextRef])

  const clearTableSelection = useCallback(() => {
    editor.update(() => {
      if (tableCellNode.isAttached()) {
        const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode)
        const tableElement = getTableElement(
          tableNode,
          editor.getElementByKey(tableNode.getKey())
        )

        invariant(
          tableElement !== null,
          "TableActionMenu: Expected to find tableElement in DOM"
        )

        const tableObserver = getTableObserverFromTableElement(tableElement)
        if (tableObserver !== null) {
          tableObserver.$clearHighlight()
        }

        tableNode.markDirty()
        updateTableCellNode(tableCellNode.getLatest())
      }

      const rootNode = $getRoot()
      rootNode.selectStart()
    })
  }, [editor, tableCellNode])

  const mergeTableCellsAtSelection = () => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isTableSelection(selection)) {
        const { columns, rows } = computeSelectionCount(selection)
        const nodes = selection.getNodes()
        let firstCell: null | TableCellNode = null
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          if ($isTableCellNode(node)) {
            if (firstCell === null) {
              node.setColSpan(columns).setRowSpan(rows)
              firstCell = node
              const isEmpty = $cellContainsEmptyParagraph(node)
              let firstChild
              if (
                isEmpty &&
                $isParagraphNode((firstChild = node.getFirstChild()))
              ) {
                firstChild.remove()
              }
            } else if ($isTableCellNode(firstCell)) {
              const isEmpty = $cellContainsEmptyParagraph(node)
              if (!isEmpty) {
                firstCell.append(...node.getChildren())
              }
              node.remove()
            }
          }
        }
        if (firstCell !== null) {
          if (firstCell.getChildrenSize() === 0) {
            firstCell.append($createParagraphNode())
          }
          $selectLastDescendant(firstCell)
        }
        onClose()
      }
    })
  }

  const unmergeTableCellsAtSelection = () => {
    editor.update(() => {
      $unmergeCell()
    })
  }

  const insertTableRowAtSelection = useCallback(
    (shouldInsertAfter: boolean) => {
      editor.update(() => {
        $insertTableRow__EXPERIMENTAL(shouldInsertAfter)
        onClose()
      })
    },
    [editor, onClose]
  )

  const insertTableColumnAtSelection = useCallback(
    (shouldInsertAfter: boolean) => {
      editor.update(() => {
        for (let i = 0; i < selectionCounts.columns; i++) {
          $insertTableColumn__EXPERIMENTAL(shouldInsertAfter)
        }
        onClose()
      })
    },
    [editor, onClose, selectionCounts.columns]
  )

  const deleteTableRowAtSelection = useCallback(() => {
    editor.update(() => {
      $deleteTableRow__EXPERIMENTAL()
      onClose()
    })
  }, [editor, onClose])

  const deleteTableAtSelection = useCallback(() => {
    editor.update(() => {
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode)
      tableNode.remove()

      clearTableSelection()
      onClose()
    })
  }, [editor, tableCellNode, clearTableSelection, onClose])

  const deleteTableColumnAtSelection = useCallback(() => {
    editor.update(() => {
      $deleteTableColumn__EXPERIMENTAL()
      onClose()
    })
  }, [editor, onClose])

  const toggleTableRowIsHeader = useCallback(() => {
    editor.update(() => {
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode)

      const tableRowIndex = $getTableRowIndexFromTableCellNode(tableCellNode)

      const tableRows = tableNode.getChildren()

      if (tableRowIndex >= tableRows.length || tableRowIndex < 0) {
        throw new Error("Expected table cell to be inside of table row.")
      }

      const tableRow = tableRows[tableRowIndex]

      if (!$isTableRowNode(tableRow)) {
        throw new Error("Expected table row")
      }

      const newStyle =
        tableCellNode.getHeaderStyles() ^ TableCellHeaderStates.ROW
      tableRow.getChildren().forEach((tableCell) => {
        if (!$isTableCellNode(tableCell)) {
          throw new Error("Expected table cell")
        }

        tableCell.setHeaderStyles(newStyle, TableCellHeaderStates.ROW)
      })

      clearTableSelection()
      onClose()
    })
  }, [editor, tableCellNode, clearTableSelection, onClose])

  const toggleTableColumnIsHeader = useCallback(() => {
    editor.update(() => {
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode)

      const tableColumnIndex =
        $getTableColumnIndexFromTableCellNode(tableCellNode)

      const tableRows = tableNode.getChildren<TableRowNode>()
      const maxRowsLength = Math.max(
        ...tableRows.map((row) => row.getChildren().length)
      )

      if (tableColumnIndex >= maxRowsLength || tableColumnIndex < 0) {
        throw new Error("Expected table cell to be inside of table row.")
      }

      const newStyle =
        tableCellNode.getHeaderStyles() ^ TableCellHeaderStates.COLUMN
      for (let r = 0; r < tableRows.length; r++) {
        const tableRow = tableRows[r]

        if (!$isTableRowNode(tableRow)) {
          throw new Error("Expected table row")
        }

        const tableCells = tableRow.getChildren()
        if (tableColumnIndex >= tableCells.length) {
          // if cell is outside of bounds for the current row (for example various merge cell cases) we shouldn't highlight it
          continue
        }

        const tableCell = tableCells[tableColumnIndex]

        if (!$isTableCellNode(tableCell)) {
          throw new Error("Expected table cell")
        }

        tableCell.setHeaderStyles(newStyle, TableCellHeaderStates.COLUMN)
      }
      clearTableSelection()
      onClose()
    })
  }, [editor, tableCellNode, clearTableSelection, onClose])

  const toggleRowStriping = useCallback(() => {
    editor.update(() => {
      if (tableCellNode.isAttached()) {
        const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode)
        if (tableNode) {
          tableNode.setRowStriping(!tableNode.getRowStriping())
        }
      }
      clearTableSelection()
      onClose()
    })
  }, [editor, tableCellNode, clearTableSelection, onClose])

  const handleCellBackgroundColor = useCallback(
    (value: string) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection) || $isTableSelection(selection)) {
          const [cell] = $getNodeTriplet(selection.anchor)
          if ($isTableCellNode(cell)) {
            cell.setBackgroundColor(value)
          }

          if ($isTableSelection(selection)) {
            const nodes = selection.getNodes()

            for (let i = 0; i < nodes.length; i++) {
              const node = nodes[i]
              if ($isTableCellNode(node)) {
                node.setBackgroundColor(value)
              }
            }
          }
        }
      })
    },
    [editor]
  )

  let mergeCellButton: null | JSX.Element = null
  if (cellMerge) {
    if (canMergeCells) {
      mergeCellButton = (
        <button
          type="button"
          className="item"
          onClick={() => mergeTableCellsAtSelection()}
          data-test-id="table-merge-cells"
        >
          <MergeIcon className="w-4 h-4 mr-2" />
          <span className="text">
            {canMergeCells ? "Merge cells" : "Unmerge cells"}
          </span>
        </button>
      )
    } else if (canUnmergeCell) {
      mergeCellButton = (
        <button
          type="button"
          className="item"
          onClick={() => unmergeTableCellsAtSelection()}
          data-test-id="table-unmerge-cells"
        >
          <SplitIcon className="w-4 h-4 mr-2" />
          <span className="text">Unmerge cells</span>
        </button>
      )
    }
  }

  return (
    <div
      className="dropdown"
      ref={dropDownRef}
      onClick={(e) => {
        e.stopPropagation()
      }}
    >
      {mergeCellButton}
      {/* <button
          type="button"
          className="item"
          onClick={() =>
            showColorPickerModal("Cell background color", () => (
              <ColorPicker
                color={backgroundColor}
                onChange={handleCellBackgroundColor}
              />
            ))
          }
          data-test-id="table-background-color"
        >
          <span className="text">Background color</span>
        </button> */}
      {/* <button
        type="button"
        className="item"
        onClick={() => toggleRowStriping()}
        data-test-id="table-row-striping"
      >
        <span className="text">Toggle Row Striping</span>
      </button>
      <hr /> */}
      <button
        type="button"
        className="item"
        onClick={() => insertTableRowAtSelection(false)}
        data-test-id="table-insert-row-above"
      >
        <ArrowUpToLine className="w-4 h-4 mr-2" />
        <span className="text">
          Insert{" "}
          {selectionCounts.rows === 1 ? "row" : `${selectionCounts.rows} rows`}{" "}
          above
        </span>
      </button>
      <button
        type="button"
        className="item"
        onClick={() => insertTableRowAtSelection(true)}
        data-test-id="table-insert-row-below"
      >
        <ArrowDownToLine className="w-4 h-4 mr-2" />
        <span className="text">
          Insert{" "}
          {selectionCounts.rows === 1 ? "row" : `${selectionCounts.rows} rows`}{" "}
          below
        </span>
      </button>
      <hr />
      <button
        type="button"
        className="item"
        onClick={() => insertTableColumnAtSelection(false)}
        data-test-id="table-insert-column-before"
      >
        <ArrowLeftToLine className="w-4 h-4 mr-2" />
        <span className="text">
          Insert{" "}
          {selectionCounts.columns === 1
            ? "column"
            : `${selectionCounts.columns} columns`}{" "}
          left
        </span>
      </button>
      <button
        type="button"
        className="item"
        onClick={() => insertTableColumnAtSelection(true)}
        data-test-id="table-insert-column-after"
      >
        <ArrowRightToLine className="w-4 h-4 mr-2" />
        <span className="text">
          Insert{" "}
          {selectionCounts.columns === 1
            ? "column"
            : `${selectionCounts.columns} columns`}{" "}
          right
        </span>
      </button>
      <hr />
      <button
        type="button"
        className="item"
        onClick={() => deleteTableColumnAtSelection()}
        data-test-id="table-delete-columns"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        <span className="text">Delete column</span>
      </button>
      <button
        type="button"
        className="item"
        onClick={() => deleteTableRowAtSelection()}
        data-test-id="table-delete-rows"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        <span className="text">Delete row</span>
      </button>
      {/* <button
        type="button"
        className="item"
        onClick={() => deleteTableAtSelection()}
        data-test-id="table-delete"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        <span className="text">Delete table</span>
      </button> */}
      <hr />
      <button
        type="button"
        className="item"
        onClick={() => toggleTableRowIsHeader()}
      >
        <TableProperties className="w-4 h-4 mr-2" />
        <span className="text">
          {(tableCellNode.__headerState & TableCellHeaderStates.ROW) ===
          TableCellHeaderStates.ROW
            ? "Remove"
            : "Add"}{" "}
          row header
        </span>
      </button>
      <button
        type="button"
        className="item"
        onClick={() => toggleTableColumnIsHeader()}
        data-test-id="table-column-header"
      >
        <TableProperties className="w-4 h-4 mr-2" />
        <span className="text">
          {(tableCellNode.__headerState & TableCellHeaderStates.COLUMN) ===
          TableCellHeaderStates.COLUMN
            ? "Remove"
            : "Add"}{" "}
          column header
        </span>
      </button>
    </div>
  )
}
