import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $isHeadingNode, type HeadingNode } from "@lexical/rich-text"
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"

export interface CollapsibleHeadingsContextValue {
  foldedKeys: ReadonlySet<NodeKey>
  foldAll(): void
  isFoldable(key: NodeKey): boolean
  isFolded(key: NodeKey): boolean
  toggleFold(key: NodeKey): boolean
  unfoldAll(): void
}

export const CollapsibleHeadingsContext =
  createContext<CollapsibleHeadingsContextValue>({
    foldedKeys: new Set(),
    foldAll: () => {},
    isFoldable: () => false,
    isFolded: () => false,
    toggleFold: () => false,
    unfoldAll: () => {},
  })

export function useCollapsibleHeadings(): CollapsibleHeadingsContextValue {
  return useContext(CollapsibleHeadingsContext)
}

export function $computeHiddenBlockKeys(
  rootChildren: readonly LexicalNode[],
  foldedKeys: ReadonlySet<NodeKey>
): {
  hiddenKeys: Set<NodeKey>
  foldableHeadingKeys: Set<NodeKey>
} {
  const hiddenKeys = new Set<NodeKey>()
  const foldableHeadingKeys = new Set<NodeKey>()

  interface StackEntry {
    hiddenByAncestor: boolean
    isFolded: boolean
    key: NodeKey
    level: number
  }
  const stack: StackEntry[] = []

  for (let i = 0; i < rootChildren.length; i++) {
    const node = rootChildren[i]
    const key = node.getKey()

    if ($isHeadingNode(node)) {
      const level = parseInt(node.getTag().slice(1), 10)

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }

      const hiddenByAncestor = stack.some(
        (entry) => entry.isFolded || entry.hiddenByAncestor
      )
      if (hiddenByAncestor) {
        hiddenKeys.add(key)
      }

      const isFolded = foldedKeys.has(key)
      stack.push({
        hiddenByAncestor,
        isFolded,
        key,
        level,
      })

      const next = i + 1 < rootChildren.length ? rootChildren[i + 1] : null
      if (next) {
        if (!$isHeadingNode(next)) {
          foldableHeadingKeys.add(key)
        } else {
          const nextLevel = parseInt(next.getTag().slice(1), 10)
          if (nextLevel > level) {
            foldableHeadingKeys.add(key)
          }
        }
      }
    } else {
      const isHidden = stack.some(
        (entry) => entry.isFolded || entry.hiddenByAncestor
      )
      if (isHidden) {
        hiddenKeys.add(key)
      }
    }
  }

  return { foldableHeadingKeys, hiddenKeys }
}

function topLevelBlockNode(node: LexicalNode): LexicalNode | null {
  let current: LexicalNode | null = node
  const root = $getRoot()
  while (current && current.getParent() !== root) {
    current = current.getParent()
  }
  return current
}

export function $findTargetHeadingForCaret(): HeadingNode | null {
  const selection = $getSelection()
  if (!selection) return null

  let topBlock: LexicalNode | null = null
  if ($isRangeSelection(selection)) {
    topBlock = topLevelBlockNode(selection.anchor.getNode())
  } else if ($isNodeSelection(selection)) {
    const nodes = selection.getNodes()
    if (nodes.length > 0) {
      topBlock = topLevelBlockNode(nodes[0])
    }
  }

  if (!topBlock) return null
  if ($isHeadingNode(topBlock)) return topBlock

  let prev = topBlock.getPreviousSibling()
  while (prev) {
    if ($isHeadingNode(prev)) return prev
    prev = prev.getPreviousSibling()
  }

  return null
}

function $guardSelectionBeforeFold(
  editor: LexicalEditor,
  headingNode: HeadingNode,
  futureFoldedKeys: ReadonlySet<NodeKey>
) {
  const rootChildren = $getRoot().getChildren()
  const { hiddenKeys } = $computeHiddenBlockKeys(rootChildren, futureFoldedKeys)
  const selection = $getSelection()
  if (!selection) return

  let selectionInHidden = false
  if ($isRangeSelection(selection)) {
    const anchorTop = topLevelBlockNode(selection.anchor.getNode())
    const focusTop = topLevelBlockNode(selection.focus.getNode())
    if (
      (anchorTop && hiddenKeys.has(anchorTop.getKey())) ||
      (focusTop && hiddenKeys.has(focusTop.getKey()))
    ) {
      selectionInHidden = true
    }
  } else if ($isNodeSelection(selection)) {
    selectionInHidden = selection.getNodes().some((node) => {
      const top = topLevelBlockNode(node)
      return top ? hiddenKeys.has(top.getKey()) : false
    })
  }

  if (selectionInHidden) {
    headingNode.selectEnd()
  }
}

