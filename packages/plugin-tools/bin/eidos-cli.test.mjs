import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { decodePackage } from "../dist/compiler.js"
import { create, templateCatalog } from "./eidos-plugin.mjs"
const binary = process.env.EIDOS_PLUGIN_CLI

test(
  "Rust CLI checks single source files and packages the new contract",
  {
    skip: !binary && "Set EIDOS_PLUGIN_CLI to the built Eidos binary",
    timeout: 60000,
  },
  async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "eidos cli "))
    const project = path.join(parent, "csv-editor")
    const backend = fileURLToPath(
      new URL("./eidos-plugin.mjs", import.meta.url)
    )
    const run = (...args) =>
      spawnSync(binary, args, {
        encoding: "utf8",
        env: { ...process.env, EIDOS_PLUGIN_TOOLS: backend },
      })
    try {
      const created = run("--json", "plugin", "create", project)
      assert.equal(created.status, 0, created.stderr)
      assert.equal(
        JSON.parse(created.stdout).directory,
        await fs.realpath(project)
      )
      assert.notEqual(run("plugin", "create", project).status, 0)
      for (const template of Object.keys(templateCatalog)) {
        const rustProject = path.join(parent, "rust", template)
        const nodeProject = path.join(parent, "node", template)
        await fs.mkdir(path.dirname(rustProject), { recursive: true })
        await fs.mkdir(path.dirname(nodeProject), { recursive: true })
        const result = run(
          "--json",
          "plugin",
          "create",
          rustProject,
          "--template",
          template
        )
        assert.equal(result.status, 0, result.stdout + result.stderr)
        await create(nodeProject, template)
        for (const file of ["plugin.json", "package.json", "tsconfig.json"]) {
          assert.deepEqual(
            JSON.parse(await fs.readFile(path.join(rustProject, file))),
            JSON.parse(await fs.readFile(path.join(nodeProject, file)))
          )
        }
        for (const file of [
          ...Object.keys(templateCatalog[template].files),
          "README.md",
          ".gitignore",
        ]) {
          assert.equal(
            await fs.readFile(path.join(rustProject, file), "utf8"),
            await fs.readFile(path.join(nodeProject, file), "utf8")
          )
        }
        const target = run(
          "--json",
          "plugin",
          "check",
          rustProject,
          "--target",
          template === "table-view" ? "cli" : "lite"
        )
        assert.equal(target.status, 0, target.stdout + target.stderr)
      }
      const action = path.join(parent, "rust", "table-action")
      assert.notEqual(
        run("--json", "plugin", "check", action, "--target", "cli").status,
        0
      )
      for (const command of ["check", "pack"]) {
        const result = run("--json", "plugin", command, project)
        assert.equal(result.status, 0, result.stderr)
        assert.equal(JSON.parse(result.stdout).command, `plugin ${command}`)
      }
      const output = path.join(parent, "custom output.eidos-plugin")
      const packed = run(
        "--json",
        "plugin",
        "pack",
        project,
        "--out",
        path.relative(process.cwd(), output)
      )
      assert.equal(packed.status, 0, packed.stderr)
      assert.equal(
        decodePackage(await fs.readFile(output)).manifest.id,
        "local.csv-editor"
      )
      assert.notEqual(
        run("plugin", "check", project, "--out", output).status,
        0
      )
      const single = path.join(parent, "single.ts")
      await fs.writeFile(
        single,
        `export const manifest = {apiVersion:1,id:'local.action',name:'Action',version:'1.0.0',actions:[{id:'run',title:'Run',context:'workspace'}]}; import type {ExtensionContext} from '@eidos.space/plugin-sdk'; export default function activate(ctx:ExtensionContext){ctx.actions.register('run',async()=>{})}`
      )
      const checked = run("--json", "plugin", "check", single)
      assert.equal(checked.status, 0, checked.stderr)
      await fs.appendFile(single, "\nconst broken: string = 123;\n")
      assert.notEqual(run("--json", "plugin", "check", single).status, 0)
    } finally {
      await fs.rm(parent, { recursive: true, force: true })
    }
  }
)
