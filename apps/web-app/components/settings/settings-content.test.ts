import fs from "fs"
import path from "path"

import { describe, expect, it } from "vitest"

const settingsDir = path.resolve("apps/web-app/components/settings")

describe("settings space sync route", () => {
  it("keeps the space sync settings page reachable", () => {
    const events = fs.readFileSync(
      path.join(settingsDir, "settings-events.ts"),
      "utf-8"
    )
    const sidebar = fs.readFileSync(
      path.join(settingsDir, "settings-sidebar.tsx"),
      "utf-8"
    )
    const content = fs.readFileSync(
      path.join(settingsDir, "settings-content.tsx"),
      "utf-8"
    )

    expect(events).toContain('| "space-sync"')
    expect(sidebar).toContain('id: "space-sync"')
    expect(content).toContain(
      'import { SpaceSyncSettings } from "./space/space-sync-settings"'
    )
    expect(content).toContain('case "space-sync":')
    expect(content).toContain("return <SpaceSyncSettings />")
  })
})
