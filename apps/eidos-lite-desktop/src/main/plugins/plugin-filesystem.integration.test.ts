import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PluginFilesystem } from "./plugin-filesystem"
import { encodeText } from "../space/text-file-preview"
import { ResourceGrants } from "@eidos.space/plugin-runtime/resource-grants"
import { Scope } from "@eidos.space/plugin-runtime/lifecycle"

// Run explicitly against this checkout's freshly built CLI, never a PATH binary.
const executable = process.env.EIDOS_PLUGIN_FS_TEST_BINARY
describe.skipIf(!executable)("native plugin filesystem transport", () => {
  let root: string
  let identity: { dev: string; ino: string }
  let controller: AbortController
  let filesystem: PluginFilesystem
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-native-grants-"))
    const stats = await fs.stat(root, { bigint: true })
    identity = { dev: String(stats.dev), ino: String(stats.ino) }
    controller = new AbortController()
    filesystem = await PluginFilesystem.open({
      executable: executable!,
      root,
      identity,
      denied: ["plugins"],
      signal: controller.signal,
    })
  })
  afterEach(async () => {
    controller?.abort()
    if (root) await fs.rm(root, { recursive: true, force: true })
  })

  it("edits a real Markdown file, rejects stale saves, and creates only when absent", async () => {
    const initial = await filesystem.create("today.md", "# Today\n")
    expect(await filesystem.read("today.md")).toEqual(initial)
    await expect(
      filesystem.create("today.md", "overwrite")
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" })
    const saved = await filesystem.write("today.md", "# Tomorrow\n", initial)
    expect(await filesystem.read("today.md")).toEqual(saved)
    await expect(
      filesystem.write("today.md", "stale", initial)
    ).rejects.toMatchObject({ code: "STALE_REVISION" })
    expect(await fs.readFile(path.join(root, "today.md"), "utf8")).toBe(
      "# Tomorrow\n"
    )
    expect(await fs.readdir(root)).toEqual(["today.md"])
  })

  it("preserves UTF-8/UTF-16 encoding and BOM through the native boundary", async () => {
    for (const encoding of ["utf-8", "utf-16le", "utf-16be"] as const) {
      const name = `${encoding}.md`
      await fs.writeFile(
        path.join(root, name),
        encodeText("初始内容", encoding, true)
      )
      const initial = await filesystem.read(name)
      expect(initial).toMatchObject({ text: "初始内容", encoding, bom: true })
      await filesystem.write(name, "更新内容 🌱", initial)
      expect(await fs.readFile(path.join(root, name))).toEqual(
        encodeText("更新内容 🌱", encoding, true)
      )
    }
  })

  it("rejects binary text and protected roots, and bounds writes", async () => {
    await fs.mkdir(path.join(root, "plugins"))
    await fs.writeFile(path.join(root, "plugins/main.ts"), "code")
    await fs.writeFile(
      path.join(root, "binary.md"),
      Buffer.from([0, 0xff, 0, 0x80])
    )
    await expect(filesystem.read("binary.md")).rejects.toMatchObject({
      code: "DOCUMENT_UNAVAILABLE",
    })
    await expect(filesystem.read("plugins/main.ts")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    })
    await expect(filesystem.create("file.eidos", "text")).rejects.toMatchObject(
      { code: "PERMISSION_DENIED" }
    )
    await expect(
      filesystem.create("large.md", "x".repeat(2 * 1024 * 1024 + 1))
    ).rejects.toMatchObject({ code: "TOO_LARGE" })
    await expect(
      filesystem.create("invalid.md", "\ud800")
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" })
    expect(await filesystem.list(".")).toEqual(["binary.md"])
  })

  it("checks root identity before any data operation", async () => {
    await expect(
      PluginFilesystem.open({
        executable: executable!,
        root,
        identity: { ...identity, ino: "0" },
        denied: [],
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: "IO_ERROR" })
  })

  it("closes native I/O when the host revokes its resource grant", async () => {
    const grants = new ResourceGrants("space", "example.journals")
    const declaration = {
      kind: "directory" as const,
      title: "Journals",
      include: ["**/*.md"],
      access: ["read" as const],
    }
    grants.bind("journal", ".", declaration)
    const lease = grants.acquire("journal", declaration, new Scope())
    const bound = await PluginFilesystem.open({
      executable: executable!,
      root,
      identity,
      denied: [],
      signal: lease.signal,
    })
    try {
      await filesystem.create("today.md", "journal")
      expect((await bound.read(lease.authorize("read", "today.md"))).text).toBe(
        "journal"
      )
      grants.revoke("journal")
      await expect(bound.read("today.md")).rejects.toMatchObject({
        code: "INSTANCE_CLOSED",
      })
    } finally {
      bound.dispose()
      lease.dispose()
    }
  })

  it("expires the native process and queued requests with its resource lifetime", async () => {
    await filesystem.create("today.md", "hello")
    const pending = filesystem.read("today.md")
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: "INSTANCE_CLOSED" })
    await expect(filesystem.read("today.md")).rejects.toMatchObject({
      code: "INSTANCE_CLOSED",
    })
  })

  it.runIf(process.platform !== "win32")(
    "does not traverse a symlink installed after startup",
    async () => {
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-outside-"))
      try {
        await fs.writeFile(path.join(outside, "secret.md"), "secret")
        await fs.symlink(outside, path.join(root, "escape"))
        await expect(filesystem.read("escape/secret.md")).rejects.toThrow()
        await expect(
          filesystem.create("escape/new.md", "changed")
        ).rejects.toThrow()
        expect(await fs.readFile(path.join(outside, "secret.md"), "utf8")).toBe(
          "secret"
        )
        expect(await fs.readdir(outside)).toEqual(["secret.md"])
      } finally {
        await fs.rm(outside, { recursive: true, force: true })
      }
    }
  )
})
