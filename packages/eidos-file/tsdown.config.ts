import { defineConfig } from "tsdown"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/better-sqlite3.ts",
    "src/node-sqlite.ts",
    "src/browser.ts",
    "src/csv.ts",
  ],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ["@sqlite.org/sqlite-wasm", "better-sqlite3", "node:sqlite"],
  },
})
