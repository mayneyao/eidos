import { useEffect, useRef } from "react"
import { useEidosFileUI } from "./context"

const handlers: Array<() => void | Promise<void>> = []

/** Native back first dismisses the active web surface, then its record page. */
export function handleMobileBack(): boolean {
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]")
  if (dialog) {
    if (dialog.dispatchEvent(new Event("cancel", { cancelable: true })))
      dialog.close()
    return true
  }
  const overlays = [
    ...document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]'
    ),
  ].filter(
    (node) =>
      node.dataset.state !== "closed" && node.getClientRects().length > 0
  )
  if (overlays.length) {
    // Dispatch at the dismiss-layer listener, not at the input: its Escape
    // shortcut may reset a draft before the sheet can flush it on native back.
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    return true
  }
  const handler = handlers.at(-1)
  if (!handler) return false
  void handler()
  return true
}

export function useMobileBack(
  handler: (() => void | Promise<void>) | undefined
) {
  const { interactionMode } = useEidosFileUI()
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (interactionMode !== "mobile" || !handler) return
    const back = () => latest.current?.()
    handlers.push(back)
    return () => {
      const index = handlers.indexOf(back)
      if (index >= 0) handlers.splice(index, 1)
    }
  }, [interactionMode, Boolean(handler)])
}
