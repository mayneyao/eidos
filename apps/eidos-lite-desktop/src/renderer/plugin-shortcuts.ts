import type { PluginManifest } from "@eidos.space/plugin-sdk"
import { normalizeEidosLiteShortcutBinding } from "../shared/keyboard-shortcuts"

export function pluginShortcutBindings(
  manifests: PluginManifest[],
  eligible: Set<string>,
  mac: boolean,
  linux = false
) {
  const candidates = new Map<string, Set<string>>()
  const conflicts: string[] = []
  for (const manifest of manifests)
    for (const placement of manifest.placements ?? []) {
      if (placement.location !== "keybinding") continue
      const action = `${manifest.id}/${placement.action}`
      if (!eligible.has(action)) continue
      const raw = mac
        ? (placement.mac ?? placement.key)
        : linux
          ? (placement.linux ?? placement.key)
          : placement.key
      let key = normalizeEidosLiteShortcutBinding(raw)
      if (!key) {
        conflicts.push(`${manifest.name}: ${raw}`)
        continue
      }
      if (!mac) key = key.replace(/^Ctrl\+/, "Mod+")
      const actions = candidates.get(key) ?? new Set<string>()
      actions.add(action)
      candidates.set(key, actions)
    }
  const bindings: Record<string, string> = {}
  for (const [key, actions] of candidates) {
    if (actions.size === 1) bindings[key] = [...actions][0]!
    else conflicts.push(`${key}: ${[...actions].join(", ")}`)
  }
  return { bindings, conflicts }
}
