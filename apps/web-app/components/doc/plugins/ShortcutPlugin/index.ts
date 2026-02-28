import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useKeyPress } from "ahooks"
import { useCallback } from "react"
import {
  $duplicateParagraph,
  $moveListItem,
  $toggleCheckList,
} from "../../utils/selection"

export function ShortcutPlugin() {
  const [editor] = useLexicalComposerContext()

  // Toggle check list
  const toggleCheckList = useCallback(() => {
    editor.update(() => {
      if (!editor.isEditable()) return
      $toggleCheckList()
    })
  }, [editor])

  // Duplicate paragraph
  const duplicateParagraph = useCallback(
    (isUp: boolean) => {
      editor.update(() => {
        if (!editor.isEditable()) return
        $duplicateParagraph(isUp)
      })
    },
    [editor]
  )

  // Move list item
  const moveListItem = useCallback(
    (isUp: boolean) => {
      editor.update(() => {
        if (!editor.isEditable()) return
        $moveListItem(isUp)
      })
    },
    [editor]
  )

  // Toggle check list
  useKeyPress(
    ["ctrl.Enter", "meta.Enter"],
    (e) => {
      if (!editor.isEditable()) return
      e.stopPropagation()
      toggleCheckList()
    },
    { useCapture: true }
  )

  // Duplicate paragraph up
  useKeyPress(
    ["shift.alt.uparrow"],
    (e) => {
      if (!editor.isEditable()) return
      e.preventDefault()
      e.stopPropagation()
      duplicateParagraph(true)
    },
    { useCapture: true }
  )

  // Duplicate paragraph down
  useKeyPress(
    ["shift.alt.downarrow"],
    (e) => {
      if (!editor.isEditable()) return
      e.preventDefault()
      e.stopPropagation()
      duplicateParagraph(false)
    },
    { useCapture: true }
  )

  // Move list item up
  useKeyPress(
    ["alt.uparrow"],
    (e) => {
      if (!editor.isEditable()) return
      e.preventDefault()
      e.stopPropagation()
      moveListItem(true)
    },
    { useCapture: true }
  )

  // Move list item down
  useKeyPress(
    ["alt.downarrow"],
    (e) => {
      if (!editor.isEditable()) return
      e.preventDefault()
      e.stopPropagation()
      moveListItem(false)
    },
    { useCapture: true }
  )

  return null
}
