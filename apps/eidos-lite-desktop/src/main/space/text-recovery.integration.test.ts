import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "./space-session"
import { writeTextDraftCopy } from "./text-draft-copy"

it("recovers a historical note and a deleted note without reverting unrelated work", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lite-recovery-"))
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "lite-recovery-state-"))
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  try {
    await fs.writeFile(path.join(root, "note.md"), "# Old note\n")
    await fs.writeFile(path.join(root, "other.md"), "Old other")
    session = await SpaceSession.create(root, state, {
      graft,
      automaticCheckpointsEnabled: false,
    })
    const initial = await session.enableVersioning()
    const commitId = initial.graft.currentHead!
    await fs.writeFile(path.join(root, "note.md"), "# New note\n")
    await fs.writeFile(path.join(root, "other.md"), "Keep newer work")
    const historical = await session.getVersionTextDiff(
      commitId,
      null,
      "note.md"
    )
    expect(historical.after.state).toBe("utf8")
    if (historical.after.state !== "utf8")
      throw new Error("Missing historical note")
    await writeTextDraftCopy(
      path.join(root, "note-copy.md"),
      historical.after.content
    )
    expect(await fs.readFile(path.join(root, "note-copy.md"), "utf8")).toBe(
      "# Old note\n"
    )
    expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
      "# New note\n"
    )
    await fs.unlink(path.join(root, "note.md"))
    const deleted = await session.getWorkingTextDiff(commitId, "note.md")
    expect(deleted.after.state).toBe("absent")
    if (deleted.before.state !== "utf8") throw new Error("Missing deleted note")
    await writeTextDraftCopy(path.join(root, "note.md"), deleted.before.content)
    expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
      "# Old note\n"
    )
    expect(await fs.readFile(path.join(root, "other.md"), "utf8")).toBe(
      "Keep newer work"
    )
  } finally {
    await session?.close()
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(state, { recursive: true, force: true })
  }
}, 15000)
