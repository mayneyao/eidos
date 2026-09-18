import {
  isReservedEidosLiteShortcut,
  normalizeEidosLiteShortcutBinding,
  shortcutBindingForKeyboardEvent,
  type EidosLiteKeyboardShortcuts,
} from "./keyboard-shortcuts"

export function availablePluginShortcuts(
  value: unknown,
  shortcuts: EidosLiteKeyboardShortcuts,
  mac: boolean
): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    value.some(
      (binding) =>
        typeof binding !== "string" ||
        normalizeEidosLiteShortcutBinding(binding) !== binding
    )
  )
    throw new Error("Invalid plugin shortcuts")
  const canonical = (key: string) =>
    mac ? key : key.replace(/^Ctrl\+/, "Mod+")
  const reserved = new Set(
    [
      "Mod+S",
      ...Object.values(shortcuts).filter((key): key is string => !!key),
    ].map(canonical)
  )
  return [...new Set(value as string[])].filter(
    (key) =>
      !isReservedEidosLiteShortcut(canonical(key)) &&
      !reserved.has(canonical(key))
  )
}

export function pluginShortcutForEvent(
  event: Parameters<typeof shortcutBindingForKeyboardEvent>[0] & {
    isComposing?: boolean
  },
  bindings: Set<string>,
  mac: boolean
): string | undefined {
  if (event.isComposing) return undefined
  const key = shortcutBindingForKeyboardEvent(event, mac)
  if (!key) return undefined
  return [key, ...(mac ? [] : [key.replace(/^Mod\+/, "Ctrl+")])].find(
    (binding) => bindings.has(binding)
  )
}
