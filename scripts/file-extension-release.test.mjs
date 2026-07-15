import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import {
  assertPublishEnvironment,
  createPublishManifest,
  createReleasePlan,
  loadReleaseArtifact,
  main,
  sortReleasePackages,
} from "./file-extension-release.mjs"

const integrity = "sha512-local"

function packageInfo(name, internalDependencies = []) {
  return { name, version: "0.1.0", integrity, internalDependencies }
}

test("orders public packages after their internal dependencies", () => {
  const ordered = sortReleasePackages([
    packageInfo("cli", ["runtime", "sdk"]),
    packageInfo("sdk", ["protocol"]),
    packageInfo("runtime", ["manifest", "protocol"]),
    packageInfo("manifest"),
    packageInfo("protocol"),
  ])
  assert.deepEqual(
    ordered.map(({ name }) => name),
    ["manifest", "protocol", "runtime", "sdk", "cli"]
  )
})

test("rejects internal dependency cycles", () => {
  assert.throws(
    () =>
      sortReleasePackages([
        packageInfo("one", ["two"]),
        packageInfo("two", ["one"]),
      ]),
    /dependency cycle/u
  )
})

test("creates a deterministic publish manifest with exact internal versions", () => {
  const manifest = createPublishManifest({
    name: "@eidos.space/extension-cli",
    version: "0.1.0",
    manifest: {
      name: "@eidos.space/extension-cli",
      version: "0.1.0",
      dependencies: {
        typescript: "^5.8.3",
        "@eidos.space/extension-runtime": "workspace:*",
        "@eidos.space/extension-manifest": "workspace:*",
        "@eidos.space/extension-sdk": "workspace:*",
      },
    },
  })
  assert.deepEqual(Object.keys(manifest.dependencies), [
    "@eidos.space/extension-manifest",
    "@eidos.space/extension-runtime",
    "@eidos.space/extension-sdk",
    "typescript",
  ])
  assert.equal(manifest.dependencies["@eidos.space/extension-runtime"], "0.1.0")
  assert.doesNotMatch(JSON.stringify(manifest), /workspace:/u)
})

test("rejects workspace dependencies outside the public release set", () => {
  assert.throws(
    () =>
      createPublishManifest({
        name: "@eidos.space/extension-cli",
        version: "0.1.0",
        manifest: {
          dependencies: {
            "@eidos.space/private-helper": "workspace:*",
          },
        },
      }),
    /still contains a workspace protocol/u
  )
})

test("plans an idempotent partial bootstrap", () => {
  const packages = [
    packageInfo("manifest"),
    packageInfo("runtime", ["manifest"]),
  ]
  const states = new Map([
    ["manifest", { packageExists: true, versionExists: true, integrity }],
    ["runtime", { packageExists: false, versionExists: false }],
  ])
  assert.deepEqual(
    createReleasePlan(packages, states, "bootstrap").map(
      ({ action }) => action
    ),
    ["skip", "publish"]
  )
})

test("refuses bootstrap for an existing package with a new version", () => {
  assert.throws(
    () =>
      createReleasePlan(
        [packageInfo("manifest")],
        new Map([["manifest", { packageExists: true, versionExists: false }]]),
        "bootstrap"
      ),
    /use stage mode/u
  )
})

test("stages later versions and rejects brand-new packages", () => {
  assert.equal(
    createReleasePlan(
      [packageInfo("manifest")],
      new Map([["manifest", { packageExists: true, versionExists: false }]]),
      "stage"
    )[0].action,
    "stage"
  )
  assert.throws(
    () =>
      createReleasePlan(
        [packageInfo("manifest")],
        new Map([["manifest", { packageExists: false, versionExists: false }]]),
        "stage"
      ),
    /cannot create a package/u
  )
})

test("rejects an immutable version with different bytes", () => {
  assert.throws(
    () =>
      createReleasePlan(
        [packageInfo("manifest")],
        new Map([
          [
            "manifest",
            {
              packageExists: true,
              versionExists: true,
              integrity: "sha512-other",
            },
          ],
        ]),
        "stage"
      ),
    /different integrity/u
  )
})

test("publishing is limited to the exact release tag in GitHub Actions", () => {
  assert.doesNotThrow(() =>
    assertPublishEnvironment("0.1.0", {
      GITHUB_ACTIONS: "true",
      GITHUB_REF_TYPE: "tag",
      GITHUB_REF_NAME: "extension-tooling-v0.1.0",
    })
  )
  assert.throws(
    () =>
      assertPublishEnvironment("0.1.0", {
        GITHUB_ACTIONS: "true",
        GITHUB_REF_TYPE: "branch",
        GITHUB_REF_NAME: "dev",
      }),
    /requires a tag/u
  )
})

test("publishing requires bytes from a reviewed artifact", async () => {
  await assert.rejects(
    main(["--mode", "bootstrap", "--version", "0.1.0", "--publish"]),
    /requires a reviewed --artifact-dir/u
  )
})

test("verifies reviewed artifacts against commit and archive hashes", async () => {
  const artifactDirectory = await mkdtemp(
    path.join(tmpdir(), "eidos-extension-release-test-")
  )
  const archive = Buffer.from("reviewed package bytes")
  const archiveName = "extension-manifest.tgz"
  const archivePath = path.join(artifactDirectory, archiveName)
  const reviewed = {
    name: "@eidos.space/extension-manifest",
    version: "0.1.0",
    archive: archiveName,
    bytes: archive.byteLength,
    integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    shasum: createHash("sha1").update(archive).digest("hex"),
  }
  const packages = [
    {
      name: reviewed.name,
      version: reviewed.version,
      archive: archiveName,
    },
  ]
  try {
    await writeFile(archivePath, archive)
    await writeFile(
      path.join(artifactDirectory, "release-plan.json"),
      JSON.stringify({
        version: "0.1.0",
        mode: "bootstrap",
        tag: "extension-tooling-v0.1.0",
        sourceSha: "source-commit",
        packages: [reviewed],
      })
    )
    const verified = await loadReleaseArtifact(packages, {
      artifactDirectory,
      expectedVersion: "0.1.0",
      expectedMode: "bootstrap",
      expectedSourceSha: "source-commit",
    })
    assert.equal(verified.packages[0].integrity, reviewed.integrity)

    await writeFile(archivePath, "modified")
    await assert.rejects(
      loadReleaseArtifact(packages, {
        artifactDirectory,
        expectedVersion: "0.1.0",
        expectedMode: "bootstrap",
        expectedSourceSha: "source-commit",
      }),
      /reviewed archive was modified/u
    )
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true })
  }
})
