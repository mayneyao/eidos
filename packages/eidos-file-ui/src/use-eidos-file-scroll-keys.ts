import { useEffect, type RefObject } from "react"

const EIDOS_FILE_SCROLL_KEY_SKIP_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox'], [role='menu'], [role='listbox'], [role='dialog'], [data-eidos-file-detail-panel='record']"

/**
 * Scroll a view body with PageUp, PageDown, Home, and End while the view is
 * active. The keys are handled at the window level so they work before the
 * region has received focus, and they never steal keys from fields, menus,
 * dialogs, or an open record panel.
 */
export function useEidosFileScrollKeys(
  ref: RefObject<HTMLElement | null>,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const node = ref.current
      if (!node) return
      const active = node.ownerDocument.activeElement
      if (
        active instanceof HTMLElement &&
        active !== node &&
        active.closest(EIDOS_FILE_SCROLL_KEY_SKIP_SELECTOR)
      ) {
        return
      }
      const page = Math.max(80, node.clientHeight * 0.9)
      switch (event.key) {
        case "PageDown":
          node.scrollBy({ top: page })
          break
        case "PageUp":
          node.scrollBy({ top: -page })
          break
        case "Home":
          node.scrollTo({ top: 0 })
          break
        case "End":
          node.scrollTo({ top: node.scrollHeight })
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [enabled, ref])
}
