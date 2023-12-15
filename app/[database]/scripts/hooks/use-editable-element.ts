import { useEffect, useRef } from "react"

export const useEditableElement = (props?: {
  onSave?: (value: string) => void
}) => {
  const currentElementRef = useRef<any | null>(null)

  useEffect(() => {
    // when element is clicked, set currentElement to the element
    const onDoubleClick = () => {
      const currentElement = currentElementRef.current
      if (!currentElement) return
      // make element editable and focus
      currentElement.contentEditable = "true"
      currentElement.focus()
      // add onChange event listener
      const onChange = (e: any) => {
        // handle Enter key
        if (e.keyCode === 13) {
          e.preventDefault()
          //  emit blur event
          currentElement.blur()
          return
        }
      }
      currentElement.addEventListener("keydown", onChange)
      // when element is blurred, set currentElement to null
      currentElement.addEventListener("blur", () => {
        currentElement.removeEventListener("keydown", onChange)
        // make element uneditable
        currentElement.contentEditable = "false"
        props?.onSave?.(currentElement.textContent || "")
      })
    }
    const dblClickHandler = (e: MouseEvent) => onDoubleClick()
    currentElementRef.current?.addEventListener("dblclick", dblClickHandler)
    return () => {
      currentElementRef.current?.removeEventListener(
        "dblclick",
        dblClickHandler
      )
    }
  }, [props])

  return {
    ref: currentElementRef,
  }
}
