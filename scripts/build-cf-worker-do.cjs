const esbuild = require("esbuild")

esbuild
  .build({
    entryPoints: ["apps/publish/lib/DataSpaceObject.ts"],
    bundle: true,
    outfile: "dist/_DataSpaceObject.js",
    platform: "browser",
    target: "es2020",
    sourcemap: true,
    format: "esm",
    define: {
      BroadcastChannel: `EventEmitter`,
    },
    banner: {
      js: `import { EventEmitter } from 'node:events';`,
    },
  })
  .catch(() => process.exit(1))
