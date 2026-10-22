import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  assertEncryptedRemote,
  assertEncryptedSdk,
  validateGraftReleaseInputs,
} from "./verify-graft-release.mjs"

test("checks import-only Remote exports from each consuming project's dependency", async (t) => {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "graft-release-import-")
  )
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const consumer = async (name, source) => {
    const directory = path.join(temporary, name)
    const dependency = path.join(
      directory,
      "node_modules/@eidos.space/graft-remote"
    )
    await fs.mkdir(path.join(dependency, "dist"), { recursive: true })
    await fs.writeFile(
      path.join(dependency, "package.json"),
      JSON.stringify({
        name: "@eidos.space/graft-remote",
        type: "module",
        exports: {
          ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
        },
      })
    )
    await fs.writeFile(path.join(dependency, "dist/index.js"), source)
    return directory
  }
  const lite = await consumer(
    "lite",
    "export function parseEncryptedRoutingHint() {}"
  )
  const remote = await consumer("remote", "export const legacyRemoteApi = true")

  assert.doesNotThrow(() => assertEncryptedRemote(lite))
  assert.throws(
    () => assertEncryptedRemote(remote),
    /Published Graft Remote does not provide the encrypted remote API/
  )
  await fs.writeFile(
    path.join(remote, "node_modules/@eidos.space/graft-remote/dist/index.js"),
    "export function parseEncryptedRoutingHint() {}"
  )
  assert.doesNotThrow(() => assertEncryptedRemote(remote))
})

function fixture() {
  const sdk = "0.3.32"
  const remote = "0.2.5"
  const native = [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64-gnu",
    "linux-x64-gnu",
    "win32-x64-msvc",
  ]
  const lite = {
    dependencies: {
      "@eidos.space/graft": sdk,
      "@eidos.space/graft-remote": remote,
    },
    optionalDependencies: Object.fromEntries(
      native.map((name) => [`@eidos.space/graft-${name}`, sdk])
    ),
  }
  const remoteManifest = {
    dependencies: Object.fromEntries(
      ["graft-remote", "graft-remote-hono", "graft-remote-cloudflare"].map(
        (name) => [`@eidos.space/${name}`, remote]
      )
    ),
  }
  const entries = (dependencies) =>
    Object.fromEntries(
      Object.entries(dependencies).map(([name, version]) => [
        name,
        { specifier: version, version },
      ])
    )
  const packages = Object.fromEntries(
    Object.entries({
      ...lite.dependencies,
      ...lite.optionalDependencies,
      ...remoteManifest.dependencies,
    }).map(([name, version]) => [
      `${name}@${version}`,
      { resolution: { integrity: "sha512-YWJjZA==" } },
    ])
  )
  return {
    lite,
    remote: remoteManifest,
    workspace: {},
    lock: {
      importers: {
        "apps/eidos-lite-desktop": {
          dependencies: entries(lite.dependencies),
          optionalDependencies: entries(lite.optionalDependencies),
        },
        "apps/graft-remote": {
          dependencies: entries(remoteManifest.dependencies),
        },
      },
      packages,
    },
  }
}

test("installed lockfiles may omit foreign optional packages but require the host binding", () => {
  const inputs = fixture()
  const native =
    inputs.lock.importers["apps/eidos-lite-desktop"].optionalDependencies
  for (const name of Object.keys(native)) {
    if (name !== "@eidos.space/graft-darwin-arm64") delete native[name]
  }
  const installed = {
    ...inputs,
    installed: true,
    platform: "darwin",
    arch: "arm64",
  }
  assert.deepEqual(validateGraftReleaseInputs(installed), [])
  assert.ok(validateGraftReleaseInputs(inputs).length > 0)
  delete native["@eidos.space/graft-darwin-arm64"]
  assert.ok(
    validateGraftReleaseInputs(installed).some((error) =>
      error.includes("graft-darwin-arm64")
    )
  )
})

test("accepts matching registry-only SDK platform packages and remote cohort", () => {
  assert.deepEqual(validateGraftReleaseInputs(fixture()), [])
  assert.deepEqual(
    validateGraftReleaseInputs({ ...fixture(), surface: "remote" }),
    []
  )
})

