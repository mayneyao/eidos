import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  DEFAULT_EIDOS_LITE_PREFERENCES,
  EidosLitePreferencesStore,
  normalizeEidosLitePreferences,
} from "./app-preferences"
import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS } from "../shared/keyboard-shortcuts"

describe("Eidos Lite preferences", () => {
  it("normalizes unknown or stale preference values", () => {
    expect(normalizeEidosLitePreferences(null)).toEqual(
      DEFAULT_EIDOS_LITE_PREFERENCES
    )
    expect(
      normalizeEidosLitePreferences({
        appearance: "sepia",
        timeZone: "Mars/Olympus_Mons",
        defaultSpaceLocation: "",
      })
    ).toEqual(DEFAULT_EIDOS_LITE_PREFERENCES)
  })

  it("persists appearance, layout, calendar, language, time zone, built-in plugins, shortcuts, and Space defaults", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-preferences-")
    )
    const filePath = path.join(directory, "preferences.json")
    const store = new EidosLitePreferencesStore(filePath)

    await expect(store.get()).resolves.toEqual(DEFAULT_EIDOS_LITE_PREFERENCES)
    await expect(
      store.update({
        appearance: "dark",
        language: "zh",
        markdownFileEditingMode: "wysiwyg",
        markdownCompatibilityProfile: "obsidian",
        terminalLayout: "side",
        timeZone: "America/New_York",
        weekStartsOnMonday: false,
        builtInPlugins: { terminal: true },
        terminalShell: "/bin/zsh",
        keyboardShortcuts: {
          ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
          "toggle-sidebar": "Mod+Shift+B",
        },
        automaticUpdates: false,
        automaticCheckpoints: true,
        defaultSpaceLocation: "/Users/example/Spaces",
      })
    ).resolves.toEqual({
      appearance: "dark",
      language: "zh",
      markdownFileEditingMode: "wysiwyg",
      markdownCompatibilityProfile: "obsidian",
      terminalLayout: "side",
      timeZone: "America/New_York",
      weekStartsOnMonday: false,
      builtInPlugins: { terminal: true },
      terminalShell: "/bin/zsh",
      keyboardShortcuts: {
        ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        "toggle-sidebar": "Mod+Shift+B",
      },
      automaticUpdates: false,
      automaticCheckpoints: true,
      defaultSpaceLocation: "/Users/example/Spaces",
    })

    await expect(
      new EidosLitePreferencesStore(filePath).get()
    ).resolves.toEqual({
      appearance: "dark",
      language: "zh",
      markdownFileEditingMode: "wysiwyg",
      markdownCompatibilityProfile: "obsidian",
      terminalLayout: "side",
      timeZone: "America/New_York",
      weekStartsOnMonday: false,
      builtInPlugins: { terminal: true },
      terminalShell: "/bin/zsh",
      keyboardShortcuts: {
        ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        "toggle-sidebar": "Mod+Shift+B",
      },
      automaticUpdates: false,
      automaticCheckpoints: true,
      defaultSpaceLocation: "/Users/example/Spaces",
    })
  })

  it("migrates the earlier Terminal-primary preference into the unified layout", () => {
    expect(
      normalizeEidosLitePreferences({ workspaceLayout: "terminal-primary" })
        .terminalLayout
    ).toBe("side")
  })

  it("migrates retired main and right Terminal layouts to the side split", () => {
    expect(
      normalizeEidosLitePreferences({ terminalLayout: "main" }).terminalLayout
    ).toBe("side")
    expect(
      normalizeEidosLitePreferences({ terminalLayout: "right" }).terminalLayout
    ).toBe("side")
  })
})
