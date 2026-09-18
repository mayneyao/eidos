import { expect, it } from "vitest"
import type { PluginManifest } from "@eidos.space/plugin-sdk"
import { pluginShortcutBindings } from "./plugin-shortcuts"
it("uses VS Code format bindings on each platform", () => {
  const manifest: PluginManifest = {
    apiVersion: 1,
    id: "eidos.autocorrect",
    name: "AutoCorrect",
    version: "0.1.0",
    placements: [
      {
        location: "keybinding",
        action: "format",
        key: "Alt+Shift+F",
        linux: "Ctrl+Shift+I",
      },
    ],
  }
  const eligible = new Set(["eidos.autocorrect/format"])
  expect(
    Object.keys(pluginShortcutBindings([manifest], eligible, true).bindings)
  ).toEqual(["Alt+Shift+F"])
  expect(
    Object.keys(pluginShortcutBindings([manifest], eligible, false).bindings)
  ).toEqual(["Alt+Shift+F"])
  expect(
    Object.keys(
      pluginShortcutBindings([manifest], eligible, false, true).bindings
    )
  ).toEqual(["Mod+Shift+I"])
})
it("filters context, respects mac overrides and disables ambiguous bindings", () => {
  const plugin: PluginManifest = {
    apiVersion: 1,
    id: "eidos.a",
    name: "A",
    version: "1.0.0",
    placements: [
      {
        location: "keybinding",
        action: "format",
        key: "Ctrl+Alt+F",
        mac: "Mod+Alt+F",
      },
    ],
  }
  expect(pluginShortcutBindings([plugin], new Set(), true).bindings).toEqual({})
  expect(
    pluginShortcutBindings([plugin], new Set(["eidos.a/format"]), true).bindings
  ).toEqual({ "Mod+Alt+F": "eidos.a/format" })
  const conflict = pluginShortcutBindings(
    [plugin, { ...plugin, id: "eidos.b" }],
    new Set(["eidos.a/format", "eidos.b/format"]),
    false
  )
  expect(conflict.bindings).toEqual({})
  expect(conflict.conflicts).toHaveLength(1)
})
