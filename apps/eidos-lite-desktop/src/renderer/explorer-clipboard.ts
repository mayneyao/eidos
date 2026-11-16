import type {
  SpaceTreeEntry,
  SpacePathClipboardSources,
} from "../shared/contracts"
import { shortcutBindingForKeyboardEvent } from "../shared/keyboard-shortcuts"

export type ExplorerClipboardCommand = "cut" | "copy" | "paste"
export interface ExplorerClipboard {
  spaceId: string
  mode: "cut" | "copy"
  entries: SpaceTreeEntry[]
  sources?: SpacePathClipboardSources
}

export function explorerClipboardEntries(
  entries: SpaceTreeEntry[]
): SpaceTreeEntry[] {
  const unique = [
    ...new Map(entries.map((entry) => [entry.relativePath, entry])).values(),
  ]
  return unique.filter(
    (entry) =>
      !unique.some(
        (parent) =>
          parent.kind === "directory" &&
          entry.relativePath.startsWith(`${parent.relativePath}/`)
      )
  )
}

export function canCaptureExplorerEntries(entries: SpaceTreeEntry[]): boolean {
  return (
    entries.length > 0 &&
    entries.every(
      (entry) =>
        entry.kind !== "symlink" &&
        entry.relativePath
          .split("/")
          .every(
            (part) =>
              part !== "." &&
              part !== ".." &&
              part !== "" &&
              ![".graft", ".eidos"].includes(part.toLowerCase())
          ) &&
        !/\.eidos-(wal|shm|journal)$/i.test(entry.relativePath)
    )
  )
}

export function explorerPasteTarget(
  entry: SpaceTreeEntry | null,
  directory: string | null
): string | null {
  if (!entry) return directory
  if (entry.kind === "directory") return entry.relativePath
  const slash = entry.relativePath.lastIndexOf("/")
  return slash < 0 ? null : entry.relativePath.slice(0, slash)
}

export function canPasteExplorerClipboard(
  clipboard: ExplorerClipboard | null,
  spaceId: string | undefined,
  target: string | null
): boolean {
  if (!clipboard || clipboard.spaceId !== spaceId || !clipboard.entries.length)
    return false
  return clipboard.entries.every((entry) => {
    const destination = target ? `${target}/${entry.name}` : entry.name
    return (
      destination !== entry.relativePath &&
      !(
        entry.kind === "directory" &&
        destination.startsWith(`${entry.relativePath}/`)
      )
    )
  })
}

/** An unhydrated parent is unknown; an authoritative missing entry is invalid. */
export function explorerClipboardSourceAvailable(
  entries: SpaceTreeEntry[],
  relativePath: string
): boolean {
  for (const entry of entries) {
    if (entry.relativePath === relativePath) return entry.kind !== "symlink"
    if (
      entry.kind === "directory" &&
      relativePath.startsWith(`${entry.relativePath}/`)
    )
      return entry.childrenLoaded === false ||
        (!entry.children && entry.childrenLoaded !== true)
        ? true
        : explorerClipboardSourceAvailable(entry.children ?? [], relativePath)
  }
  return false
}

export function explorerClipboardEventIsEditable(event: {
  composedPath(): EventTarget[]
}): boolean {
  return event
    .composedPath()
    .some(
      (node) =>
        node instanceof HTMLElement &&
        (node.matches("input, textarea, select, [data-item-rename-input]") ||
          node.isContentEditable ||
          (node.hasAttribute("contenteditable") &&
            node.getAttribute("contenteditable") !== "false"))
    )
}

export function focusedExplorerClipboardPath(
  shell: HTMLElement | null
): Element[] | null {
  const active = document.activeElement
  if (!active || !shell?.contains(active)) return null
  const focusPath: Element[] = []
  let focused: Element | null = active
  while (focused) {
    focusPath.push(focused)
    focused = focused.shadowRoot?.activeElement ?? null
  }
  return explorerClipboardEventIsEditable({ composedPath: () => focusPath })
    ? null
    : focusPath
}

export function explorerClipboardKeyboardCommand(
  event: KeyboardEvent,
  macos: boolean
): ExplorerClipboardCommand | null {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    explorerClipboardEventIsEditable(event)
  )
    return null
  if (macos ? event.ctrlKey : event.metaKey) return null
  const binding = shortcutBindingForKeyboardEvent(event, macos)
  return binding === "Mod+X"
    ? "cut"
    : binding === "Mod+C"
      ? "copy"
      : binding === "Mod+V"
        ? "paste"
        : null
}
