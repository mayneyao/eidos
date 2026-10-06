import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { recordGeneratedAssets } from "./generated-assets.mjs"

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/eidos-file"
)
const require = createRequire(path.join(packageRoot, "package.json"))
const { build } = require("esbuild")
await build({
  absWorkingDir: packageRoot,
  entryPoints: ["src/quickjs-entry.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  alias: { vitest: "./src/quickjs/expect-shim.ts" },
  outfile: "generated/quickjs/eidos-runtime.js",
  minify: true,
})
await recordGeneratedAssets("quickjs")
