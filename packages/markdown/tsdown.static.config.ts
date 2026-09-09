import { defineConfig } from "tsdown"

// Build after the editor, without clearing its output. A separate entry graph
// keeps both runtime chunks and declarations free of React/Lexical/DOM types.
export default defineConfig({
  entry: ["src/static.ts"],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: false,
  deps: { neverBundle: ["micromark-util-types"] },
})
