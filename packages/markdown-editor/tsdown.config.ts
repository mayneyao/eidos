import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: [
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
