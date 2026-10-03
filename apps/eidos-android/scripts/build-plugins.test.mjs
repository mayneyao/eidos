import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { validateAndroidManifest } from "./build-plugins.mjs"
import { mountSnapshot, boundFileSystem } from "../plugins/host.js"

const fixture = JSON.parse(
  await readFile(
    new URL("../plugins/text/plugin.json", import.meta.url),
    "utf8"
  )
)
test("canonical validation and Android capabilities fail closed", () => {
  assert.equal(validateAndroidManifest(fixture).id, fixture.id)
  for (const change of [
    { requires: { pluginApi: "3.1.0" } },
    { workspace: { files: { read: true } } },
    { browser: { networkOrigins: ["https://*.example.com"] } },
    { unexpected: true },
    { views: [{ ...fixture.views[0], access: "write" }] },
    { views: [{ ...fixture.views[0], capabilities: ["eidos/table"] }] },
    { views: [{ ...fixture.views[0], entry: "../escape.js" }] },
    { views: [fixture.views[0], fixture.views[0]] },
    { placements: [{ ...fixture.placements[0], extensions: [".eidos"] }] },
    { placements: [{ ...fixture.placements[0], view: "missing" }] },
  ])
    assert.throws(() => validateAndroidManifest({ ...fixture, ...change }))
})

test("GPX profile permits scoped binary reads and declared workers/network", () => {
  const manifest = validateAndroidManifest({
    ...fixture,
    views: [{ ...fixture.views[0], capabilities: [] }],
    browser: {
      workers: true,
      networkOrigins: ["https://tiles.openfreemap.org"],
    },
  })
  assert.equal(manifest.browser.workers, true)
})

test("binary reads bind to one native endpoint, refresh and revoke", async () => {
  const controller = new AbortController()
  let reads = 0
  const fs = boundFileSystem(
    { name: "ride.gpx", path: "tracks/ride.gpx" },
    "https://plugin.invalid/session/file",
    controller.signal,
    async (url, options) => {
      assert.equal(url, "https://plugin.invalid/session/file")
      assert.equal(options.credentials, "omit")
      assert.equal(options.redirect, "error")
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([++reads]).buffer,
      }
    }
  )
  assert.deepEqual(await fs.readBinary("ride.gpx"), new Uint8Array([1]))
  assert.deepEqual(await fs.readBinary("./ride.gpx"), new Uint8Array([2]))
  for (const path of [
    "../ride.gpx",
    "/ride.gpx",
    "tracks/ride.gpx",
    "other.gpx",
    "https://example.com",
  ]) {
    await assert.rejects(fs.readBinary(path), { code: "PERMISSION_DENIED" })
  }
  await assert.rejects(fs.writeBinary("ride.gpx", new Uint8Array()), {
    code: "PERMISSION_DENIED",
  })
  assert.equal(reads, 2)
  controller.abort()
  await assert.rejects(fs.readBinary("ride.gpx"), { code: "DISPOSED" })
})

test("snapshot has no ambient services, rejects writes, disposes mount subscriptions", async () => {
  let leave
  globalThis.window = {
    addEventListener(event, callback) {
      assert.equal(event, "pagehide")
      leave = callback
    },
  }
  const root = {}
  const snapshot = {
    text: "hello",
    version: "v1",
    encoding: "utf-8",
    bom: false,
    dirty: false,
    conflicted: false,
  }
  let context
  let disposed = 0
  await mountSnapshot(
    async (ctx) => {
      context = ctx
      ctx.subscriptions.add({
        dispose() {
          disposed++
        },
      })
      return {
        dispose() {
          disposed++
        },
      }
    },
    root,
    { id: "current", path: "a.txt", name: "a.txt" },
    snapshot
  )
  assert.deepEqual(Object.keys(context.capabilities).sort(), ["document", "ui"])
  assert.deepEqual(await context.capabilities.document.read(), snapshot)
  const read = await context.capabilities.document.read()
  read.text = "changed"
  assert.equal((await context.capabilities.document.read()).text, "hello")
  for (const method of ["edit", "save", "undo", "redo"]) {
    await assert.rejects(context.capabilities.document[method](), {
      code: "PERMISSION_DENIED",
    })
  }
  leave()
  assert.equal(context.signal.aborted, true)
  assert.equal(disposed, 2)
  await assert.rejects(context.capabilities.document.read(), {
    code: "DISPOSED",
  })
  context.subscriptions.add({
    dispose() {
      disposed++
    },
  })
  assert.equal(disposed, 3)
  delete globalThis.window
})
