import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { GraftClient } from "../graft/graft-client"
import { SpaceSession } from "./space-session"

const head = "a".repeat(64)

describe("working text diff", () => {
  it("compares the expected checkpoint with the safe working file without materializing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-working-diff-"))
    const space = path.join(root, "space")
    const userData = path.join(root, "user-data")
    await fs.mkdir(space)
    await fs.mkdir(path.join(space, ".graft"))
    await fs.writeFile(path.join(space, "README.md"), "Working contents\n")
    const graft = {
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: vi.fn(() => "0.3.1"),
      open: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      inspectSpace: vi.fn(async () => ({
        available: true,
        backend: "sdk" as const,
        version: "0.3.1",
        expectedVersion: "0.3.1",
        initialized: true,
        clean: false,
        currentHead: head,
      })),
      status: vi.fn(async () => ({
        dirty: true,
        currentHead: head,
        currentBranch: "main",
        ahead: 0,
        behind: 0,
        hasConflicts: false,
      })),
      revisionTextDiff: vi.fn(async () => ({
        path: "README.md",
        before: { state: "absent" as const },
        after: {
          state: "utf8" as const,
          content: "Checkpoint contents\n",
          size: 20,
        },
      })),
    } as unknown as GraftClient
    let session: SpaceSession | null = null
    try {
      session = await SpaceSession.create(space, userData, { graft })
      const closeHandles = vi.spyOn(session.runtimePool, "closeHandles")

      await expect(
        session.getWorkingTextDiff(head, "README.md")
      ).resolves.toEqual({
        path: "README.md",
        before: {
          state: "utf8",
          content: "Checkpoint contents\n",
          size: 20,
        },
        after: {
          state: "utf8",
          content: "Working contents\n",
          size: 17,
        },
      })
      expect(closeHandles).not.toHaveBeenCalled()
      expect(session.gate.current()).toMatchObject({ phase: "ready" })
    } finally {
      await session?.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("reads a renamed working file from its previous checkpoint path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-working-diff-"))
    const space = path.join(root, "space")
    const userData = path.join(root, "user-data")
    await fs.mkdir(space)
    await fs.mkdir(path.join(space, ".graft"))
    await fs.mkdir(path.join(space, "docs"))
    await fs.writeFile(path.join(space, "docs", "new-name.md"), "Same\n")
    const revisionTextDiff = vi.fn(async () => ({
      path: "docs/old-name.md",
      before: { state: "absent" as const },
      after: {
        state: "utf8" as const,
        content: "Same\n",
        size: 5,
      },
    }))
    const graft = {
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: vi.fn(() => "0.3.1"),
      open: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      inspectSpace: vi.fn(async () => ({
        available: true,
        backend: "sdk" as const,
        version: "0.3.1",
        expectedVersion: "0.3.1",
        initialized: true,
        clean: false,
        currentHead: head,
      })),
      status: vi.fn(async () => ({
        dirty: true,
        currentHead: head,
        currentBranch: "main",
        ahead: 0,
        behind: 0,
        hasConflicts: false,
      })),
      revisionTextDiff,
    } as unknown as GraftClient
    let session: SpaceSession | null = null
    try {
      session = await SpaceSession.create(space, userData, { graft })
      await expect(
        session.getWorkingTextDiff(head, "docs/new-name.md", "docs/old-name.md")
      ).resolves.toEqual({
        path: "docs/new-name.md",
        before: { state: "utf8", content: "Same\n", size: 5 },
        after: { state: "utf8", content: "Same\n", size: 5 },
      })
      expect(revisionTextDiff).toHaveBeenCalledWith(
        expect.any(String),
        head,
        null,
        "docs/old-name.md",
        expect.any(Number)
      )
    } finally {
      await session?.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("rejects a stale Changes view before reading checkpoint content", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-working-diff-"))
    const space = path.join(root, "space")
    const userData = path.join(root, "user-data")
    await fs.mkdir(space)
    await fs.mkdir(path.join(space, ".graft"))
    await fs.writeFile(path.join(space, "README.md"), "Working contents\n")
    const revisionTextDiff = vi.fn()
    const graft = {
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: vi.fn(() => "0.3.1"),
      open: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      inspectSpace: vi.fn(async () => ({
        available: true,
        backend: "sdk" as const,
        version: "0.3.1",
        expectedVersion: "0.3.1",
        initialized: true,
        clean: false,
        currentHead: head,
      })),
      status: vi.fn(async () => ({
        dirty: true,
        currentHead: head,
        currentBranch: "main",
        ahead: 0,
        behind: 0,
        hasConflicts: false,
      })),
      revisionTextDiff,
    } as unknown as GraftClient
    let session: SpaceSession | null = null
    try {
      session = await SpaceSession.create(space, userData, { graft })
      await expect(
        session.getWorkingTextDiff("b".repeat(64), "README.md")
      ).rejects.toThrow("Space history changed; refresh Changes and try again")
      expect(revisionTextDiff).not.toHaveBeenCalled()
    } finally {
      await session?.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
