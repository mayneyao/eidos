// Actual native filesystem identities and separate Electron Node processes.
// All state is synthetic and remains inside task-owned temporary directories.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const filename = fileURLToPath(import.meta.url)
const repo = path.resolve(path.dirname(filename), "../../..")
const require = createRequire(
  path.join(repo, "apps/eidos-lite-desktop/package.json")
)
const digest = (value) => createHash("sha256").update(value).digest("hex")
const args = process.argv.slice(2)

async function child() {
  const [bundle, mode, root, profile, catalog, expectedFile, movedRoot] =
    args.slice(1)
  const {
    canonicalizeSpaceRoot,
    assertSpaceRootIdentity,
    spaceFileIdentity,
    PluginStore,
    PluginStorage,
    encodePackage,
  } = require(bundle)
  const stats = await fs.stat(root, { bigint: true })
  // No injected provider, platform override, fallback, or synthetic stat values.
  const native = await spaceFileIdentity(await fs.realpath(root), stats)
  assert.ok(
    native,
    "The actual filesystem must expose a native persistent identity"
  )
  assert.notEqual(
    JSON.parse(native)[1],
    "path",
    "Fallback cannot satisfy this gate"
  )
  const canonical = await canonicalizeSpaceRoot(
    root,
    mode === "seed" ? undefined : profile
  )
  const store = new PluginStore(catalog)
  const storage = new PluginStorage(path.join(catalog, "data", "test.history"))
  const active = () => {}
  if (mode === "seed") {
    const manifest = {
      apiVersion: 1,
      requires: { pluginApi: "3.6.0" },
      id: "test.history",
      name: "History",
      version: "1.0.0",
      storage: { maxBytes: 1024 },
      background: { entry: "./background.js", autoStart: true },
      settings: { mode: { type: "string", title: "Mode", default: "default" } },
      views: [
        {
          id: "page",
          kind: "page",
          title: "History",
          entry: "./page.js",
          capabilities: [],
        },
      ],
    }
    const modules = {
      "./background.js": "onmessage = () => {};",
      "./page.js": "export default function mount() {}",
    }
    const hash = await store.install(
      encodePackage(manifest, modules),
      canonical.id
    )
    await store.approveBackground(manifest.id, canonical.id, hash)
    await store.setPluginSetting(canonical.id, manifest.id, "mode", "kept")
    await store.setPageRoute(canonical.id, "test.history/page", "/saved")
    await store.install(
      encodePackage({ ...manifest, id: "test.disabled" }, modules),
      canonical.id
    )
    await store.enable("test.disabled", false, canonical.id)
    await storage.request(
      "storage.write",
      {
        key: `history/${canonical.id}/run`,
        data: Buffer.from("synthetic-history").toString("base64"),
      },
      1024,
      active
    )
    await fs.writeFile(
      expectedFile,
      JSON.stringify({
        id: canonical.id,
        hash,
        config: await store.config(),
        nativeHash: digest(native),
      })
    )
  }
  const expected = JSON.parse(await fs.readFile(expectedFile, "utf8"))
  const config = await store.config()
  const list = await storage.request(
    "storage.list",
    { prefix: `history/${canonical.id}/` },
    1024,
    active
  )
  assert.deepEqual(
    config,
    expected.config,
    "Identity resolution must not rewrite plugin configuration"
  )
  if (mode === "distinct") {
    assert.notEqual(
      canonical.id,
      expected.id,
      "Copies and replacements must not inherit state"
    )
    assert.notEqual(digest(native), expected.nativeHash)
    assert.equal(
      (await store.binding("test.history", canonical.id)).enabled,
      false
    )
    assert.equal(
      await store.backgroundApproved(
        "test.history",
        canonical.id,
        expected.hash
      ),
      false
    )
    assert.equal(config.spaces[canonical.id], undefined)
    assert.equal(list.length, 0)
  } else {
    assert.equal(canonical.id, expected.id)
    assert.equal(digest(native), expected.nativeHash)
    assert.equal(
      (await store.binding("test.history", canonical.id)).enabled,
      true
    )
    assert.equal(
      (await store.binding("test.disabled", canonical.id)).enabled,
      false
    )
    assert.equal(
      await store.backgroundApproved(
        "test.history",
        canonical.id,
        expected.hash
      ),
      true
    )
    assert.equal(
      (await store.pluginSettings(canonical.id, "test.history")).mode,
      "kept"
    )
    assert.equal(
      await store.pageRoute(canonical.id, "test.history/page"),
      "/saved"
    )
    assert.equal(list.length, 1)
    assert.equal(
      await storage.request(
        "storage.read",
        { key: `history/${canonical.id}/run` },
        1024,
        active
      ),
      Buffer.from("synthetic-history").toString("base64")
    )
  }
  assert.deepEqual(
    await fs.readdir(root),
    ["ordinary.txt"],
    "No marker may be written to the Space"
  )
  assert.equal(
    await fs.readFile(path.join(root, "ordinary.txt"), "utf8"),
    "retained ordinary file\n"
  )
  if (mode === "move") {
    await fs.rename(root, movedRoot)
    await assert.rejects(
      assertSpaceRootIdentity(canonical),
      /moved or was replaced/
    )
  }
  console.log(
    JSON.stringify({
      mode,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      dev: stats.dev.toString(),
      fileId: stats.ino.toString(),
      birthtimeNs: stats.birthtimeNs.toString(),
      nativeFingerprintSha256: digest(native),
      spaceId: canonical.id,
      storedObjects: list.length,
      passed: true,
    })
  )
}

