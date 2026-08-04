import assert from "node:assert/strict"
import test from "node:test"

import {
  getCliSource,
  getEidosLiteUpdateRoute,
  isStableDesktopRelease,
  releaseAssetNameForLiteUpdate,
  selectEidosLiteRelease,
  selectPreferredDesktopRelease,
} from "./release-routing.mjs"

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

test("Lite releases use an independent stable and beta namespace", () => {
  const classic = {
    draft: false,
    prerelease: false,
    tag_name: "v0.34.0",
  }
  const stable = {
    draft: false,
    prerelease: false,
    tag_name: "lite-v0.2.0",
  }
  const beta = {
    draft: false,
    prerelease: true,
    tag_name: "lite-v0.3.0-beta.2",
  }
  const invalid = {
    draft: false,
    prerelease: false,
    tag_name: "lite-v0.4.0-beta.1",
  }

  assert.equal(
    selectEidosLiteRelease([classic, beta, stable], "stable"),
    stable
  )
  assert.equal(selectEidosLiteRelease([stable, beta], "beta"), beta)
  assert.equal(selectEidosLiteRelease([invalid], "beta"), null)
  assert.equal(selectPreferredDesktopRelease([classic, stable]), stable)
  assert.equal(selectPreferredDesktopRelease([classic]), classic)
})

test("Lite update routes isolate channel, architecture, and metadata assets", () => {
  const route = getEidosLiteUpdateRoute("/lite/updates/beta/arm64/beta-mac.yml")
  assert.deepEqual(route, {
    channel: "beta",
    architecture: "arm64",
    assetName: "beta-mac.yml",
  })
  assert.equal(releaseAssetNameForLiteUpdate(route), "beta-mac-arm64.yml")
  assert.equal(
    releaseAssetNameForLiteUpdate({
      channel: "stable",
      architecture: "x64",
      assetName: "Eidos Lite-0.2.0-mac-x64.zip",
    }),
    "Eidos Lite-0.2.0-mac-x64.zip"
  )
  assert.equal(getEidosLiteUpdateRoute("/lite/updates/stable/x64/../x"), null)
})
