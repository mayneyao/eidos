import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { compilePlugin } from "./compiler"
import { decodePackage } from "./package"

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true }))
  )
})
async function fixture(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-plugin-source-"))
  temporary.push(root)
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, contents)
  }
  return fs.realpath(root)
}
const declaration = `export const manifest = { apiVersion: 1, id: 'local.trim', name: 'Trim', version: '1.0.0', actions: [{ id: 'trim', title: 'Trim', context: 'document', access: 'write' }] } satisfies PluginManifest`
const source = `import type { ExtensionContext, PluginManifest } from '@eidos.space/plugin-sdk'
${declaration}
export default function activate(ctx: ExtensionContext) {
  ctx.capabilities.actions.register('trim', async ({capabilities}) => {
    if (!capabilities.document) return
    const state = await capabilities.document.read()
    await capabilities.document.edit({text: state.text.trim(), expectedVersion: state.version})
  })
}`
describe("trusted source compiler", () => {
  it("checks filemeta as a standalone View and Action capability", async () => {
    const root = await fixture({
      "trim.ts": `${source.replace(
        "version: '1.0.0',",
        "version: '1.0.0', requires: { pluginApi: '3.1.0' }, workspace: { filemeta: { namespaces: ['space.eidos.meta'], write: true } },"
      )}
import type { ViewContext, ActionContext, FileMetaValues, FileMetaPatch } from '@eidos.space/plugin-sdk'
async function check(ctx: ViewContext | ActionContext) {
  const filemeta = ctx.capabilities.filemeta
  if (!filemeta) return
  const metadata: FileMetaValues = await filemeta.read('notes.md', 'space.eidos.meta')
  const patch: FileMetaPatch = { set: { status: 'review', nullable: null }, remove: ['old'] }
  const updated: FileMetaValues = await filemeta.patch('notes.md', 'space.eidos.meta', patch)
  // @ts-expect-error Namespace metadata uses the standalone filemeta capability.
  ctx.capabilities.fs?.readProperties('notes.md', 'space.eidos.meta')
}
`,
    })
    const compiled = await compilePlugin(path.join(root, "trim.ts"))
    expect(compiled.program.manifest.workspace?.filemeta).toEqual({
      namespaces: ["space.eidos.meta"],
      write: true,
    })
  })
  it("checks the public SDK names and rejects removed aliases", async () => {
    const root = await fixture({
      "trim.ts": `${source}
import type { EidosTable, EidosConfig, ActionContext, TableActionContext, FileMetadata, EidosTableSnapshot, EidosConfigSnapshot, PluginSettings } from '@eidos.space/plugin-sdk'
function check(table: EidosTable, config: EidosConfig, action: ActionContext, run: TableActionContext) {
  const context: Promise<EidosTableSnapshot> = table.readContext()
  const snapshot: Promise<EidosConfigSnapshot> = config.read(table.tableId)
  table.readRows({offset: 0, limit: 10})
  table.setViewConfig({compact: true})
  table.watch(() => {})
  config.watch(table.tableId, () => {})
  action.capabilities.settings.set('key', true)
  action.capabilities.storage?.delete('key')
  action.capabilities.connections?.isConfigured('service')
  const declared: Promise<void> = run.capabilities.task.declareOutputs([])
  // @ts-expect-error Removed table alias.
  table.read()
  // @ts-expect-error Removed table alias.
  table.getPage({offset: 0, limit: 10})
  // @ts-expect-error Invalidation subscriptions use watch.
  config.observe(table.tableId, () => {})
  // @ts-expect-error Ordinary actions have no Eidos capabilities.
  action.capabilities.eidos
  // @ts-expect-error Settings have no observation service.
  action.capabilities.settings.observe(() => {})
  // @ts-expect-error Settings assignments use set.
  action.capabilities.settings.update('key', true)
  // @ts-expect-error Storage removal uses delete.
  action.capabilities.storage?.remove('key')
  // @ts-expect-error Output declarations have no preview alias.
  run.capabilities.task.preview([])
  // @ts-expect-error Resource grants are not part of a plugin manifest.
  const resources: PluginManifest['resources'] = {}
}
`,
    })
    await expect(
      compilePlugin(path.join(root, "trim.ts"))
    ).resolves.toBeDefined()
  })
  it("resolves a locked package with nested module metadata and inline CSS images", async () => {
    const root = await fixture({
      "trim.ts": `import { trim } from 'local-parser'; import './style.css';\n${source.replace("state.text.trim()", "trim(state.text)")}`,
      "style.css":
        '.icon { background: url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E") }',
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "node_modules/local-parser": { version: "1.0.0" } },
      }),
      "node_modules/local-parser/package.json": JSON.stringify({
        name: "local-parser",
        version: "1.0.0",
        main: "dist/index.js",
        types: "dist/index.d.ts",
      }),
      "node_modules/local-parser/dist/package.json": JSON.stringify({
        name: "local-parser",
        type: "commonjs",
      }),
      "node_modules/local-parser/dist/index.js":
        "exports.trim = value => value.trim()",
      "node_modules/local-parser/dist/index.d.ts":
        "export function trim(value: string): string",
    })
    await expect(
      compilePlugin(path.join(root, "trim.ts"))
    ).resolves.toBeDefined()
  })
  it("bundles locked CommonJS dependencies but rejects dynamic require", async () => {
    const root = await fixture({
      "trim.ts": `import { trim } from 'local-parser';\n${source.replace("state.text.trim()", "trim(state.text)")}`,
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "node_modules/local-parser": { version: "1.0.0" } },
      }),
      "node_modules/local-parser/package.json": JSON.stringify({
        name: "local-parser",
        version: "1.0.0",
        main: "index.js",
        types: "index.d.ts",
      }),
      "node_modules/local-parser/index.js":
        "module.exports = require('./trim.js')",
      "node_modules/local-parser/trim.js":
        "exports.trim = value => value.trim()",
      "node_modules/local-parser/index.d.ts":
        "export function trim(value: string): string",
    })
    await expect(
      compilePlugin(path.join(root, "trim.ts"))
    ).resolves.toBeDefined()
    await fs.writeFile(
      path.join(root, "node_modules/local-parser/index.js"),
      "const target = './trim.js'; module.exports = require(target)"
    )
    await expect(compilePlugin(path.join(root, "trim.ts"))).rejects.toThrow(
      "Dynamic host code execution"
    )
  })
  it("checks and packages a single TS action without project installation", async () => {
    const root = await fixture({ "trim.ts": source })
    const compiled = await compilePlugin(path.join(root, "trim.ts"))
    expect(compiled.program.manifest.extension).toBe("./trim.ts")
    expect(decodePackage(compiled.bytes).modules["./trim.ts"]).toContain(
      "activate"
    )
    expect(compiled.dependencies).toContain(path.join(root, "trim.ts"))
    expect((await compilePlugin(path.join(root, "trim.ts"))).revision).toBe(
      compiled.revision
    )
  })
  it("never evaluates module top-level code", async () => {
    const root = await fixture({
      "trim.ts": `${source}\nthrow new Error('MUST NOT RUN');`,
    })
    await expect(
      compilePlugin(path.join(root, "trim.ts"))
    ).resolves.toBeDefined()
  })
  it("rejects executable metadata without running it", async () => {
    const root = await fixture({
      "trim.ts": source.replace(
        "name: 'Trim'",
        "name: (() => { throw new Error('MUST NOT RUN') })()"
      ),
    })
    await expect(compilePlugin(path.join(root, "trim.ts"))).rejects.toThrow(
      "static JSON"
    )
  })
  it("reports full type errors, not just transformation success", async () => {
    const root = await fixture({
      "trim.ts": source.replace("state.text.trim()", "123"),
    })
    await expect(
      compilePlugin(path.join(root, "trim.ts"))
    ).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "TS2322", file: "trim.ts" }),
      ]),
    })
  })
  it("rejects simultaneous descriptors", async () => {
    const root = await fixture({ "trim.ts": source, "plugin.json": "{}" })
    await expect(compilePlugin(path.join(root, "trim.ts"))).rejects.toThrow(
      "Both"
    )
  })
  it.each([
    "import 'node:fs'",
    "import 'https://example.com/module.js'",
    "import 'missing-dependency'",
    "import { connect } from '@eidos.space/plugin-sdk'",
  ])("rejects unapproved imports: %s", async (statement) => {
    const root = await fixture({ "trim.ts": `${statement}\n${source}` })
    await expect(compilePlugin(path.join(root, "trim.ts"))).rejects.toThrow()
  })
  it("bundles local modules, CSS and image bytes", async () => {
    const root = await fixture({
      "plugin.json": JSON.stringify({
        apiVersion: 1,
        id: "local.page",
        name: "Page",
        version: "1.0.0",
        views: [
          { id: "page", title: "Page", kind: "page", entry: "./main.ts" },
        ],
      }),
      "main.ts":
        "import './style.css'; import { label } from './label'; export default function mount(_ctx: unknown, root: HTMLElement) { root.textContent = label }",
      "label.ts": "export const label = 'Journal'",
      "style.css": "body { color: red; background: url('./image.png') }",
      "image.png": "imagefixture",
    })
    const result = await compilePlugin(root)
    expect(result.program.modules["./main.ts"]).toContain("data:image/png")
    expect(result.program.modules["./main.ts"]).toContain("Journal")
    expect(result.dependencies).toContain(path.join(root, "image.png"))
  })
  it("validates installed dependency identity against the lockfile", async () => {
    const root = await fixture({
      "trim.ts": `import { trim } from 'local-parser';\n${source.replace("state.text.trim()", "trim(state.text)")}`,
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "node_modules/local-parser": { version: "1.0.0" } },
      }),
      "node_modules/local-parser/package.json": JSON.stringify({
        name: "local-parser",
        version: "1.0.0",
        type: "module",
        main: "index.mjs",
        types: "index.d.ts",
      }),
      "node_modules/local-parser/index.mjs":
        "export const trim = value => value.trim()",
      "node_modules/local-parser/index.d.ts":
        "export function trim(value: string): string",
    })
    await expect(
      compilePlugin(path.join(root, "trim.ts"))
    ).resolves.toBeDefined()
    await fs.writeFile(
      path.join(root, "node_modules/local-parser/package.json"),
      JSON.stringify({
        name: "local-parser",
        version: "2.0.0",
        main: "index.mjs",
      })
    )
    await expect(compilePlugin(path.join(root, "trim.ts"))).rejects.toThrow(
      "lockfile"
    )
  })
  it("rejects source symlinks and invalid default entry signatures", async () => {
    const root = await fixture({ "trim.ts": source })
    await fs.symlink(path.join(root, "trim.ts"), path.join(root, "linked.ts"))
    await expect(compilePlugin(path.join(root, "linked.ts"))).rejects.toThrow(
      "symlink"
    )
    await fs.writeFile(
      path.join(root, "trim.ts"),
      source.replace(
        "export default function activate(ctx: ExtensionContext)",
        "export default function activate(ctx: number)"
      )
    )
    await expect(compilePlugin(path.join(root, "trim.ts"))).rejects.toThrow()
  })
})
