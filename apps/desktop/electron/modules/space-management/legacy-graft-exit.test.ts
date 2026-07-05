import fs from "fs"
import path from "path"

import { describe, expect, it } from "vitest"

const spaceManagementDir = path.resolve(
  "apps/desktop/electron/modules/space-management"
)
const sqliteServerDir = path.resolve(
  "apps/desktop/electron/modules/data-space/worker/sqlite-server"
)

describe("legacy graft exit support", () => {
  it("keeps old graft spaces registered and opened as sync-enabled spaces", () => {
    const registry = fs.readFileSync(
      path.join(spaceManagementDir, "space-registry.ts"),
      "utf-8"
    )

    expect(registry).toContain('path.join(oldSpacePath, ".eidos")')
    expect(registry).toContain('path.join(eidosDir, "db.sqlite3")')
    expect(registry).toContain("hasMigratableDatabase || hasLegacyGraftState")
    expect(registry).toContain("withLegacyGraftSync")
    expect(registry).toContain("remote: space.sync?.remote ||")
  })

  it("reuses existing graft config instead of requiring new registry sync config", () => {
    const initializer = fs.readFileSync(
      path.join(sqliteServerDir, "initializer.ts"),
      "utf-8"
    )

    expect(initializer).toContain('path.join(eidosDirPath, "graft.toml")')
    expect(initializer).toContain(
      "process.env.GRAFT_CONFIG = existingGraftConfigPath"
    )
    expect(initializer).toContain("Using existing graft config")
  })
})
