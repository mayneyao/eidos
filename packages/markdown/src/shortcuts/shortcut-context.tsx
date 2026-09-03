import { createContext, useContext, useMemo, type ReactNode } from "react"

import {
  markdownShortcutAriaKeys,
  markdownShortcutLabel,
  matchesMarkdownShortcut,
  resolveMarkdownShortcuts,
  type KeyboardShortcutEvent,
  type MarkdownShortcutDefinition,
  type MarkdownShortcutId,
  type MarkdownShortcutOverrides,
  type ResolvedMarkdownShortcuts,
  type ShortcutDisplayPlatform,
} from "./shortcut-registry"

export interface MarkdownShortcutContextValue {
  ariaKeys(
    ids: MarkdownShortcutId | readonly MarkdownShortcutId[]
  ): string | undefined
  label(id: MarkdownShortcutId): string | undefined
  matches(event: KeyboardShortcutEvent, id: MarkdownShortcutId): boolean
  shortcuts: ResolvedMarkdownShortcuts
}

function displayPlatform(): ShortcutDisplayPlatform {
  if (typeof navigator === "undefined") return "other"
  return /Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? "mac" : "other"
}

const defaultShortcuts = resolveMarkdownShortcuts()
const defaultValue: MarkdownShortcutContextValue = {
  ariaKeys: (ids) => markdownShortcutAriaKeys(ids, defaultShortcuts),
  label: (id) => markdownShortcutLabel(id, "other", defaultShortcuts),
  matches: (event, id) => matchesMarkdownShortcut(event, id, defaultShortcuts),
  shortcuts: defaultShortcuts,
}

const MarkdownShortcutContext =
  createContext<MarkdownShortcutContextValue>(defaultValue)

export function MarkdownShortcutProvider({
  children,
  definitions,
  overrides,
}: {
  children: ReactNode
  definitions?: Readonly<Record<string, MarkdownShortcutDefinition>>
  overrides?: MarkdownShortcutOverrides
}) {
  const shortcuts = useMemo(
    () => resolveMarkdownShortcuts(overrides, definitions),
    [definitions, overrides]
  )
  const value = useMemo<MarkdownShortcutContextValue>(() => {
    const platform = displayPlatform()
    return {
      ariaKeys: (ids) => markdownShortcutAriaKeys(ids, shortcuts),
      label: (id) => markdownShortcutLabel(id, platform, shortcuts),
      matches: (event, id) => matchesMarkdownShortcut(event, id, shortcuts),
      shortcuts,
    }
  }, [shortcuts])
  return (
    <MarkdownShortcutContext.Provider value={value}>
      {children}
    </MarkdownShortcutContext.Provider>
  )
}

export function useMarkdownShortcuts(): MarkdownShortcutContextValue {
  return useContext(MarkdownShortcutContext)
}
