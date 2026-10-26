import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { create, pack, templateCatalog } from "./eidos-plugin.mjs"
import { decodePackage } from "../dist/compiler.js"
import { createHash } from "node:crypto"
import { templateDependencies } from "./toolchain.mjs"

test("checkout starters carry portable candidates instead of published old tools", async () => {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "plugin-checkout-deps-")
  )
  try {
    const directory = path.join(parent, "localized")
    await create(directory, "localized-page")
    const pkg = JSON.parse(
      await fs.readFile(path.join(directory, "package.json"), "utf8")
    )
    const ownPackage = JSON.parse(
      await fs.readFile(new URL("../package.json", import.meta.url), "utf8")
    )
    for (const [name, dependency] of Object.entries(pkg.devDependencies)) {
      assert.match(dependency, /^file:\.\/\.eidos-toolchain\/[^/]+\.tgz$/)
      assert.ok(
        (await fs.stat(path.join(directory, dependency.slice(5)))).size > 0
      )
      assert.equal((await templateDependencies())[name], ownPackage.version)
    }
  } finally {
    await fs.rm(parent, { recursive: true, force: true })
  }
})

test(
  "a relocated localized starter installs, checks and packs with its own tools",
  {
    skip:
      !process.env.EIDOS_PLUGIN_INSTALL_SMOKE &&
      "Set EIDOS_PLUGIN_INSTALL_SMOKE=1 for the npm installation smoke",
  },
  async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "plugin-install-smoke-")
    )
    try {
      const original = path.join(parent, "localized")
      const directory = path.join(parent, "relocated")
      await create(original, "localized-page")
      await fs.rename(original, directory)
      for (const args of [
        ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
        ["run", "check", "--", "--target", "lite", "--json"],
        ["run", "pack:plugin", "--", "--json"],
      ]) {
        const result = spawnSync("npm", args, {
          cwd: directory,
          encoding: "utf8",
          timeout: 120_000,
        })
        assert.equal(
          result.status,
          0,
          `${args.join(" ")}\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`
        )
      }
      const archive = decodePackage(
        await fs.readFile(
          path.join(directory, "dist/local.localized-0.1.0.eidos-plugin")
        )
      )
      assert.equal(archive.format, 3)
      assert.equal(archive.manifest.requires.pluginApi, "3.7.0")
    } finally {
      await fs.rm(parent, { recursive: true, force: true })
    }
  }
)

const executable = fileURLToPath(new URL("./eidos-plugin.mjs", import.meta.url))
const run = (...args) =>
  spawnSync(process.execPath, [executable, ...args], { encoding: "utf8" })

test("localized registry metadata shares package labels without copying UI-only messages", async () => {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "plugin-localized-registry-")
  )
  try {
    const directory = path.join(parent, "localized")
    await create(directory, "localized-page")
    const archive = await pack(directory)
    const result = run(
      "registry",
      archive,
      "--repo",
      "example/localized",
      "--category",
      "productivity",
      "--description",
      "Localized page",
      "--compatibility",
      "Plugin API 3.7",
      "--json"
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const { entry } = JSON.parse(result.stdout)
    assert.equal(entry.name, "Localized Page")
    assert.equal(entry.localization.name, "%plugin.name%")
    assert.equal(
      entry.localization.messages["zh-CN"]["plugin.name"],
      "多语言页面"
    )
    assert.equal(Object.hasOwn(entry.localization.messages.en, "search"), false)
  } finally {
    await fs.rm(parent, { recursive: true, force: true })
  }
})

test("every template compiles and packages; the action example passes behavioral tests", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-templates-"))
  try {
    for (const template of Object.keys(templateCatalog)) {
      const directory = path.join(parent, template)
      await create(directory, template)
      const pkg = decodePackage(await fs.readFile(await pack(directory)))
      assert.equal(pkg.manifest.id, `local.${template}`)
      if (template === "table-action") {
        const result = spawnSync(
          process.execPath,
          ["--experimental-strip-types", "--test", "tests/action.test.mjs"],
          { cwd: directory, encoding: "utf8" }
        )
        assert.equal(result.status, 0, result.stdout + result.stderr)
      }
    }
    const absent = path.join(parent, "invalid")
    await assert.rejects(create(absent, "unknown"), /Unknown template/)
    assert.equal(await fs.stat(absent).catch(() => null), null)
  } finally {
    await fs.rm(parent, { recursive: true, force: true })
  }
})

test("unknown and misplaced arguments fail without creating a project", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-arguments-"))
  try {
    const directory = path.join(parent, "example")
    for (const args of [
      ["create", directory, "--templte", "page"],
      ["create", directory, "--target", "lite"],
      ["create", directory, "extra"],
      ["create", directory, "--template", "unknown"],
      ["check", directory, "--target", "unknown"],
    ])
      assert.notEqual(run(...args).status, 0, args.join(" "))
    assert.equal(await fs.stat(directory).catch(() => null), null)
  } finally {
    await fs.rm(parent, { recursive: true, force: true })
  }
})

test("target checking fails for unsupported hosts and release metadata hashes the exact archive", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-release-"))
  try {
    const directory = path.join(parent, "action")
    await create(directory, "table-action")
    const lite = run("check", directory, "--target", "lite", "--json")
    assert.equal(lite.status, 0, lite.stdout + lite.stderr)
    const cli = run("check", directory, "--target", "cli", "--json")
    assert.notEqual(cli.status, 0)
    assert.equal(JSON.parse(cli.stdout).error.code, "HOST_INCOMPATIBLE")
    assert.match(run("check", directory).stdout, /cli: .*does not support/)
    const packed = run("pack", directory, "--json")
    assert.equal(packed.status, 0, packed.stdout + packed.stderr)
    const { output, checksum } = JSON.parse(packed.stdout)
    const digest = createHash("sha256")
      .update(await fs.readFile(output))
      .digest("hex")
    assert.equal(
      await fs.readFile(checksum, "utf8"),
      `${digest}  ${path.basename(output)}\n`
    )
    const registry = run(
      "registry",
      output,
      "--repo",
      "example/action",
      "--category",
      "automation",
      "--description",
      "Complete tasks",
      "--compatibility",
      "Lite 0.17+",
      "--json"
    )
    assert.equal(registry.status, 0, registry.stdout + registry.stderr)
    const { entry } = JSON.parse(registry.stdout)
    assert.equal(entry.sha256, digest)
    assert.equal(entry.asset, path.basename(output))
    assert.equal(entry.id, "local.action")
  } finally {
    await fs.rm(parent, { recursive: true, force: true })
  }
})
