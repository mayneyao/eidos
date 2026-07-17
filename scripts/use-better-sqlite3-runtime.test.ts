// @vitest-environment node

import { createRequire } from "node:module"
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

type RuntimeHelpers = {
  probeNodeRuntime: (options: {
    cwd: string
    env?: Record<string, string>
    modulePath: string
    nodeExecutable: string
  }) => boolean
  refreshDarwinNativeBinaryIdentity: (binaryPath: string) => void
}

const require = createRequire(import.meta.url)
const { probeNodeRuntime, refreshDarwinNativeBinaryIdentity } =
  require("./use-better-sqlite3-runtime.cjs") as RuntimeHelpers

const temporaryDirectories: string[] = []

const createTemporaryDirectory = () => {
  const directory = mkdtempSync(join(tmpdir(), "eidos-sqlite-runtime-"))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("better-sqlite3 runtime helpers", () => {
  it("probes a compatible database module in a child process", () => {
    const directory = createTemporaryDirectory()
    const modulePath = join(directory, "database.cjs")
    writeFileSync(modulePath, "module.exports = class Database { close() {} }")

    expect(
      probeNodeRuntime({
        cwd: directory,
        modulePath,
        nodeExecutable: process.execPath,
      })
    ).toBe(true)
  })

  it("passes runtime-specific environment variables to the child probe", () => {
    const directory = createTemporaryDirectory()
    const modulePath = join(directory, "environment-database.cjs")
    writeFileSync(
      modulePath,
      'if (process.env.EIDOS_TEST_RUNTIME !== "electron") throw new Error("wrong runtime"); module.exports = class Database { close() {} }'
    )

    expect(
      probeNodeRuntime({
        cwd: directory,
        env: { EIDOS_TEST_RUNTIME: "electron" },
        modulePath,
        nodeExecutable: process.execPath,
      })
    ).toBe(true)
  })

  it.skipIf(process.platform === "win32")(
    "keeps the parent alive when a native probe is killed",
    () => {
      const directory = createTemporaryDirectory()
      const modulePath = join(directory, "killed-database.cjs")
      writeFileSync(
        modulePath,
        'module.exports = class Database { constructor() { process.kill(process.pid, "SIGKILL") } }'
      )

      expect(
        probeNodeRuntime({
          cwd: directory,
          modulePath,
          nodeExecutable: process.execPath,
        })
      ).toBe(false)
    }
  )

  it.skipIf(process.platform === "win32")(
    "replaces a native binary with an equivalent fresh inode",
    () => {
      const directory = createTemporaryDirectory()
      const binaryPath = join(directory, "better_sqlite3.node")
      writeFileSync(binaryPath, "native-binary")
      const originalInode = statSync(binaryPath).ino

      refreshDarwinNativeBinaryIdentity(binaryPath)

      expect(readFileSync(binaryPath, "utf8")).toBe("native-binary")
      expect(statSync(binaryPath).ino).not.toBe(originalInode)
    }
  )
})
