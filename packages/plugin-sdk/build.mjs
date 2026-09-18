import fs from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
for (const name of [
  "protocol.js",
  "protocol.d.ts",
  "package.js",
  "package.d.ts",
])
  await fs.rm(`dist/${name}`, { force: true })
execFileSync(
  process.execPath,
  [
    createRequire(import.meta.url).resolve("typescript/bin/tsc"),
    "-p",
    "tsconfig.json",
  ],
  { stdio: "inherit" }
)