export function CollapsibleHeadingsPlugin({
  children,
  enabled = true,
}: {
  children?: ReactNode
  enabled?: boolean
}) {
  const [editor] = useLexicalComposerContext()
  const { matches } = useMarkdownShortcuts()
  const [foldedKeys, setFoldedKeys] = useState<Set<NodeKey>>(() => new Set())
  const [foldableKeys, setFoldableKeys] = useState<Set<NodeKey>>(
    () => new Set()
  )
  const foldedKeysRef = useRef(foldedKeys)
  foldedKeysRef.current = foldedKeys

  const isFolded = useCallback(
    (key: NodeKey) => foldedKeys.has(key),
    [foldedKeys]
  )
  const isFoldable = useCallback(
    (key: NodeKey) => foldableKeys.has(key),
    [foldableKeys]
  )

  const toggleFold = useCallback(
    (key: NodeKey): boolean => {
      let toggled = false
      editor.update(() => {
        const node = $getNodeByKey(key)
        if (!node || !$isHeadingNode(node)) return

        const next = new Set(foldedKeysRef.current)
        const willFold = !next.has(key)
        if (willFold) {
          next.add(key)
          $guardSelectionBeforeFold(editor, node, next)
        } else {
          next.delete(key)
        }
        setFoldedKeys(next)
        toggled = true
      })
      return toggled
    },
    [editor]
  )

  const foldAll = useCallback(() => {
    editor.update(() => {
      const rootChildren = $getRoot().getChildren()
      const headings: HeadingNode[] = []
      for (const child of rootChildren) {
        if ($isHeadingNode(child)) headings.push(child)
      }
      if (headings.length === 0) return

      const next = new Set<NodeKey>()
      const { foldableHeadingKeys } = $computeHiddenBlockKeys(
        rootChildren,
        new Set(headings.map((h) => h.getKey()))
      )
      for (const key of foldableHeadingKeys) {
        next.add(key)
      }

      const firstHeading = headings[0]
      if (firstHeading) {
        $guardSelectionBeforeFold(editor, firstHeading, next)
      }
      setFoldedKeys(next)
    })
  }, [editor])

  const unfoldAll = useCallback(() => {
    setFoldedKeys(new Set())
  }, [])

  // Sync DOM classes and attributes with folding state
  useEffect(() => {
    if (!enabled) return

    const trackedElements = new Set<HTMLElement>()

    const updateDOM = () => {
      editor.getEditorState().read(() => {
        const root = editor.getRootElement()
        if (!root) return

        const rootChildren = $getRoot().getChildren()
        const currentKeys = new Set(rootChildren.map((c) => c.getKey()))

        // Prune dangling keys
        const nextFolded = new Set<NodeKey>()
        for (const k of foldedKeysRef.current) {
          if (currentKeys.has(k)) nextFolded.add(k)
        }
        if (nextFolded.size !== foldedKeysRef.current.size) {
          setFoldedKeys(nextFolded)
        }

        const { foldableHeadingKeys, hiddenKeys } = $computeHiddenBlockKeys(
          rootChildren,
          nextFolded
        )
        setFoldableKeys(foldableHeadingKeys)

        const activeElements = new Set<HTMLElement>()

        for (const child of rootChildren) {
          const key = child.getKey()
          const element = editor.getElementByKey(key)
          if (!element) continue

          activeElements.add(element)
          trackedElements.add(element)

          const isHidden = hiddenKeys.has(key)
          element.classList.toggle("eme-block-folded", isHidden)
          if (isHidden) {
            element.setAttribute("aria-hidden", "true")
          } else {
            element.removeAttribute("aria-hidden")
          }

          if ($isHeadingNode(child)) {
            const isHeadingFolded = nextFolded.has(key)
            const isHeadingFoldable = foldableHeadingKeys.has(key)

            element.classList.toggle("eme-heading-folded", isHeadingFolded)
            element.classList.toggle("eme-heading-foldable", isHeadingFoldable)

            if (isHeadingFoldable) {
              element.setAttribute(
                "aria-expanded",
                isHeadingFolded ? "false" : "true"
              )
            } else {
              element.removeAttribute("aria-expanded")
            }
          }
        }

        // Clean up elements that are no longer part of root children
        for (const el of trackedElements) {
          if (!activeElements.has(el)) {
            el.classList.remove(
              "eme-block-folded",
              "eme-heading-folded",
              "eme-heading-foldable"
            )
            el.removeAttribute("aria-hidden")
            el.removeAttribute("aria-expanded")
            trackedElements.delete(el)
          }
        }
      })
    }

    const unregisterUpdate = editor.registerUpdateListener(updateDOM)
    const unregisterRoot = editor.registerRootListener(updateDOM)
    updateDOM()

    return () => {
      unregisterUpdate()
      unregisterRoot()
      for (const el of trackedElements) {
        el.classList.remove(
          "eme-block-folded",
          "eme-heading-folded",
          "eme-heading-foldable"
        )
        el.removeAttribute("aria-hidden")
        el.removeAttribute("aria-expanded")
      }
      trackedElements.clear()
    }
  }, [editor, enabled, foldedKeys])

  // Keyboard shortcut command listener
  useEffect(() => {
    if (!enabled) return

    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.defaultPrevented) return false

        if (matches(event, "heading.toggle-fold")) {
          let handled = false
          editor.update(() => {
            const target = $findTargetHeadingForCaret()
            if (!target) return

            const key = target.getKey()
            const next = new Set(foldedKeysRef.current)
            const willFold = !next.has(key)
            if (willFold) {
              next.add(key)
              $guardSelectionBeforeFold(editor, target, next)
            } else {
              next.delete(key)
            }
            setFoldedKeys(next)
            handled = true
          })

          if (handled) {
            event.preventDefault()
            return true
          }
          return false
        }

        if (matches(event, "heading.fold-all")) {
          event.preventDefault()
          foldAll()
          return true
        }

        if (matches(event, "heading.unfold-all")) {
          event.preventDefault()
          unfoldAll()
          return true
        }

        return false
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [editor, enabled, foldAll, matches, unfoldAll])

  // Click handler on folded heading indicator pill
  useEffect(() => {
    if (!enabled) return

    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const target = event.target
        if (!(target instanceof HTMLElement || target instanceof Node)) {
          return false
        }

        const element =
          target instanceof HTMLElement
            ? target
            : (target.parentElement ?? null)
        if (!element) return false

        const headingEl = element.closest<HTMLElement>(".eme-heading-folded")
        if (!headingEl) return false

        // Detect if click is near the trailing end of text where the ::after badge is rendered
        const range = document.createRange()
        range.selectNodeContents(headingEl)
        const textRect = range.getBoundingClientRect()

        if (event.clientX >= textRect.right - 8) {
          let handled = false
          editor.update(() => {
            const node = $getNearestNodeFromDOMNode(headingEl)
            if (node && $isHeadingNode(node)) {
              const key = node.getKey()
              const next = new Set(foldedKeysRef.current)
              next.delete(key)
              setFoldedKeys(next)
              handled = true
            }
          })
          if (handled) {
            event.preventDefault()
            return true
          }
        }
        return false
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, enabled])

  const contextValue = useMemo(
    () => ({
      foldedKeys,
      foldAll,
      isFoldable,
      isFolded,
      toggleFold,
      unfoldAll,
    }),
    [foldedKeys, foldAll, isFoldable, isFolded, toggleFold, unfoldAll]
  )

  return (
    <CollapsibleHeadingsContext.Provider value={contextValue}>
      {children}
    </CollapsibleHeadingsContext.Provider>
  )
}

