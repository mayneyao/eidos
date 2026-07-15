import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/compiler.ts", "src/surface.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ["oxc-transform", "rollup"],
  },
})
