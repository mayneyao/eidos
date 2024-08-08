const esbuild = require("esbuild")

esbuild
  .build({
    entryPoints: ["apps/publish/_worker.ts"],
    bundle: true,
    outfile: "dist/_worker.js",
    platform: "browser", // 指定平台为浏览器
    target: "es2020",
    sourcemap: true,
    format: "esm", // 添加这一行
    define: {
      BroadcastChannel: `EventEmitter`,
    },
    banner: {
      js: `import { EventEmitter } from 'node:events';`, // 在头部注入代码
    },
  })
  .catch(() => process.exit(1))
