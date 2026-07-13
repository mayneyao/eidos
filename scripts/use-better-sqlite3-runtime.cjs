#!/usr/bin/env node

const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const probeNodeRuntime = ({ cwd, modulePath, nodeExecutable }) => {
  const source = `
    const Database = require(${JSON.stringify(modulePath)})
    const database = new Database(":memory:")
    database.close()
  `
  const result = spawnSync(nodeExecutable, ["-e", source], {
    cwd,
    stdio: "ignore",
  })

  return result.status === 0
}

const refreshDarwinNativeBinaryIdentity = (binaryPath) => {
  const temporaryPath = `${binaryPath}.eidos-${process.pid}-${Date.now()}`

  try {
    fs.copyFileSync(binaryPath, temporaryPath)
    fs.renameSync(temporaryPath, binaryPath)
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
}

const main = () => {
  const runtime = process.argv[2]
  if (runtime !== "node" && runtime !== "electron") {
    console.error("Usage: use-better-sqlite3-runtime.cjs <node|electron>")
    return 2
  }

  const root = path.resolve(__dirname, "..")
  const resolveFromRoot = (request) =>
    require.resolve(request, { paths: [root, path.join(root, "apps/desktop")] })
  const betterSqliteModule = resolveFromRoot("better-sqlite3")
  const betterSqlitePackage = resolveFromRoot("better-sqlite3/package.json")
  const betterSqliteDirectory = path.dirname(betterSqlitePackage)
  const nativeBinary = path.join(
    betterSqliteDirectory,
    "build/Release/better_sqlite3.node"
  )
  const prebuildInstall = resolveFromRoot("prebuild-install/bin.js")
  const target =
    runtime === "node"
      ? process.versions.node
      : require(resolveFromRoot("electron/package.json")).version

  if (
    runtime === "node" &&
    probeNodeRuntime({
      cwd: root,
      modulePath: betterSqliteModule,
      nodeExecutable: process.execPath,
    })
  ) {
    return 0
  }

  const result = spawnSync(
    process.execPath,
    [prebuildInstall, "--runtime", runtime, "--target", target, "--force"],
    {
      cwd: betterSqliteDirectory,
      stdio: "inherit",
    }
  )

  if (result.error) throw result.error
  if (result.status !== 0) return result.status ?? 1

  // prebuild-install overwrites the existing inode. macOS can keep the inode
  // associated with the previous binary's provenance and terminate the next
  // process that loads it. Replacing it atomically gives the new binary a fresh
  // identity while preserving its bytes and mode.
  if (process.platform === "darwin") {
    refreshDarwinNativeBinaryIdentity(nativeBinary)
  }

  if (
    runtime === "node" &&
    !probeNodeRuntime({
      cwd: root,
      modulePath: betterSqliteModule,
      nodeExecutable: process.execPath,
    })
  ) {
    console.error("better-sqlite3 could not be loaded by the Node.js runtime")
    return 1
  }

  return 0
}

module.exports = {
  probeNodeRuntime,
  refreshDarwinNativeBinaryIdentity,
}

if (require.main === module) {
  process.exit(main())
}
