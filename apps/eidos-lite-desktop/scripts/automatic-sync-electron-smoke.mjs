import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const repositoryRoot = path.resolve(appRoot, "../..")
const evidence = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-electron-auto-sync-")
)
await fs.mkdir(path.join(evidence, "user-data"))
await fs.mkdir(path.join(evidence, "Space"))
await fs.symlink(
  path.join(appRoot, "node_modules"),
  path.join(evidence, "node_modules"),
  "dir"
)
await fs.writeFile(
  path.join(evidence, "package.json"),
  JSON.stringify({
    name: "eidos-lite-automatic-sync-host-test",
    private: true,
    type: "module",
    main: "main.js",
  })
)
const aliases = {
  "@eidos.space/eidos-file": path.join(
    repositoryRoot,
    "packages/eidos-file/src/index.ts"
  ),
  "@eidos.space/eidos-file/node-sqlite": path.join(
    repositoryRoot,
    "packages/eidos-file/src/node-sqlite.ts"
  ),
  "@eidos.space/eidos-file-ui/runtime-editor-data-source": path.join(
    repositoryRoot,
    "packages/eidos-file-ui/src/runtime-editor-data-source.ts"
  ),
  "@eidos.space/eidos-file-ui/create-table-with-content": path.join(
    repositoryRoot,
    "packages/eidos-file-ui/src/create-table-with-content.ts"
  ),
}
await build({
  entryPoints: {
    main: path.join(
      appRoot,
      "src/main/sync/fixtures/automatic-sync-electron-main.ts"
    ),
    "graft-worker": path.join(appRoot, "src/runtime/graft-worker.ts"),
  },
  outdir: evidence,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: "import { createRequire as automaticHostRequire } from 'node:module'; const require = automaticHostRequire(import.meta.url);",
  },
  alias: aliases,
  external: [
    "electron",
    "@eidos.space/graft",
    "node-pty",
    "esbuild",
    "typescript",
  ],
})
console.info(`Non-UI Electron utilityProcess evidence: ${evidence}`)
const electron = createRequire(import.meta.url)("electron")
const child = spawn(electron, [evidence], {
  cwd: appRoot,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "",
    EIDOS_TEST_ELECTRON_EVIDENCE: evidence,
  },
  stdio: "inherit",
})
const timeout = setTimeout(() => {
  child.kill("SIGKILL")
}, 45_000)
const code = await new Promise((resolve, reject) => {
  child.once("error", reject)
  child.once("exit", (exitCode) => resolve(exitCode))
})
clearTimeout(timeout)
const result = JSON.parse(
  await fs.readFile(path.join(evidence, "result.json"), "utf8")
)
console.info(JSON.stringify(result, null, 2))
assert.equal(code, 0, "Electron host acceptance failed")
assert.equal(result.status, "passed")
