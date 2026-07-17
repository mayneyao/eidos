// @vitest-environment node

import path from "node:path"
import type { Alias } from "vite"

import { sharedAlias } from "./base.config"

function resolveWorkspaceAlias(source: string): string | null {
  for (const alias of sharedAlias as Alias[]) {
    if (typeof alias.find === "string") {
      if (alias.find === source) return alias.replacement
      continue
    }
    if (alias.find.test(source)) {
      return source.replace(alias.find, alias.replacement)
    }
  }
  return null
}

describe("workspace package aliases", () => {
  it("resolves Eidos File runtime entry points to source instead of transient dist", () => {
    expect(resolveWorkspaceAlias("@eidos.space/eidos-file")).toBe(
      path.resolve(__dirname, "../../eidos-file/src/index.ts")
    )
    expect(
      resolveWorkspaceAlias("@eidos.space/eidos-file/better-sqlite3")
    ).toBe(path.resolve(__dirname, "../../eidos-file/src/better-sqlite3"))
  })

  it("keeps Desktop-only workspace packages off transient dist entries", () => {
    expect(
      resolveWorkspaceAlias(
        "@eidos.space/legacy-space-migration/better-sqlite3"
      )
    ).toBe(
      path.resolve(__dirname, "../../legacy-space-migration/src/better-sqlite3")
    )
    expect(resolveWorkspaceAlias("@eidos.space/electron-ipc")).toBe(
      path.resolve(__dirname, "../../electron-ipc/src/index.ts")
    )
  })
})
