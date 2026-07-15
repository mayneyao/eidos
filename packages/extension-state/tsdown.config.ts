import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/better-sqlite3.ts"],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ["better-sqlite3"],
  },
})