/**
 * Returns all child blocks belonging to the section of the given heading.
 * Stops when encountering a heading of equal or higher rank (<= level)
 * or a document boundary.
 */
export function $getHeadingSectionChildren(
  headingNode: HeadingNode,
  isBoundary?: (node: LexicalNode) => boolean
): LexicalNode[] {
  const children: LexicalNode[] = []
  const level = parseInt(headingNode.getTag().slice(1), 10)
  let next = headingNode.getNextSibling()

  while (next) {
    if (isBoundary?.(next)) {
      break
    }
    if ($isHeadingNode(next)) {
      const nextLevel = parseInt(next.getTag().slice(1), 10)
      if (nextLevel <= level) {
        break
      }
    }
    children.push(next)
    next = next.getNextSibling()
  }

  return children
}

/**
 * If node is a folded heading, returns the last block node of its section.
 * Otherwise, returns the node itself.
 */
export function $getSectionEndNode(
  node: LexicalNode,
  isFolded: (key: NodeKey) => boolean,
  isBoundary?: (node: LexicalNode) => boolean
): LexicalNode {
  if ($isHeadingNode(node) && isFolded(node.getKey())) {
    const children = $getHeadingSectionChildren(node, isBoundary)
    if (children.length > 0) {
      return children[children.length - 1]
    }
  }
  return node
}

/**
 * Checks if the given node is contained within a preceding folded heading section.
 * If so, returns that folded HeadingNode. Otherwise returns null.
 */
export function $getFoldedHeadingEnclosing(
  node: LexicalNode,
  isFolded: (key: NodeKey) => boolean,
  isBoundary?: (node: LexicalNode) => boolean
): HeadingNode | null {
  let current: LexicalNode | null = node
  while (current) {
    const prev: LexicalNode | null = current.getPreviousSibling()
    if (!prev || isBoundary?.(prev)) break
    if ($isHeadingNode(prev)) {
      if (isFolded(prev.getKey())) {
        const children = $getHeadingSectionChildren(prev, isBoundary)
        if (children.some((c) => c.getKey() === node.getKey())) {
          return prev
        }
      }
    }
    current = prev
  }
  return null
}
