import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/markdown.ts", "src/names.ts"],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
})
