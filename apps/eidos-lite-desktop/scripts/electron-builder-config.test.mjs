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
const { getMainFileMatchers, getNodeModuleFileMatcher } = builderRequire(
  "app-builder-lib/out/fileMatcher.js"
)
const { AppFileWalker } = builderRequire(
  "app-builder-lib/out/util/AppFileWalker.js"
)
const { expandMacro } = builderRequire(
  "app-builder-lib/out/util/macroExpander.js"
)

const inheritedResources = [
  {
    from: "resources/plugin-sandbox",
    to: "plugin-sandbox",
    filter: ["plugin-sandbox", "plugin-sandbox.exe"],
  },
  {
    from: "node_modules/typescript/lib",
    to: "app.asar.unpacked/node_modules/typescript/lib",
    filter: ["lib*.d.ts"],
  },
  { from: "resources/publish-engine", to: "publish-engine", filter: ["**/*"] },
  { from: "resources/vtab", to: "vtab", filter: ["**/*"] },
]
const snapshotResource = {
  from: "resources/graft-e2ee",
  to: "graft-e2ee",
  filter: ["**/*"],
}

for (const [os, platform, arch] of [
  ["mac", "darwin", "arm64"],
  ["mac", "darwin", "x64"],
  ["win", "win32", "x64"],
  ["linux", "linux", "x64"],
  ["linux", "linux", "arm64"],
]) {
  test(`builder keeps runtime files for ${platform}-${arch}`, async () => {
    const config = await getConfig(
      appRoot,
      os === "linux" ? "electron-builder.linux.json" : "electron-builder.json"
    )
    const macroExpander = (pattern) => expandMacro(pattern, arch, {}, { os })
    const packager = {
      config,
      projectDir: appRoot,
      buildResourcesDir: "build",
      debugLogger: { isEnabled: false },
    }
    // AppFileWalker defaults to including all app files for an exclude-only FileSet.
    const mainMatchers = getMainFileMatchers(
      appRoot,
      appRoot,
      macroExpander,
      config[os],
      { info: packager, platform: { nodeName: platform } },
      path.join(appRoot, "dist-app"),
      false
    ).map((matcher) => new AppFileWalker(matcher, packager).filter)
    const appIncludes = (file) =>
      mainMatchers.some((filter) =>
        filter(path.join(appRoot, file), { isDirectory: () => false })
      )
    assert.ok(appIncludes("dist-electron/main.js"))
    assert.ok(appIncludes("dist/assets/index.js"))
    assert.ok(!appIncludes("src/main/main.ts"))
    assert.ok(!appIncludes("dist-app/old/Contents/Resources/app.asar"))
    assert.ok(
      !appIncludes(
        "dist-app/old/Contents/Resources/app.asar.unpacked/node_modules/esbuild/lib/main.js"
      )
    )

    const matcher = getNodeModuleFileMatcher(
      appRoot,
      appRoot,
      macroExpander,
      config[os],
      packager
    ).createFilter()
    const check = (file, expected) =>
      assert.equal(
        matcher(path.join(appRoot, "node_modules", file), {
          isDirectory: () => false,
          moduleFullFilePath: path.join("node_modules", file),
        }),
        expected,
        file
      )
    const target = `${platform}-${arch}`
    const otherArch = arch === "x64" ? "arm64" : "x64"
    const otherPlatform = os === "mac" ? "win32" : "darwin"
    for (const file of [
      "@eidos.space/eidos-file/dist/index.mjs",
      "@eidos.space/eidos-file/LICENSE",
      "typescript/package.json",
      "typescript/lib/typescript.js",
      "typescript/LICENSE.txt",
      "typescript/ThirdPartyNoticeText.txt",
      "esbuild/lib/main.js",
      "esbuild/LICENSE.md",
      `@esbuild/${target}/package.json`,
      `@esbuild/${target}/${os === "win" ? "esbuild.exe" : "bin/esbuild"}`,
      "moment/moment.js",
      "moment/LICENSE",
      "moment-timezone/index.js",
      "moment-timezone/moment-timezone.js",
      "moment-timezone/data/packed/latest.json",
      "moment-timezone/LICENSE",
      "csv-parse/lib/api/index.js",
      "csv-parse/lib/index.js",
      "csv-parse/dist/cjs/index.cjs",
      "csv-parse/dist/esm/sync.js",
      "csv-parse/LICENSE",
      "node-pty/lib/index.js",
      "node-pty/LICENSE",
      "node-pty/deps/winpty/LICENSE",
    ])
      check(file, true)
    for (const file of [
      "@eidos.space/eidos-file/dist/index.mjs.map",
      "typescript/lib/_tsc.js",
      "typescript/lib/_tsserver.js",
      "typescript/lib/_typingsInstaller.js",
      "esbuild/bin/esbuild",
      `@esbuild/${platform}-${otherArch}/package.json`,
      `@esbuild/${otherPlatform}-${arch}/package.json`,
      "moment/min/moment-with-locales.js",
      "moment/locale/ja.js",
      "moment-timezone/data/meta/latest.json",
      "moment-timezone/builds/moment-timezone-with-data.js",
      "csv-parse/dist/umd/sync.js",
      "node-pty/third_party/conpty/version/win10-x64/OpenConsole.exe",
      "node-pty/deps/winpty/README.md",
      "node-pty/src/unix/pty.cc",
      "node-pty/lib/unixTerminal.test.js",
      `node-pty/prebuilds/${platform}-${otherArch}/pty.node`,
      `node-pty/prebuilds/${otherPlatform}-${arch}/pty.node`,
    ])
      check(file, false)
    if (os === "win") {
      for (const file of [
        "pty.node",
        "winpty.dll",
        "winpty-agent.exe",
        "conpty.node",
        "conpty_console_list.node",
        "conpty/conpty.dll",
        "conpty/OpenConsole.exe",
      ])
        check(`node-pty/prebuilds/${target}/${file}`, true)
      check("node-pty/build/Release/conpty/conpty.dll", false)
    } else if (os === "mac") {
      check(`node-pty/prebuilds/${target}/pty.node`, true)
      check(`node-pty/prebuilds/${target}/spawn-helper`, true)
    } else {
      check("node-pty/build/Release/pty.node", true)
    }
  })
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
