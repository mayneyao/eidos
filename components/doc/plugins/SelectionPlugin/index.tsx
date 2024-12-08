import { useKeyboardSelection } from "./use-keyboard-selection"
import { useMouseSelection } from "./use-mouse-selection"

export const SelectionPlugin = () => {
  const getSelectionItems = () =>
    document.querySelectorAll(
      ".editor-input > *:not(ul):not(ol), .editor-input > ul > li, .editor-input > ol > li"
    )
  const { boxStyle } = useMouseSelection(getSelectionItems)
  useKeyboardSelection()
  return <div id="selection-box" style={boxStyle}></div>
}
