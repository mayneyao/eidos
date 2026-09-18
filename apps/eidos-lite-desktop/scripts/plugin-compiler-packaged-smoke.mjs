// Run through scripts/run-electron-node.mjs; no application window is opened.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

if (!process.argv[2]) throw new Error("Pass the packaged app.asar path")
const archive = path.resolve(process.argv[2])
const require = createRequire(path.join(archive, "package.json"))
const unpacked = (name) =>
  require.resolve(name).replace(/\.asar([\\/])/, ".asar.unpacked$1")
const ts = require(unpacked("typescript"))
const esbuild = require(unpacked("esbuild"))
const sdk = path.join(archive, "dist-electron/contracts.ts")
assert.ok(fs.existsSync(sdk), "Packaged SDK types are missing")
assert.ok(
  fs.existsSync(ts.getDefaultLibFilePath({})),
  "TypeScript standard library is missing"
)
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "eidos-plugin-compiler-smoke-")
)
try {
  const entry = path.join(root, "view.ts")
  fs.writeFileSync(
    entry,
    `import type { Mount } from '@eidos.space/plugin-sdk';
const mount: Mount = async (ctx, root) => { if (ctx.binding.kind === 'document') root.textContent = (await ctx.binding.document.read()).text; };
export default mount;`
  )
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    baseUrl: root,
    paths: { "@eidos.space/plugin-sdk": [sdk] },
  }
  const check = () =>
    ts
      .getPreEmitDiagnostics(ts.createProgram([entry], options))
      .filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
      )
  const errors = check()
  assert.deepEqual(
    errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
    []
  )
  fs.appendFileSync(entry, "\nconst invalid: string = 42;")
  assert.ok(
    check().some((d) => d.code === 2322),
    "Type checking must reject invalid source"
  )
  await esbuild.transform("const value: number = 1", { loader: "ts" })
  console.log(
    "PASS: packaged SDK, TypeScript libraries, type diagnostics and native esbuild"
  )
} finally {
  esbuild.stop()
  fs.rmSync(root, { recursive: true, force: true })
}
