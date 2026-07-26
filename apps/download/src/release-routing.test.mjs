import assert from "node:assert/strict"
import test from "node:test"

import { getCliSource, isStableDesktopRelease } from "./release-routing.mjs"

test("download worker exposes stable branded CLI entry points", () => {
  assert.equal(
    getCliSource("/cli/install.sh"),
    "https://raw.githubusercontent.com/mayneyao/eidos/dev/apps/cli/install.sh"
  )
  assert.equal(
    getCliSource("/cli/install.ps1"),
    "https://raw.githubusercontent.com/mayneyao/eidos/dev/apps/cli/install.ps1"
  )
  assert.equal(
    getCliSource("/cli/latest"),
    "https://raw.githubusercontent.com/mayneyao/eidos/dev/apps/cli/LATEST"
  )
  assert.equal(getCliSource("/cli/unknown"), null)
})

test("standalone CLI releases cannot shadow stable Desktop downloads", () => {
  assert.equal(
    isStableDesktopRelease({
      draft: false,
      prerelease: false,
      tag_name: "cli-v0.34.0",
    }),
    false
  )
  assert.equal(
    isStableDesktopRelease({
      draft: false,
      prerelease: false,
      tag_name: "v0.34.0",
    }),
    true
  )
  assert.equal(
    isStableDesktopRelease({
      draft: false,
      prerelease: true,
      tag_name: "v0.35.0-beta.1",
    }),
    false
  )
})
