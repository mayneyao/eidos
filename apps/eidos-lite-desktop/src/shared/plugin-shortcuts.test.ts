import { expect, it } from "vitest"
import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS as defaults } from "./keyboard-shortcuts"
import {
  availablePluginShortcuts,
  pluginShortcutForEvent,
} from "./plugin-shortcuts"

it("recognizes macOS Shift+Option+F despite its printable Ï key value", () => {
  expect(
    pluginShortcutForEvent(
      {
        key: "Ï",
        code: "KeyF",
        metaKey: false,
        ctrlKey: false,
        altKey: true,
        shiftKey: true,
        repeat: false,
      },
      new Set(["Alt+Shift+F"]),
      true
    )
  ).toBe("Alt+Shift+F")
})

it("preserves host/editor bindings and physical Ctrl aliases", () => {
  expect(
    availablePluginShortcuts(
      ["Mod+K", "Mod+S", "Mod+Z", "Mod+Alt+F"],
      defaults,
      true
    )
  ).toEqual(["Mod+Alt+F"])
  expect(
    availablePluginShortcuts(["Ctrl+K", "Ctrl+S", "Ctrl+Z"], defaults, false)
  ).toEqual([])
  expect(() => availablePluginShortcuts(["F"], defaults, true)).toThrow()
})
it("matches physical keys on macOS and Windows and ignores repeat/IME", () => {
  const binding = new Set(["Mod+Alt+F"])
  const event = {
    key: "ƒ",
    code: "KeyF",
    metaKey: true,
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
    repeat: false,
  }
  expect(pluginShortcutForEvent(event, binding, true)).toBe("Mod+Alt+F")
  expect(
    pluginShortcutForEvent(
      { ...event, metaKey: false, ctrlKey: true },
      binding,
      false
    )
  ).toBe("Mod+Alt+F")
  expect(
    pluginShortcutForEvent({ ...event, repeat: true }, binding, true)
  ).toBeUndefined()
  expect(
    pluginShortcutForEvent({ ...event, isComposing: true }, binding, true)
  ).toBeUndefined()
  expect(
    pluginShortcutForEvent({ ...event, shiftKey: true }, binding, true)
  ).toBeUndefined()
})
