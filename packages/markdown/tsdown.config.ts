import { defineConfig } from "tsdown"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/plugin-api.ts",
    "src/builtin-plugins.ts",
    "src/presets.ts",
  ],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: [
      "micromark-util-types",
      "react",
      "react-dom",
      "react/jsx-runtime",
      "lexical",
      "@lexical/code-core",
      "@lexical/link",
      "@lexical/list",
      "@lexical/markdown",
      "@lexical/react",
      "@lexical/rich-text",
      "@lexical/selection",
      "@lexical/utils",
    ],
  },
})
