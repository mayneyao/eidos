import { ReactPortal, useCallback, useEffect, useRef, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useLexicalEditable } from "@lexical/react/useLexicalEditable"
import { $isTableCellNode, TableCellNode } from "@lexical/table"
import {
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
} from "lexical"
import { createPortal } from "react-dom"

import { useModal } from "../../hooks/useModal"
import { TableActionMenu } from "./TableActionMenu"
import "./index.css"

function TableCellActionMenuContainer({
  anchorElem,
  cellMerge,
}: {
  anchorElem: HTMLElement
  cellMerge: boolean
}): JSX.Element {
  const [editor] = useLexicalComposerContext()
  const menuButtonRef = useRef<HTMLDivElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [tableCellNode, setTableMenuCellNode] = useState<TableCellNode | null>(
    null
  )
  const [colorPickerModal, showColorPickerModal] = useModal()

  const updateMenuPosition = useCallback((element: HTMLElement, mouseEvent?: MouseEvent) => {
    if (menuButtonRef.current) {
      let left = 0;
      let top = 0;
      
      if (mouseEvent) {
        left = mouseEvent.clientX;
        top = mouseEvent.clientY;
      } else {
        const rect = element.getBoundingClientRect();
        left = rect.left;
        top = rect.top;
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left + 200 > viewportWidth) {
        left = viewportWidth - 200;
      }
      if (top + 300 > viewportHeight) {
        top = viewportHeight - 300;
      }

      menuButtonRef.current.style.top = `${top}px`;
      menuButtonRef.current.style.left = `${left}px`;
    }
  }, []);

  useEffect(() => {
    const unregisterListener = editor.registerUpdateListener(
      ({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const node = selection.anchor.getNode()
            if ($isTableCellNode(node)) {
              const element = editor.getElementByKey(node.getKey())
              if (element) {
                updateMenuPosition(element)
              }
            }
          }
        })
      }
    )

    return () => {
      unregisterListener()
    }
  }, [editor, updateMenuPosition])

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const target = e.target as HTMLElement
      const cellElement = target.closest("td, th")

      if (cellElement) {
        editor.update(() => {
          const tableCellNode = $getNearestNodeFromDOMNode(cellElement)
          if (!tableCellNode) {
            return
          }
          if ($isTableCellNode(tableCellNode)) {
            setTableMenuCellNode(tableCellNode)
            setIsMenuOpen(true)
            updateMenuPosition(cellElement as HTMLElement, e)
          }
        })
      } else {
        setIsMenuOpen(false)
      }
    },
    [editor, updateMenuPosition]
  )

  useEffect(() => {
    const rootElement = editor.getRootElement()
    if (rootElement) {
      rootElement.addEventListener("contextmenu", handleContextMenu)
      return () => {
        rootElement.removeEventListener("contextmenu", handleContextMenu)
      }
    }
  }, [editor, handleContextMenu])

  return (
    <div ref={menuButtonRef} className="table-cell-action-button-container">
      {tableCellNode != null && (
        <>
          {colorPickerModal}
          {isMenuOpen && (
            <TableActionMenu
              contextRef={menuButtonRef}
              setIsMenuOpen={setIsMenuOpen}
              onClose={() => setIsMenuOpen(false)}
              tableCellNode={tableCellNode}
              cellMerge={cellMerge}
              showColorPickerModal={showColorPickerModal}
            />
          )}
        </>
      )}
    </div>
  )
}

export default function TableActionMenuPlugin({
  anchorElem = document.body,
  cellMerge = false,
}: {
  anchorElem?: HTMLElement
  cellMerge?: boolean
}): null | ReactPortal {
  const isEditable = useLexicalEditable()
  return createPortal(
    isEditable ? (
      <TableCellActionMenuContainer
        anchorElem={anchorElem}
        cellMerge={cellMerge}
      />
    ) : null,
    anchorElem
  )
}
