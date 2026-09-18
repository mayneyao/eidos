import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { Scope } from "@eidos.space/plugin-runtime/lifecycle"
import type { TextResourceDeclaration } from "@eidos.space/plugin-runtime/resource-grants"
import { PluginGrantStore } from "./plugin-grants"

const declaration: TextResourceDeclaration = {
  kind: "directory",
  title: "Journals",
  include: ["**/*.md"],
  access: ["list", "read", "create", "write"],
}
let directory: string
let file: string
let grants: PluginGrantStore
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-plugin-grants-"))
  file = path.join(directory, "grants.json")
  grants = new PluginGrantStore(file)
})
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})
const acquire = (
  store = grants,
  space = "space-a",
  plugin = "example.journals"
) => store.acquire(space, plugin, "journal", declaration, new Scope())

it("restores grants offline but does not inherit them across Spaces or plugins", async () => {
  await grants.bind(
    "space-a",
    "example.journals",
    "journal",
    "journals",
    declaration
  )
  const restored = new PluginGrantStore(file)
  expect((await acquire(restored)).authorize("read", "today.md")).toBe(
    "journals/today.md"
  )
  await expect(acquire(restored, "space-b")).rejects.toThrow(/not bound/)
  await expect(acquire(restored, "space-a", "example.other")).rejects.toThrow(
    /not bound/
  )
  if (process.platform !== "win32")
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
})

it("persists revocation generations and invalidates live handles on rebind", async () => {
  await grants.bind(
    "space-a",
    "example.journals",
    "journal",
    "journals",
    declaration
  )
  const original = await acquire()
  await grants.bind(
    "space-a",
    "example.journals",
    "journal",
    "archive",
    declaration
  )
  expect(original.signal.aborted).toBe(true)
  expect((await acquire()).authorize("read", "today.md")).toBe(
    "archive/today.md"
  )
  await grants.revoke("space-a", "example.journals", "journal")
  const restored = new PluginGrantStore(file)
  await expect(acquire(restored)).rejects.toThrow(/not bound/)
  await restored.bind(
    "space-a",
    "example.journals",
    "journal",
    "journals",
    declaration
  )
  const state = JSON.parse(await fs.readFile(file, "utf8"))
  expect(state.authorities[0].resources[0].generation).toBe(4)
  expect(original.signal.aborted).toBe(true)
})

it("serializes concurrent grants without dropping either plugin's state", async () => {
  await Promise.all([
    grants.bind(
      "space-a",
      "example.journals",
      "journal",
      "journals",
      declaration
    ),
    grants.bind("space-a", "example.other", "journal", "notes", declaration),
    grants.bind("space-b", "example.journals", "journal", "work", declaration),
  ])
  const restored = new PluginGrantStore(file)
  expect((await acquire(restored)).authorize("read", "a.md")).toBe(
    "journals/a.md"
  )
  expect(
    (await acquire(restored, "space-a", "example.other")).authorize(
      "read",
      "a.md"
    )
  ).toBe("notes/a.md")
  expect((await acquire(restored, "space-b")).authorize("read", "a.md")).toBe(
    "work/a.md"
  )
})

it("leaves current grants intact when persistence fails and permits a later retry", async () => {
  await grants.bind(
    "space-a",
    "example.journals",
    "journal",
    "journals",
    declaration
  )
  const lease = await acquire()
  const saved = await fs.readFile(file)
  await fs.unlink(file)
  await fs.mkdir(file)
  await expect(
    grants.revoke("space-a", "example.journals", "journal")
  ).rejects.toThrow()
  expect(lease.signal.aborted).toBe(false)
  expect(lease.authorize("read", "a.md")).toBe("journals/a.md")
  await fs.rmdir(file)
  await fs.writeFile(file, saved)
  await grants.revoke("space-a", "example.journals", "journal")
  expect(lease.signal.aborted).toBe(true)
  expect(await fs.readdir(directory)).toEqual(["grants.json"])
})

it("fails closed on corrupted persisted authority instead of creating default grants", async () => {
  await fs.writeFile(
    file,
    JSON.stringify({
      version: 1,
      authorities: [
        {
          spaceId: "space-a",
          pluginId: "example.journals",
          resources: [
            {
              id: "journal",
              generation: 1,
              binding: { target: "../outside", ceiling: declaration },
            },
          ],
        },
      ],
    })
  )
  await expect(acquire()).rejects.toThrow(/relative/)
  await expect(
    grants.bind(
      "space-a",
      "example.journals",
      "journal",
      "journals",
      declaration
    )
  ).rejects.toThrow(/relative/)
})

it("checks the invocation lifetime after asynchronous grant loading", async () => {
  await grants.bind(
    "space-a",
    "example.journals",
    "journal",
    "journals",
    declaration
  )
  const scope = new Scope()
  const pending = new PluginGrantStore(file).acquire(
    "space-a",
    "example.journals",
    "journal",
    declaration,
    scope
  )
  scope.dispose()
  await expect(pending).rejects.toThrow(/lifetime/)
})
