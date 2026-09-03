import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS } from "../shared/keyboard-shortcuts"
import { eidosLitePreferencesPatch } from "./preferences-patch"

describe("Eidos Lite preference IPC patch", () => {
  it("keeps every supported preference, including a fixed time zone", () => {
    const patch = {
      appearance: "dark" as const,
      language: "zh" as const,
      markdownFileEditingMode: "wysiwyg" as const,
      terminalLayout: "side" as const,
      timeZone: "Europe/London",
      weekStartsOnMonday: false,
      builtInPlugins: { terminal: true },
      terminalShell: "/bin/zsh",
      keyboardShortcuts: DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
      automaticUpdates: false,
      automaticCheckpoints: true,
      defaultSpaceLocation: "/Users/example/Spaces",
    }

    expect(eidosLitePreferencesPatch(patch)).toEqual(patch)
  })

  it("accepts the system time zone and rejects invalid zones", () => {
    expect(eidosLitePreferencesPatch({ timeZone: "system" })).toEqual({
      timeZone: "system",
    })
    expect(() =>
      eidosLitePreferencesPatch({ timeZone: "Mars/Olympus_Mons" })
    ).toThrow("Invalid time zone preference")
  })

  it("accepts only supported Terminal layouts", () => {
    for (const terminalLayout of ["bottom", "side"] as const) {
      expect(eidosLitePreferencesPatch({ terminalLayout })).toEqual({
        terminalLayout,
      })
    }
    for (const terminalLayout of ["main", "right", "left"]) {
      expect(() => eidosLitePreferencesPatch({ terminalLayout })).toThrow(
        "Invalid terminal layout preference"
      )
    }
  })

  it("accepts only supported Markdown file editing modes", () => {
    for (const markdownFileEditingMode of ["source", "wysiwyg"] as const) {
      expect(eidosLitePreferencesPatch({ markdownFileEditingMode })).toEqual({
        markdownFileEditingMode,
      })
    }
    expect(() =>
      eidosLitePreferencesPatch({ markdownFileEditingMode: "html" })
    ).toThrow("Invalid Markdown file editing mode preference")
  })

  it("accepts only the complete built-in plugin preference shape", () => {
    expect(
      eidosLitePreferencesPatch({ builtInPlugins: { terminal: false } })
    ).toEqual({ builtInPlugins: { terminal: false } })
    expect(() =>
      eidosLitePreferencesPatch({ builtInPlugins: { terminal: "yes" } })
    ).toThrow("Invalid built-in plugin preferences")
    expect(() =>
      eidosLitePreferencesPatch({
        builtInPlugins: { terminal: true, unknown: true },
      })
    ).toThrow("Invalid built-in plugin preferences")
  })

  it("accepts only absolute terminal shell paths or the system default", () => {
    expect(eidosLitePreferencesPatch({ terminalShell: "/bin/zsh" })).toEqual({
      terminalShell: "/bin/zsh",
    })
    expect(eidosLitePreferencesPatch({ terminalShell: null })).toEqual({
      terminalShell: null,
    })
    expect(() => eidosLitePreferencesPatch({ terminalShell: "zsh" })).toThrow(
      "Invalid terminal shell preference"
    )
  })
})
