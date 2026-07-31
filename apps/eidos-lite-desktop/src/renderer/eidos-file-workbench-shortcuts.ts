type FindShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "shiftKey"
>

export function shouldFocusEidosFileSearch(
  event: FindShortcutEvent,
  editor: HTMLElement | null,
  activeElement: Element | null
): boolean {
  return (
    !event.defaultPrevented &&
    !event.altKey &&
    !event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "f" &&
    editor !== null &&
    activeElement !== null &&
    editor.contains(activeElement)
  )
}
