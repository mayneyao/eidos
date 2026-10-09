import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "./space-session"
import type { FileHookEvent } from "@eidos.space/plugin-sdk"

async function fixture(
  run: (session: SpaceSession, root: string) => Promise<void>
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-hooks-"))
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-hooks-state-"))
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  const session = await SpaceSession.create(root, state, { graft })
  try {
    await fs.writeFile(path.join(root, "old.md"), "# Old\nBody\n")
    await run(session, root)
  } finally {
    await session.close()
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(state, { recursive: true, force: true })
  }
}

it("returns the renamed document and maintains references without retriggering", async () =>
  fixture(async (session, root) => {
    await fs.writeFile(path.join(root, "index.md"), "[link](old.md) [[old]]")
    const hook = vi.fn(async (_event: FileHookEvent) => ({ name: "New.md" }))
    session.fileHookRunner = hook
    const old = await session.previewTextFile("old.md")
    if (old.type !== "text") throw new Error("No text")
    const saved = await session.saveTextFile({
      relativePath: "old.md",
      content: "# New\nBody\n",
      expectedRevision: old.revision,
    })
    expect(saved.status).toBe("saved")
    if (saved.status !== "saved") return
    expect(saved.file.relativePath).toBe("New.md")
    expect(await fs.readFile(path.join(root, "index.md"), "utf8")).toBe(
      "[link](New.md) [[/New]]"
    )
    expect(hook).toHaveBeenCalledTimes(1)
    expect(hook.mock.calls[0]?.[0]).toMatchObject({
      source: "local",
      type: "document.saved",
      previousText: "# Old\nBody\n",
    })
    await session.saveTextFile(
      {
        relativePath: "New.md",
        content: "# Plugin change",
        expectedRevision: saved.file.revision,
      },
      "plugin"
    )
    expect(hook).toHaveBeenCalledTimes(1)
  }))

it("preserves an ordinary save on hook failure or filename collision", async () =>
  fixture(async (session, root) => {
    await fs.writeFile(path.join(root, "New.md"), "Keep me")
    for (const runner of [
      async () => ({ name: "New.md" }),
      async () => {
        throw new Error("Plugin failed")
      },
    ]) {
      session.fileHookRunner = runner
      const old = await session.previewTextFile("old.md")
      if (old.type !== "text") throw new Error("No text")
      const saved = await session.saveTextFile({
        relativePath: "old.md",
        content: "# New",
        expectedRevision: old.revision,
      })
      expect(saved.status).toBe("saved")
      expect(await fs.readFile(path.join(root, "old.md"), "utf8")).toBe("# New")
      expect(await fs.readFile(path.join(root, "New.md"), "utf8")).toBe(
        "Keep me"
      )
    }
  }))

it("rejects a stale plan and updates H1 after a local rename", async () =>
  fixture(async (session, root) => {
    session.fileHookRunner = async () => {
      await fs.writeFile(path.join(root, "old.md"), "# External")
      return { text: "# Wrong", name: "Wrong.md" }
    }
    const old = await session.previewTextFile("old.md")
    if (old.type !== "text") throw new Error("No text")
    await session.saveTextFile({
      relativePath: "old.md",
      content: "# New",
      expectedRevision: old.revision,
    })
    expect(await fs.readFile(path.join(root, "old.md"), "utf8")).toBe(
      "# External"
    )
    expect(
      await fs.stat(path.join(root, "Wrong.md")).catch(() => null)
    ).toBeNull()
    const hook = vi.fn(async (_event: FileHookEvent) => ({ text: "# Renamed" }))
    session.fileHookRunner = hook
    await session.renamePath("old.md", "Renamed.md")
    expect(await fs.readFile(path.join(root, "Renamed.md"), "utf8")).toBe(
      "# Renamed"
    )
    expect(hook.mock.calls[0]?.[0]).toMatchObject({
      type: "file.renamed",
      previousPath: "old.md",
    })
    expect(hook).toHaveBeenCalledTimes(1)
  }))
