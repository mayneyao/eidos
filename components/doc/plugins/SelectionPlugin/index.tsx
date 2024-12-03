import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

import { useMouseSelection } from "../../hooks/useSelection"
import { useKeyboardSelection } from "../../hooks/use-keyboard-selection"

export const SelectionPlugin = () => {
  const [editor] = useLexicalComposerContext()
  const getSelectionItems = () => document.querySelectorAll(".editor-input > *:not(ul):not(ol), .editor-input > ul > li, .editor-input > ol > li")
  const { boxStyle } = useMouseSelection(getSelectionItems)
  useKeyboardSelection()
  return <div id="selection-box" style={boxStyle}></div>
}
