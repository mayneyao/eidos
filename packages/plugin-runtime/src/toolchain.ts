import { createRequire } from "node:module"
import type * as Esbuild from "esbuild"
import type * as TypeScript from "typescript"

const require = createRequire(import.meta.url)

function unpacked(packagePath: string): string {
  return packagePath.replace(/\.asar([\\/])/, ".asar.unpacked$1")
}

let esbuild: typeof Esbuild | undefined
let typescript: typeof TypeScript | undefined

export function loadEsbuild(): typeof Esbuild {
  return (esbuild ??= require(unpacked(require.resolve("esbuild"))))
}

export function loadTypeScript(): typeof TypeScript {
  return (typescript ??= require(unpacked(require.resolve("typescript"))))
}
