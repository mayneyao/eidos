import { useCallback, useEffect, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useKeyPress } from "ahooks"
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isRootNode,
  LexicalNode,
} from "lexical"

import { useEditorInstance } from "../../hooks/editor-instance-context"
import {
  findFirstBlockElement,
  getSelectedNode,
} from "../../utils/getSelectedNode"

export function useKeyboardSelection() {
  const {
    setIsSelecting: setGlobalIsSelecting,
    isSelecting: isGlobalSelecting,
  } = useEditorInstance()
  const [editor] = useLexicalComposerContext()
  const [selectedKeySet, setSelectedKeySet] = useState(new Set<string>())
  const [currentNodeKey, setCurrentNodeKey] = useState<string | null>(null)

  const clearSelectedKeySet = () => {
    setSelectedKeySet(new Set())
    setCurrentNodeKey(null)
  }

  const clearNodeHighlight = (nodeKey: string) => {
    const element = editor.getElementByKey(nodeKey)
    if (element) {
      ;(element as HTMLElement).style.backgroundColor = "transparent"
    }
  }

  const highlightNode = (nodeKey: string) => {
    const element = editor.getElementByKey(nodeKey)
    if (element) {
      ;(element as HTMLElement).style.backgroundColor =
        "rgba(173, 216, 230, 0.5)"
    }
  }

  const handleArrowSelection = useCallback(
    (direction: "up" | "down", isShiftKey: boolean) => {
      if (!editor.isEditable()) {
        return false
      }

      editor.update(() => {
        if (!currentNodeKey) {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false
          let node = getSelectedNode(selection)
          const blockNode = findFirstBlockElement(node)
          if (blockNode) {
            node = blockNode
          }
          setCurrentNodeKey(node.getKey())
          return
        }

        let node = $getNodeByKey(currentNodeKey)
        const oldNode = node
        if (!node) return
        const blockNode = findFirstBlockElement(node)
        if (blockNode) {
          node = blockNode
        }

        // If not in selection mode or not holding shift, just move current selection
        if (!isGlobalSelecting || !isShiftKey) {
          // Clear previous selection
          selectedKeySet.forEach(clearNodeHighlight)
          selectedKeySet.clear()

          let nextNode = null
          if (direction === "up") {
            // Try to find previous sibling first
            nextNode = node.getPreviousSibling()
            // If no previous sibling, try to get parent
            if (!nextNode) {
              nextNode = node.getParent()
            }
          } else {
            // Try to find next sibling first
            nextNode = node.getNextSibling()
            // If no next sibling, try to get parent's next sibling
            if (!nextNode) {
              const parent = node.getParent()
              if (parent) {
                nextNode = parent.getNextSibling()
              }
            }
          }

          let nodeToSelect: LexicalNode = nextNode || node

          if ($isRootNode(nodeToSelect)) {
            nodeToSelect = oldNode!
          }
          const nodeKey = nodeToSelect?.getKey()
          setCurrentNodeKey(nodeKey)
          selectedKeySet.add(nodeKey)
          highlightNode(nodeKey)
          setSelectedKeySet(new Set(selectedKeySet))
        } else {
          // In selection mode and holding shift, expand selection
          let nextNode = null
          if (direction === "up") {
            // Try to find previous sibling first
            nextNode = node.getPreviousSibling()
            // If no previous sibling, try to get parent
            if (!nextNode) {
              nextNode = node.getParent()
            }
          } else {
            // Try to find next sibling first
            nextNode = node.getNextSibling()
            // If no next sibling, try to get parent's next sibling
            if (!nextNode) {
              const parent = node.getParent()
              if (parent) {
                nextNode = parent.getNextSibling()
              }
            }
          }

          if (nextNode && !$isRootNode(nextNode)) {
            const nextNodeKey = nextNode.getKey()
            setCurrentNodeKey(nextNodeKey)
            selectedKeySet.add(nextNodeKey)
            highlightNode(nextNodeKey)
            setSelectedKeySet(new Set(selectedKeySet))
          }
        }
      })

      return true
    },
    [editor, selectedKeySet, currentNodeKey, isGlobalSelecting]
  )

  // Use ahooks useKeyPress for keyboard events
  useKeyPress(["uparrow"], (event) => {
    if (isGlobalSelecting) {
      handleArrowSelection("up", event.shiftKey)
    }
  })

  useKeyPress(["downarrow"], (event) => {
    if (isGlobalSelecting) {
      handleArrowSelection("down", event.shiftKey)
    }
  })

  const handleEscape = useCallback(() => {
    if (!editor.isEditable()) {
      return false
    }

    if (currentNodeKey) {
      for (const key of selectedKeySet) {
        clearNodeHighlight(key)
      }
      selectedKeySet.clear()
      setCurrentNodeKey(null)
      return
    }
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        editor.blur()
        let node = getSelectedNode(selection)
        const blockNode = findFirstBlockElement(node)
        if (blockNode) {
          node = blockNode
        }

        const nodeKey = node.getKey()
        setCurrentNodeKey(nodeKey)

        // If node is already selected, deselect it
        if (selectedKeySet.has(nodeKey)) {
          selectedKeySet.delete(nodeKey)
          setCurrentNodeKey(null)
          clearNodeHighlight(nodeKey)

          // If no more selections, exit selection mode
          if (selectedKeySet.size === 0) {
            setGlobalIsSelecting(false)
          }
        } else {
          // Select new node
          highlightNode(nodeKey)
          selectedKeySet.add(nodeKey)
          setSelectedKeySet(new Set(selectedKeySet))
          setGlobalIsSelecting(true)
        }
      }
    })

    return true
  }, [editor, selectedKeySet, currentNodeKey])

  useKeyPress(["esc"], () => {
    handleEscape()
  })

  // Handle backspace to delete selected nodes
  useKeyPress(["backspace"], (e) => {
    if (isGlobalSelecting && selectedKeySet.size > 0) {
      e.preventDefault()
      editor.update(() => {
        selectedKeySet.forEach((nodeKey) => {
          const node = $getNodeByKey(nodeKey)
          if (node) {
            node.remove()
          }
        })
        clearSelectedKeySet()
        setGlobalIsSelecting(false)
      })
    }
  })

  // Handle enter key to focus on selected node
  useKeyPress(["enter"], (e) => {
    if (isGlobalSelecting && currentNodeKey) {
      e.preventDefault()
      editor.update(() => {
        console.log(currentNodeKey)
        const node = $getNodeByKey(currentNodeKey)
        if (node) {
          selectedKeySet.forEach(clearNodeHighlight)
          clearSelectedKeySet()
          setGlobalIsSelecting(false)

          // 先获得焦点
          editor.focus()
          // (node as any).select()
          node.selectEnd()
        }
      })
    }
  })

  // Handle editor focus
  useEffect(() => {
    const handleFocus = () => {
      if (isGlobalSelecting) {
        selectedKeySet.forEach(clearNodeHighlight)
        setSelectedKeySet(new Set())
        setCurrentNodeKey(null)
        setGlobalIsSelecting(false)
      }
    }

    const rootElement = editor.getRootElement()
    if (rootElement) {
      rootElement.addEventListener("focus", handleFocus)
      return () => {
        rootElement.removeEventListener("focus", handleFocus)
      }
    }
  }, [editor, isGlobalSelecting, selectedKeySet])

  // Handle Command/Ctrl + A to select all nodes
  useKeyPress(["meta.a", "ctrl.a"], (e) => {
    if (isGlobalSelecting) {
      e.preventDefault()
      editor.update(() => {
        // Clear existing selections
        selectedKeySet.forEach(clearNodeHighlight)
        selectedKeySet.clear()

        // Get all top-level nodes
        const nodes = editor.getEditorState().read(() => {
          const rootNode = $getRoot()
          return rootNode.getChildren()
        })

        // Select all nodes
        nodes.forEach((node) => {
          const nodeKey = node.getKey()
          selectedKeySet.add(nodeKey)
          highlightNode(nodeKey)
        })

        setSelectedKeySet(new Set(selectedKeySet))
      })
    }
  })

  return {
    selectedKeySet,
  }
}
