import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  DEFAULT_EIDOS_LITE_PREFERENCES,
  EidosLitePreferencesStore,
  normalizeEidosLitePreferences,
} from "./app-preferences"

describe("Eidos Lite preferences", () => {
  it("normalizes unknown or stale preference values", () => {
    expect(normalizeEidosLitePreferences(null)).toEqual(
      DEFAULT_EIDOS_LITE_PREFERENCES
    )
    expect(
      normalizeEidosLitePreferences({
        appearance: "sepia",
        defaultSpaceLocation: "",
      })
    ).toEqual(DEFAULT_EIDOS_LITE_PREFERENCES)
  })

  it("persists appearance and the default Space location", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-preferences-")
    )
    const filePath = path.join(directory, "preferences.json")
    const store = new EidosLitePreferencesStore(filePath)

    await expect(store.get()).resolves.toEqual(DEFAULT_EIDOS_LITE_PREFERENCES)
    await expect(
      store.update({
        appearance: "dark",
        automaticCheckpoints: true,
        defaultSpaceLocation: "/Users/example/Spaces",
      })
    ).resolves.toEqual({
      appearance: "dark",
      automaticCheckpoints: true,
      defaultSpaceLocation: "/Users/example/Spaces",
    })

    await expect(
      new EidosLitePreferencesStore(filePath).get()
    ).resolves.toEqual({
      appearance: "dark",
      automaticCheckpoints: true,
      defaultSpaceLocation: "/Users/example/Spaces",
    })
  })
})
