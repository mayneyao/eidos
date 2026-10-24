import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

test("checks CRLF Web bundles without accepting stale contents", async () => {
  const source = fileURLToPath(new URL("../../../", import.meta.url))
  const repository = await mkdtemp(path.join(os.tmpdir(), "sandbox-web-"))
  try {
    const sandbox = path.join(repository, "packages/plugin-sandbox")
    const generated = path.join(repository, "crates/eidos-plugin-sandbox/src")
    await mkdir(path.join(sandbox, "scripts"), { recursive: true })
    await mkdir(generated, { recursive: true })
    await copyFile(
      path.join(source, "packages/plugin-sandbox/scripts/build-web.mjs"),
      path.join(sandbox, "scripts/build-web.mjs")
    )
    await copyFile(
      path.join(source, "packages/plugin-sandbox/package.json"),
      path.join(sandbox, "package.json")
    )
    await symlink(
      path.join(source, "packages/plugin-sandbox/node_modules"),
      path.join(sandbox, "node_modules"),
      "junction"
    )
    for (const name of [
      "generated-streams.js",
      "generated-url.js",
      "generated-web-NOTICE.txt",
    ]) {
      const contents = await readFile(
        path.join(source, "crates/eidos-plugin-sandbox/src", name),
        "utf8"
      )
      await writeFile(
        path.join(generated, name),
        contents.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")
      )
    }
    const script = path.join(sandbox, "scripts/build-web.mjs")
    execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })
    await writeFile(
      path.join(generated, "generated-streams.js"),
      "stale bundle\r\n"
    )
    assert.throws(
      () =>
        execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" }),
      /Stale generated-streams\.js/
    )
  } finally {
    await rm(repository, { recursive: true, force: true })
  }
})
