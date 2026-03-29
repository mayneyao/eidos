import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/plugins/persistent-id.ts"],
  format: "esm",
  dts: true,
  clean: true,
  // 将 peer dependencies 标记为 external，不打包进输出
  external: [
    "react",
    "react-dom",
    "lexical",
    "@lexical/react",
    "@lexical/utils",
    "@lexical/rich-text",
    "@lexical/list",
    "@lexical/code",
    "@lexical/link",
    "@lexical/hashtag",
    "@lexical/table",
    "@lexical/html",
    "@lexical/headless",
    "@lexical/markdown",
  ],
})
