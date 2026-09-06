import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { TextDraftLifecycle } from "../renderer/text-draft-lifecycle"
import { TextDraftCloseCoordinator } from "./text-draft-close"
import { readTextFilePreview, saveTextFile } from "./space/text-file-preview"
import { IPC_CHANNELS } from "../shared/contracts"

describe("draft close handshake with real files", () => {
  it("blocks on external changes, then saves both drafts on retry without overwriting the external revision", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lite-draft-close-"))
    try {
      const drafts = new TextDraftLifecycle()
      for (const name of ["a.md", "b.md"]) {
        await fs.writeFile(path.join(root, name), "original")
        const file = await readTextFilePreview(root, name)
        if (file.type !== "text") throw new Error("Expected text fixture")
        drafts.update(name, {
          content: `edited ${name}`,
          revision: file.revision,
        })
      }
      await fs.writeFile(path.join(root, "b.md"), "external edit")
      const coordinator = new TextDraftCloseCoordinator()
      const errors: unknown[] = []
      const owner = {
        id: 42,
        isDestroyed: () => false,
        send(channel: string, token: unknown) {
          if (channel !== IPC_CHANNELS.textDraftPrepareClose) return
          void drafts
            .prepare({
              choose: async () => "save",
              save: (request) => saveTextFile(root, request),
              saved: () => {},
            })
            .then((allowed) => coordinator.reply(42, token, allowed))
            .catch((error) => {
              errors.push(error)
              coordinator.reply(42, token, false)
            })
        },
      }
      expect(await coordinator.prepare(owner)).toBe(false)
      expect(errors).toHaveLength(1)
      expect(await fs.readFile(path.join(root, "a.md"), "utf8")).toBe(
        "edited a.md"
      )
      expect(await fs.readFile(path.join(root, "b.md"), "utf8")).toBe(
        "external edit"
      )
      const current = await readTextFilePreview(root, "b.md")
      if (current.type !== "text") throw new Error("Expected text fixture")
      drafts.update("b.md", {
        content: "reviewed edit",
        revision: current.revision,
      })
      expect(await coordinator.prepare(owner)).toBe(true)
      expect(await fs.readFile(path.join(root, "b.md"), "utf8")).toBe(
        "reviewed edit"
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
