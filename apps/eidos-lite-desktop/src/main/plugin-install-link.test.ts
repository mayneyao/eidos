import { describe, expect, it } from "vitest"

import {
  pluginInstallIdFromUrl,
  pluginInstallIdsFromArguments,
} from "./plugin-install-link"

describe("Eidos Lite plugin install links", () => {
  it("accepts only a plugin ID in the install route", () => {
    expect(
      pluginInstallIdFromUrl("eidos-lite://plugins/install/eidos.smart-actions")
    ).toBe("eidos.smart-actions")
    for (const value of [
      "https://plugins/install/eidos.map",
      "eidos-lite://other/install/eidos.map",
      "eidos-lite://plugins/remove/eidos.map",
      "eidos-lite://plugins/install/eidos.map/extra",
      "eidos-lite://plugins/install/%2Fetc%2Fpasswd",
      "eidos-lite://plugins/install/eidos.map?source=other",
      "eidos-lite://plugins/install/eidos.map#fragment",
      "eidos-lite://user@plugins/install/eidos.map",
      "eidos-lite://plugins/install/UPPERCASE",
    ]) {
      expect(pluginInstallIdFromUrl(value)).toBeNull()
    }
  })

  it("collects valid launch intents without duplicates", () => {
    expect(
      pluginInstallIdsFromArguments([
        "/Applications/Eidos Lite.app",
        "eidos-lite://plugins/install/eidos.map",
        "eidos-lite://plugins/install/eidos.chart",
        "eidos-lite://plugins/install/eidos.map",
      ])
    ).toEqual(["eidos.map", "eidos.chart"])
  })
})