async function main() {
  const option = (name) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  const output = option("evidence")
    ? path.resolve(option("evidence"))
    : await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-native-identity-evidence-")
      )
  await fs.mkdir(output, { recursive: true, mode: 0o700 })
  assert.equal(
    (await fs.readdir(output)).length,
    0,
    "Use a fresh evidence directory"
  )
  const workspace = await fs.mkdtemp(
    path.join(
      path.resolve(option("root") ?? os.tmpdir()),
      "eidos-native-identity-"
    )
  )
  const root = path.join(workspace, "Space")
  const moved = path.join(workspace, "Moved Space")
  const profile = path.join(output, "profile")
  const catalog = path.join(output, "catalog")
  const expected = path.join(output, "expected.json")
  const bundle = path.join(output, "source.cjs")
  await fs.mkdir(root)
  await fs.writeFile(
    path.join(root, "ordinary.txt"),
    "retained ordinary file\n"
  )
  const { build } = require("esbuild")
  await build({
    stdin: {
      contents: [
        "export { canonicalizeSpaceRoot, assertSpaceRootIdentity } from './apps/eidos-lite-desktop/src/main/space/space-paths.ts'",
        "export { spaceFileIdentity } from './apps/eidos-lite-desktop/src/main/space/space-identity.ts'",
        "export { PluginStore } from './apps/eidos-lite-desktop/src/main/plugins/plugin-store.ts'",
        "export { PluginStorage } from './apps/eidos-lite-desktop/src/main/plugins/plugin-storage.ts'",
        "export { encodePackage } from './packages/plugin-runtime/src/package.ts'",
      ].join("\n"),
      resolveDir: repo,
    },
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "cjs",
    // Plugin validation loads its compiler from the checked-out toolchain.
    define: {
      "import.meta.url": JSON.stringify(
        pathToFileURL(path.join(repo, "apps/eidos-lite-desktop/package.json"))
          .href
      ),
    },
  })
  const electron = require("electron")
  const results = []
  const stage = (mode, target, destination = "") => {
    const stdout = execFileSync(
      electron,
      [
        filename,
        "--child",
        bundle,
        mode,
        target,
        profile,
        catalog,
        expected,
        destination,
      ],
      {
        encoding: "utf8",
        timeout: 60000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      }
    )
    results.push(JSON.parse(stdout.trim().split("\n").at(-1)))
  }
  try {
    stage("seed", root)
    stage("adopt", root)
    stage("reopen", root)
    stage("move", root, moved)
    stage("reopen", moved)
    const copy = path.join(workspace, "Copied Space")
    await fs.cp(moved, copy, { recursive: true })
    stage("distinct", copy)
    // Reusing the original path for a new directory must not grant old state.
    await fs.mkdir(root)
    await fs.writeFile(
      path.join(root, "ordinary.txt"),
      "retained ordinary file\n"
    )
    stage("distinct", root)
    assert.equal(
      new Set(results.map((result) => result.pid)).size,
      results.length
    )
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repo,
      encoding: "utf8",
    }).trim()
    const report = {
      sourceCommit,
      sourceBundleSha256: digest(await fs.readFile(bundle)),
      platform: process.platform,
      arch: process.arch,
      actualNativeProvider: true,
      separateProcesses: results.length,
      fullSystemRebootTested: false,
      results,
    }
    await fs.writeFile(
      path.join(output, "result.json"),
      JSON.stringify(report, null, 2) + "\n"
    )
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await fs.rm(workspace, { recursive: true, force: true })
  }
}

if (args[0] === "--child") await child()
else await main()
