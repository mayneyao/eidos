import { build } from "esbuild"
import fs from "node:fs/promises"

await fs.mkdir("dist", { recursive: true })
await build({
  entryPoints: ["../plugin-runtime/src/compiler.ts"],
  outfile: "dist/compiler.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["esbuild", "typescript", "yaml", "postcss"],
})
await fs.copyFile("../plugin-sdk/src/index.ts", "dist/contracts.ts")
