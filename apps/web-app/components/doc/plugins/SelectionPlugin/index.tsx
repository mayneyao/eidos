import { createPortal } from "react-dom"

import { useEditorInstance } from "../../hooks/editor-instance-context"
import { useKeyboardSelection } from "./use-keyboard-selection"
import { useMouseSelection } from "./use-mouse-selection"

export const SelectionPlugin = () => {
  const { queryWithinContainer, container } = useEditorInstance()
  const getSelectionItems = () => {
    const selector =
      ":scope > *:not(ul):not(ol), :scope > ul > li, :scope > ol > li"
    const editorRoot = queryWithinContainer(".editor-input")
    if (editorRoot) {
      return editorRoot.querySelectorAll(selector)
    }
    return document.querySelectorAll(
      ".editor-input > *:not(ul):not(ol), .editor-input > ul > li, .editor-input > ol > li"
    )
  }
  const { boxStyle } = useMouseSelection(getSelectionItems)
  useKeyboardSelection()

  const portalTarget =
    (queryWithinContainer(".doc-editor-area") as HTMLElement | null) ??
    container ??
    document.body

  return createPortal(
    <div id="selection-box" style={boxStyle} />,
    portalTarget
  )
}
