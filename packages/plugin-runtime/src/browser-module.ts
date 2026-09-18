import { createRequire } from "node:module"
import type * as Esbuild from "esbuild"

const require = createRequire(import.meta.url)
// Electron stores native esbuild binaries outside the asar archive.
const esbuildPath = require
  .resolve("esbuild")
  .replace(/\.asar([\\/])/, ".asar.unpacked$1")
const { transformSync } = require(esbuildPath) as typeof Esbuild

export function browserModule(code: string): string {
  return transformSync(code, {
    loader: "js",
    target: "es2022",
    format: "cjs",
    minify: true,
    legalComments: "inline",
    logLevel: "silent",
  }).code
}
