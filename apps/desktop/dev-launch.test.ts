// @vitest-environment node

import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { desktopDevLaunchArgs } from "./dev-launch"

describe("Desktop development launch arguments", () => {
  it("prepares workspace build artifacts before the QA launch", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("./package.json", import.meta.url), "utf8")
    ) as { scripts: Record<string, string> }

    expect(packageJson.scripts["predev:qa"]).toBe("pnpm run predev")
  })

  it("keeps the normal development launch private by default", () => {
    expect(desktopDevLaunchArgs("")).toEqual([".", "--no-sandbox"])
  })

  it("enables a loopback-only DevTools endpoint when explicitly requested", () => {
    expect(desktopDevLaunchArgs("9222")).toEqual([
      ".",
      "--no-sandbox",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=9222",
    ])
  })

  it.each(["0", "65536", "1.5", "not-a-port"])(
    "rejects invalid remote debugging port %s",
    (port) => {
      expect(() => desktopDevLaunchArgs(port)).toThrow(
        "EIDOS_DESKTOP_REMOTE_DEBUGGING_PORT"
      )
    }
  )
})
