#!/usr/bin/env node

const { spawnSync } = require("node:child_process")
const path = require("node:path")

const runtime = process.argv[2]
if (runtime !== "node" && runtime !== "electron") {
  console.error("Usage: use-better-sqlite3-runtime.cjs <node|electron>")
  process.exit(2)
}

const root = path.resolve(__dirname, "..")
const resolveFromRoot = (request) =>
  require.resolve(request, { paths: [root, path.join(root, "apps/desktop")] })
const betterSqlitePackage = resolveFromRoot("better-sqlite3/package.json")
const betterSqliteDirectory = path.dirname(betterSqlitePackage)
const prebuildInstall = resolveFromRoot("prebuild-install/bin.js")
const target =
  runtime === "node"
    ? process.versions.node
    : require(resolveFromRoot("electron/package.json")).version

const result = spawnSync(
  process.execPath,
  [prebuildInstall, "--runtime", runtime, "--target", target, "--force"],
  {
    cwd: betterSqliteDirectory,
    stdio: "inherit",
  }
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
