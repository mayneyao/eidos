const TREE_CONTEXT_MENU_GAP = 4
const TREE_CONTEXT_MENU_VIEWPORT_PADDING = 8

interface TreeContextMenuRect {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

export function resolveTreeContextMenuPosition(
  anchorRect: TreeContextMenuRect,
  menuSize: { width: number; height: number },
  viewportSize: { width: number; height: number }
) {
  const { width, height } = menuSize
  const maxLeft = Math.max(
    TREE_CONTEXT_MENU_VIEWPORT_PADDING,
    viewportSize.width - width - TREE_CONTEXT_MENU_VIEWPORT_PADDING
  )
  const maxTop = Math.max(
    TREE_CONTEXT_MENU_VIEWPORT_PADDING,
    viewportSize.height - height - TREE_CONTEXT_MENU_VIEWPORT_PADDING
  )

  // Align the menu's right edge with the trigger. Tree actions live at the
  // sidebar edge, so opening toward the left keeps the menu inside the Space
  // navigation instead of covering the document area.
  const left = Math.min(
    maxLeft,
    Math.max(TREE_CONTEXT_MENU_VIEWPORT_PADDING, anchorRect.right - width)
  )
  const preferredTop = anchorRect.bottom + TREE_CONTEXT_MENU_GAP
  const flippedTop = anchorRect.top - height - TREE_CONTEXT_MENU_GAP
  const top =
    preferredTop + height <=
    viewportSize.height - TREE_CONTEXT_MENU_VIEWPORT_PADDING
      ? preferredTop
      : Math.max(
          TREE_CONTEXT_MENU_VIEWPORT_PADDING,
          Math.min(maxTop, flippedTop)
        )

  return { left, top }
}
