import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

import { useMouseSelection } from "../../hooks/useSelection"

export const SelectionPlugin = () => {
  const [editor] = useLexicalComposerContext()
  const getSelectionItems = () => document.querySelectorAll(".editor-input > *")
  const { boxStyle } = useMouseSelection(getSelectionItems)

  return <div id="selection-box" style={boxStyle}></div>
}
