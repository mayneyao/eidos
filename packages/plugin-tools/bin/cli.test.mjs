import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { create, pack } from "./eidos-plugin.mjs"
import { decodePackage } from "../dist/compiler.js"
import { transform } from "esbuild"

test("create, typecheck and pack an offline CSV editor against the real SDK", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-plugin-cli-"))
  const directory = path.join(parent, "csv-editor")
  try {
    await create(directory)
    await fs.writeFile(
      path.join(directory, "src/icon.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>'
    )
    await fs.appendFile(
      path.join(directory, "src/style.css"),
      '\nheader { background-image: url("./icon.svg"); }\n'
    )
    await assert.rejects(create(directory))
    // The distributed compiler carries its SDK contract, even before the
    // generated project's dependencies have been installed.
    const output = await pack(directory)
    const pkg = decodePackage(await fs.readFile(output))
    assert.equal(pkg.manifest.id, "local.csv-editor")
    assert.ok(pkg.modules["./src/main.ts"].includes("CSV Table"))
    assert.ok(!pkg.modules["./src/main.ts"].includes('src="http'))
    assert.ok(
      !pkg.modules["./src/main.ts"].includes('from "@eidos.space/plugin-sdk"')
    )
    const executable = path.join(parent, "linked-cli.mjs")
    await fs.symlink(
      fileURLToPath(new URL("./eidos-plugin.mjs", import.meta.url)),
      executable
    )
    await fs.unlink(output)
    const invoked = spawnSync(
      process.execPath,
      [executable, "pack", directory],
      { encoding: "utf8" }
    )
    assert.equal(invoked.status, 0, invoked.stderr)
    assert.ok(
      invoked.stdout.includes(".eidos-plugin"),
      "CLI must actually execute when installed behind symlinks"
    )
    assert.equal(
      decodePackage(await fs.readFile(output)).manifest.id,
      "local.csv-editor"
    )
  } finally {
    await fs.rm(parent, { recursive: true, force: true })
  }
})
test("CSV example handles multiline fields, escaped quotes, empty fields and invalid input", async () => {
  const source = await fs.readFile(
    new URL("../templates/csv.ts.txt", import.meta.url),
    "utf8"
  )
  const js = await transform(source, { loader: "ts", format: "esm" })
  const { parseCsv, stringifyCsv } = await import(
    `data:text/javascript;base64,${Buffer.from(js.code).toString("base64")}`
  )
  const text = 'a,"b,c","d""e","x\r\ny",\r\n'
  const rows = parseCsv(text)
  assert.deepEqual(rows, [["a", "b,c", 'd"e', "x\r\ny", ""]])
  assert.equal(stringifyCsv(rows, "\r\n", true), text)
  assert.deepEqual(parseCsv(""), [])
  assert.deepEqual(parseCsv('""'), [[""]])
  assert.throws(() => parseCsv('"unfinished'))
  assert.throws(() => parseCsv('"quoted"oops'))
})
