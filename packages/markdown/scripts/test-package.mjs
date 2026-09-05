import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = fileURLToPath(new URL("../", import.meta.url))
const manifest = JSON.parse(
  readFileSync(path.join(packageRoot, "package.json"), "utf8")
)
const packageRequire = createRequire(path.join(packageRoot, "package.json"))
const playgroundRequire = createRequire(
  path.resolve(
    packageRoot,
    "../../apps/markdown-editor-playground/package.json"
  )
)
// Pin the already validated toolchain, not fresh resolutions of broad dev ranges.
// These are version strings only: the consumer still installs from its tarball
// and registry/cache, with no workspace aliases or linked node_modules.
const version = (name, resolve = packageRequire) =>
  resolve(`${name}/package.json`).version
const consumer = mkdtempSync(path.join(tmpdir(), "markdown-package-consumer-"))
console.log(`Isolated consumer (retained for inspection): ${consumer}`)

function run(args, cwd = consumer) {
  const result = spawnSync("pnpm", args, { cwd, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(["pack", "--pack-destination", consumer], packageRoot)
const tarball = `eidos.space-markdown-${manifest.version}.tgz`
cpSync(path.join(packageRoot, "tests/consumer"), consumer, { recursive: true })
writeFileSync(
  path.join(consumer, "package.json"),
  JSON.stringify(
    {
      name: "markdown-isolated-consumer",
      private: true,
      type: "module",
      scripts: {
        typecheck: "tsc",
        build: "vite build",
        smoke: "node smoke.mjs",
      },
      dependencies: {
        "@eidos.space/markdown": `file:./${tarball}`,
        lexical: manifest.dependencies.lexical,
        "@lexical/code-core": manifest.dependencies["@lexical/code-core"],
        react: version("react"),
        "react-dom": version("react-dom"),
      },
      devDependencies: {
        typescript: version("typescript"),
        "@types/react": version("@types/react"),
        "@types/react-dom": version("@types/react-dom"),
        vite: version("vite", playgroundRequire),
      },
    },
    null,
    2
  )
)
// No workspace, source aliases, inherited tsconfig, or lifecycle scripts.
run([
  "install",
  "--ignore-scripts",
  ...(process.argv.includes("--offline") ? ["--offline"] : []),
])
run(["run", "typecheck"])
run(["run", "smoke"])
run(["run", "build"])