test("rejects a same-version source snapshot even when the wrapper version matches", () => {
  const input = fixture()
  input.workspace.overrides = { "@eidos.space/graft": "file:vendor/graft.tgz" }
  input.lock.importers["apps/eidos-lite-desktop"].dependencies[
    "@eidos.space/graft"
  ] = {
    specifier: "file:../../vendor/graft.tgz",
    version: "file:vendor/graft.tgz",
  }
  assert.match(
    validateGraftReleaseInputs(input).join("\n"),
    /workspace override.*must be removed/
  )
  assert.match(
    validateGraftReleaseInputs(input).join("\n"),
    /does not resolve to its declared registry version/
  )
})

test("rejects native overrides, mismatched platform pins, and non-registry tarballs", () => {
  const input = fixture()
  input.environment = { GRAFT_SDK_NATIVE_PATH: "/tmp/local.node" }
  input.lite.optionalDependencies["@eidos.space/graft-darwin-arm64"] = "0.3.30"
  input.lock.packages["@eidos.space/graft@0.3.32"].resolution.tarball =
    "https://untrusted.invalid/package.tgz"
  const errors = validateGraftReleaseInputs(input).join("\n")
  assert.match(errors, /GRAFT_SDK_NATIVE_PATH must be unset/)
  assert.match(errors, /must match the root Graft SDK version/)
  assert.match(errors, /non-registry tarball/)
})

test("rejects an unresolved or mismatched remote cohort", () => {
  const input = fixture()
  input.remote.dependencies["@eidos.space/graft-remote-hono"] = "^0.2.5"
  const errors = validateGraftReleaseInputs({
    ...input,
    surface: "remote",
  }).join("\n")
  assert.match(errors, /exact registry version/)
  assert.match(errors, /must match the Graft Remote cohort version/)
})

test("Worker release checks do not depend on an unrelated local Node SDK", () => {
  const input = fixture()
  delete input.lite.optionalDependencies
  input.environment = {
    GRAFT_SDK_NATIVE_PATH: "/local/desktop-test.node",
    EIDOS_LITE_GRAFT_SDK_PATH: "/local/desktop-sdk",
  }
  assert.deepEqual(
    validateGraftReleaseInputs({ ...input, surface: "remote" }),
    []
  )
})

test("requires the native E2EE profile, not only the JavaScript export", () => {
  class PlainBinding {
    static createPrivateDirectory() {}
    constructor() {
      throw Object.assign(new Error("feature off"), {
        code: "GRAFT_SDK_E2EE_UNSUPPORTED_ENCRYPTED_PROFILE",
      })
    }
  }
  assert.throws(
    () =>
      assertEncryptedSdk(
        {
          sdkVersion: () => "0.3.32",
          EncryptedRemoteSession: PlainBinding,
          RepositorySession: class {
            removeRemote() {}
          },
        },
        "0.3.32"
      ),
    /lacks the required E2EE profile/
  )
  class EncryptedBinding {
    static createPrivateDirectory() {}
    constructor() {
      throw Object.assign(new Error("invalid UUID"), {
        code: "GRAFT_SDK_E2EE_INVALID_SESSION_BINDING",
      })
    }
  }
  assert.doesNotThrow(() =>
    assertEncryptedSdk(
      {
        sdkVersion: () => "0.3.32",
        EncryptedRemoteSession: EncryptedBinding,
        RepositorySession: class {
          removeRemote() {}
        },
      },
      "0.3.32"
    )
  )
  assert.throws(
    () =>
      assertEncryptedSdk(
        {
          sdkVersion: () => "0.3.32",
          EncryptedRemoteSession: EncryptedBinding,
          RepositorySession: class {},
        },
        "0.3.32"
      ),
    /remote disconnect API/
  )
  assert.throws(
    () =>
      assertEncryptedSdk(
        {
          sdkVersion: () => "0.3.32",
          EncryptedRemoteSession: class {
            constructor() {
              throw Object.assign(new Error("invalid UUID"), {
                code: "GRAFT_SDK_E2EE_INVALID_SESSION_BINDING",
              })
            }
          },
          RepositorySession: class {
            removeRemote() {}
          },
        },
        "0.3.32"
      ),
    /native private directory API/
  )
})
