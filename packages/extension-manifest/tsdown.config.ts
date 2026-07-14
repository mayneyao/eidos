import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts"],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
})
