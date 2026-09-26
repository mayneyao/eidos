import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { create, pack } from "./eidos-plugin.mjs"

const binary = process.env.EIDOS_PLUGIN_CLI

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
