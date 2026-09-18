import { build } from "esbuild"
import fs from "node:fs/promises"
await build({
  entryPoints: [
    "src/compiler.ts",
    "src/sandbox.ts",
    "src/extension-sandbox.ts",
    "src/working-copy.ts",
    "src/lifecycle.ts",
  ],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
})
await fs.copyFile("../plugin-sdk/src/index.ts", "dist/contracts.ts")
