import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import net from "node:net"
import { setTimeout as delay } from "node:timers/promises"
import { create, pack } from "./eidos-plugin.mjs"

const binary = process.env.EIDOS_PLUGIN_CLI

test(
  "Serve discovers an installed plugin under an explicit EIDOS_HOME",
  {
    skip: !binary && "Set EIDOS_PLUGIN_CLI to the built Eidos binary",
    timeout: 30000,
  },
  async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-plugin-serve-"))
    let child
    try {
      const env = { ...process.env, EIDOS_HOME: path.join(root, "home") }
      const project = path.join(root, "plugin")
      await create(project, "table-view")
      const archive = await pack(project)
      const file = path.join(root, "test.eidos")
      for (const args of [
        ["plugin", "install", archive],
        [
          "file",
          "new",
          file,
          "--table",
          "Tasks",
          "--fields",
          '[{"name":"Title","type":"text"}]',
        ],
      ]) {
        const result = spawnSync(binary, args, { env, encoding: "utf8" })
        assert.equal(result.status, 0, result.stdout + result.stderr)
      }
      const listener = net.createServer()
      await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve))
      const port = listener.address().port
      await new Promise((resolve) => listener.close(resolve))
      child = spawn(binary, ["serve", file, "--port", String(port)], {
        env,
        stdio: "ignore",
      })
      let listing
      for (let i = 0; i < 100; i++) {
        assert.equal(child.exitCode, null, "Serve exited before becoming ready")
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/plugins`)
          if (response.ok) {
            listing = await response.json()
            break
          }
        } catch {}
        await delay(100)
      }
      assert.ok(listing?.plugins.some((plugin) => plugin.id === "local.plugin"))
    } finally {
      if (child && child.exitCode === null) {
        const exited = new Promise((resolve) => child.once("exit", resolve))
        child.kill()
        await exited
      }
      await fs.rm(root, { recursive: true, force: true })
    }
  }
)

test(
  "CLI 2.0 directs authoring to plugin-tools without creating files",
  { skip: !binary && "Set EIDOS_PLUGIN_CLI to the built Eidos binary" },
  async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "eidos cli "))
    const project = path.join(parent, "new project")
    try {
      for (const command of ["create", "check", "dev", "pack"]) {
        const result = spawnSync(
          binary,
          ["--json", "plugin", command, project],
          {
            encoding: "utf8",
          }
        )
        assert.equal(result.status, 1, result.stdout + result.stderr)
        const error = JSON.parse(result.stderr).error
        assert.equal(error.code, "invalid-request")
        assert.match(error.message, /npx @eidos.space\/plugin-tools/)
        assert.deepEqual(await fs.readdir(parent), [])
      }
    } finally {
      await fs.rm(parent, { recursive: true, force: true })
    }
  }
)

test(
  "CLI doctor checks packages produced by plugin-tools without installing them",
  {
    skip: !binary && "Set EIDOS_PLUGIN_CLI to the built Eidos binary",
    timeout: 60000,
  },
  async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos plugin contract ")
    )
    const eidosHome = path.join(parent, "home")
    try {
      for (const [template, compatible] of [
        ["table-view", true],
        ["document-view", false],
      ]) {
        const project = path.join(parent, template)
        await create(project, template)
        const archive = await pack(project)
        const result = spawnSync(
          binary,
          ["--json", "plugin", "doctor", archive],
          {
            encoding: "utf8",
            env: { ...process.env, EIDOS_HOME: eidosHome },
          }
        )
        assert.equal(result.status, 0, result.stdout + result.stderr)
        const report = JSON.parse(result.stdout)
        assert.equal(report.command, "plugin doctor")
        assert.equal(report.compatibility.compatible, compatible)
      }
      assert.equal(
        await fs.stat(path.join(eidosHome, "plugins")).catch(() => null),
        null
      )
    } finally {
      await fs.rm(parent, { recursive: true, force: true })
    }
  }
)
