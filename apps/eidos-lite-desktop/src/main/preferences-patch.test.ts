import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS } from "../shared/keyboard-shortcuts"
import { eidosLitePreferencesPatch } from "./preferences-patch"

describe("Eidos Lite preference IPC patch", () => {
  it("keeps every supported preference, including a fixed time zone", () => {
    const patch = {
      appearance: "dark" as const,
      language: "zh" as const,
      timeZone: "Europe/London",
      weekStartsOnMonday: false,
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
})
