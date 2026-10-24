import assert from "node:assert/strict"
import fs from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const builderRequire = createRequire(
  require.resolve("electron-builder/package.json")
)
const { getConfig } = builderRequire(
  "app-builder-lib/out/util/config/config.js"
)

const inheritedResources = [
  { from: "resources/plugin-sandbox", to: "plugin-sandbox", filter: ["**/*"] },
  {
    from: "node_modules/typescript/lib",
    to: "app.asar.unpacked/node_modules/typescript/lib",
    filter: ["*.d.ts"],
  },
  { from: "resources/publish-engine", to: "publish-engine", filter: ["**/*"] },
  { from: "resources/vtab", to: "vtab", filter: ["**/*"] },
]
const snapshotResource = {
  from: "resources/graft-e2ee",
  to: "graft-e2ee",
  filter: ["**/*"],
}

for (const sourceSnapshot of [false, true]) {
  test(`builder merges complete, unique ${sourceSnapshot ? "snapshot" : "registry"} resources`, async (t) => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-builder-config-")
    )
    t.after(() => fs.rm(root, { recursive: true, force: true }))
    const fixtureApp = path.join(root, "apps/eidos-lite-desktop")
    await fs.mkdir(path.join(fixtureApp, "scripts"), { recursive: true })
    for (const name of [
      "electron-builder.json",
      "electron-builder.dev.json",
      "electron-builder.dev.mjs",
      "scripts/graft-snapshot-policy.mjs",
      "package.json",
    ]) {
      await fs.copyFile(path.join(appRoot, name), path.join(fixtureApp, name))
    }
    await fs.symlink(
      path.join(appRoot, "node_modules"),
      path.join(fixtureApp, "node_modules"),
      process.platform === "win32" ? "junction" : "dir"
    )
    const manifest = JSON.parse(
      await fs.readFile(path.join(appRoot, "package.json"), "utf8")
    )
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      JSON.stringify(
        sourceSnapshot
          ? {
              overrides: {
                "@eidos.space/graft": `file:vendor/graft-e2ee/eidos.space-graft-${manifest.dependencies["@eidos.space/graft"]}.tgz`,
              },
            }
          : {}
      )
    )

    const effective = await getConfig(fixtureApp, "electron-builder.dev.mjs")
    const resources = effective.extraResources
    const expected = [
      ...inheritedResources,
      ...(sourceSnapshot ? [snapshotResource] : []),
    ]
    assert.equal(new Set(resources.map(({ to }) => to)).size, resources.length)
    const byDestination = (a, b) => a.to.localeCompare(b.to)
    assert.deepEqual(
      resources.toSorted(byDestination),
      expected.toSorted(byDestination)
    )
  })
}
