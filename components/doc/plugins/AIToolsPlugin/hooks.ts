import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react"
import { createDOMRange, createRectsFromDOMRange } from "@lexical/selection"
import {
  $getSelection,
  $isRangeSelection,
  LexicalEditor,
  RangeSelection,
} from "lexical"

export const useUpdateLocation = (
  editor: LexicalEditor,
  selectionRef: React.MutableRefObject<RangeSelection | null>,
  boxRef: React.MutableRefObject<HTMLDivElement | null>
) => {
  const [editorWidth, setEditorWidth] = useState(0)
  const selectionState = useMemo(
    () => ({
      container: document.createElement("div"),
      elements: [],
    }),
    []
  )
  const updateLocation = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()

      if ($isRangeSelection(selection)) {
        selectionRef.current = selection.clone()
        const anchor = selection.anchor
        const focus = selection.focus
        const range = createDOMRange(
          editor,
          anchor.getNode(),
          anchor.offset,
          focus.getNode(),
          focus.offset
        )
        const boxElem = boxRef.current
        if (range !== null && boxElem !== null) {
          const { left, bottom, width } = range.getBoundingClientRect()
          const selectionRects = createRectsFromDOMRange(editor, range)
          let correctedLeft =
            selectionRects.length === 1 ? left + width / 2 - 125 : left - 125
          if (correctedLeft < 10) {
            correctedLeft = 10
          }
          boxElem.style.left = `${left}px`
          boxElem.style.top = `${
            bottom +
            8 +
            (window.pageYOffset || document.documentElement.scrollTop)
          }px`
          const selectionRectsLength = selectionRects.length
          const { container } = selectionState
          const elements: Array<HTMLSpanElement> = selectionState.elements
          const elementsLength = elements.length

          for (let i = 0; i < selectionRectsLength; i++) {
            const selectionRect = selectionRects[i]
            let elem: HTMLSpanElement = elements[i]
            if (elem === undefined) {
              elem = document.createElement("span")
              elements[i] = elem
              container.appendChild(elem)
            }
            const color = "255, 212, 0"
            const style = `position:absolute;top:${
              selectionRect.top +
              (window.pageYOffset || document.documentElement.scrollTop)
            }px;left:${selectionRect.left}px;height:${
              selectionRect.height
            }px;width:${
              selectionRect.width
            }px;background-color:rgba(${color}, 0.3);pointer-events:none;z-index:5;`
            elem.style.cssText = style
          }
          for (let i = elementsLength - 1; i >= selectionRectsLength; i--) {
            const elem = elements[i]
            container.removeChild(elem)
            elements.pop()
          }
        }
      }
    })
  }, [boxRef, editor, selectionRef, selectionState])

  useLayoutEffect(() => {
    updateLocation()
    const container = selectionState.container
    const editorContainer = document.querySelector("#editor-container-inner")
    if (editorWidth !== editorContainer?.clientWidth) {
      setEditorWidth(editorContainer?.clientWidth || 0)
    }
    const body = document.body
    if (body !== null) {
      body.appendChild(container)
      return () => {
        body.removeChild(container)
      }
    }
  }, [editorWidth, selectionState.container, updateLocation])

  useEffect(() => {
    window.addEventListener("resize", updateLocation)

    return () => {
      window.removeEventListener("resize", updateLocation)
    }
  }, [updateLocation])

  return {
    editorWidth,
  }
}
