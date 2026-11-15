interface SaveTarget {
  root: HTMLElement
  save(): void
  platform: string
}

const targets = new Set<SaveTarget>()
let active: SaveTarget | undefined

function targetAt(node: EventTarget | null): SaveTarget | undefined {
  if (!(node instanceof Node)) return undefined
  return (
    [...targets].find(({ root }) => root.contains(node)) ??
    [...targets].find(({ root }) =>
      root.closest(".file-sidebar")?.contains(node)
    )
  )
}

function activate(event: Event) {
  const target = targetAt(event.target)
  if (target) active = target
}

export function acceptsTextFileSave(
  event: KeyboardEvent,
  root: HTMLElement,
  platform: string
): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== "s"
  )
    return false
  // Preserve Lite's existing Ctrl+S alias on macOS; the visible hint uses Cmd+S.
  if (
    platform === "darwin"
      ? !event.metaKey && !event.ctrlKey
      : !event.ctrlKey || event.metaKey
  )
    return false
  if (
    document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
  )
    return false
  const element = event.target instanceof Element ? event.target : null
  // Search and unrelated editors own their keys. Source textareas inside this
  // document retain the same save behavior as the rendered editor.
  if (
    element?.closest(
      'input, [role="search"], [role="searchbox"], [role="dialog"], dialog, [data-document-find]'
    )
  )
    return false
  if (
    element?.closest('textarea, [contenteditable="true"]') &&
    !root.contains(element)
  )
    return false
  return true
}

function keydown(event: KeyboardEvent) {
  const target =
    targetAt(event.target) ??
    (active && targets.has(active) ? active : undefined) ??
    [...targets].find(({ root }) => !root.closest(".file-sidebar"))
  if (!target || !acceptsTextFileSave(event, target.root, target.platform))
    return
  event.preventDefault()
  target.save()
}

/** Reads/mounts do not activate a pane; only the user's interaction does. */
export function registerTextFileSaveTarget(target: SaveTarget): () => void {
  if (!targets.size) {
    document.addEventListener("pointerdown", activate, true)
    document.addEventListener("focusin", activate, true)
    window.addEventListener("keydown", keydown)
  }
  targets.add(target)
  return () => {
    targets.delete(target)
    if (active === target) active = undefined
    if (!targets.size) {
      document.removeEventListener("pointerdown", activate, true)
      document.removeEventListener("focusin", activate, true)
      window.removeEventListener("keydown", keydown)
    }
  }
}
