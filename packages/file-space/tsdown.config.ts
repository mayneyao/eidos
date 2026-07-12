import { defineConfig } from "tsdown"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/better-sqlite3.ts",
    "src/markdown.ts",
    "src/names.ts",
  ],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
})
