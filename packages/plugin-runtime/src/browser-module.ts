import { loadEsbuild } from "./toolchain"

export function browserModule(code: string): string {
  const { transformSync } = loadEsbuild()
  return transformSync(code, {
    loader: "js",
    target: "es2022",
    format: "cjs",
    minify: true,
    legalComments: "inline",
    logLevel: "silent",
  }).code
}
