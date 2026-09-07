import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "./space-session"
import { readTextFilePreview } from "./text-file-preview"

it("returns an empty bounded page and keeps its cursor pinned while HEAD advances", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lite-history-pages-"))
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  try {
    await fs.writeFile(path.join(root, "rare.md"), "Rare file")
    await graft.open(root)
    await graft.initialize(root)
    await graft.stageAll(root)
    await graft.commit(root, "Initial")
    const original = (await graft.status(root)).currentHead!
    for (let index = 0; index < 101; index++) {
      await fs.writeFile(path.join(root, "busy.txt"), String(index))
      await graft.stageAll(root)
      await graft.commit(root, `Other file ${index}`)
    }
    const first = await graft.pathHistory(root, "rare.md")
    expect(first.commits).toEqual([])
    expect(first.has_more).toBe(true)
    expect(first.telemetry.commits_scanned).toBe(100)
    expect(first.telemetry.object_bytes_read).toBeLessThanOrEqual(
      8 * 1024 * 1024
    )
    await fs.writeFile(path.join(root, "rare.md"), "New after opening history")
    await graft.stageAll(root)
    await graft.commit(root, "Advance HEAD")
    const next = await graft.pathHistory(root, "rare.md", first.next_cursor!)
    expect(next.start).toBe(first.start)
    expect(next.commits.map((entry) => entry.id)).toEqual([original])
    expect(next.has_more).toBe(false)
    await expect(
      graft.pathHistory(root, "busy.txt", first.next_cursor!)
    ).rejects.toThrow()
  } finally {
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
  }
}, 30000)

it("lists exact-path history and restores text with disk/draft copies without changing HEAD or unrelated work", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lite-file-history-"))
  const state = await fs.mkdtemp(
    path.join(os.tmpdir(), "lite-file-history-state-")
  )
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  try {
    await fs.writeFile(path.join(root, "note.md"), "# Original\n")
    await fs.writeFile(path.join(root, "other.md"), "Original other")
    session = await SpaceSession.create(root, state, {
      graft,
      automaticCheckpointsEnabled: false,
    })
    const initial = await session.enableVersioning()
    const revision = initial.graft.currentHead!
    await fs.writeFile(path.join(root, "note.md"), "# Current\n")
    const changed = await session.createCheckpoint("Change note")
    const head = changed.graft.currentHead!
    await fs.writeFile(path.join(root, "other.md"), "Keep unrelated dirty work")
    const history = await session.getFileHistory("note.md")
    expect(history.commits.map((entry) => entry.id)).toEqual([head, revision])
    expect(history.telemetry.blob_objects_read).toBe(0)
    expect(history.has_more).toBe(false)
    const preview = await readTextFilePreview(root, "note.md")
    if (preview.type !== "text") throw new Error("Expected text")
    const recovered = await session.restoreTextVersion({
      path: "note.md",
      revision,
      expectedRevision: preview.revision,
      draft: "Unsaved draft",
    })
    expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
      "# Original\n"
    )
    expect(
      await Promise.all(
        recovered.backupPaths.map((name) =>
          fs.readFile(path.join(root, name), "utf8")
        )
      )
    ).toEqual(["# Current\n", "Unsaved draft"])
    expect(await fs.readFile(path.join(root, "other.md"), "utf8")).toBe(
      "Keep unrelated dirty work"
    )
    expect((await graft.status(root)).currentHead).toBe(head)
    // Reusing the reviewed revision must not overwrite a later external edit.
    await fs.writeFile(path.join(root, "note.md"), "External edit")
    await expect(
      session.restoreTextVersion({
        path: "note.md",
        revision,
        expectedRevision: preview.revision,
      })
    ).rejects.toThrow("changed on disk")
    expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
      "External edit"
    )
    await fs.unlink(path.join(root, "note.md"))
    const deleted = await session.createCheckpoint("Delete note")
    const deletion = (await session.getFileHistory("note.md")).commits[0]!
    expect(deletion.change).toBe("deleted")
    expect(deletion.id).toBe(deleted.graft.currentHead)
    await expect(
      session.restoreTextVersion({
        path: "note.md",
        revision: deletion.id,
        expectedRevision: null,
      })
    ).rejects.toThrow("no recoverable text")
    await session.restoreTextVersion({
      path: "note.md",
      revision,
      expectedRevision: null,
    })
    expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
      "# Original\n"
    )
    await expect(
      session.restoreTextVersion({
        path: "note.md",
        revision,
        expectedRevision: null,
      })
    ).rejects.toThrow("changed on disk")
  } finally {
    await session?.close()
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(state, { recursive: true, force: true })
  }
}, 30000)
