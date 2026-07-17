// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { FileSpaceAgentRuntimeStateStore } from "./file-space-agent-runtime-state"
import type { FileSpaceAgentMessage, FileSpaceAgentRun } from "./types"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("FileSpaceAgentRuntimeStateStore", () => {
  it("persists and replaces a live assistant snapshot locally", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "eidos-agent-runtime-"))
    roots.push(root)
    const store = new FileSpaceAgentRuntimeStateStore(root)
    const run: FileSpaceAgentRun = {
      id: "run-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      status: "running",
      model: "model@provider",
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
    }
    const message: FileSpaceAgentMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Hel" }],
    }
    store.save({ run, message })
    store.save({
      run: { ...run, status: "waiting-approval" },
      message: {
        ...message,
        parts: [{ type: "text", text: "Hello" }],
      },
    })

    expect(store.getConversation("conversation-1")).toMatchObject({
      run: { status: "waiting-approval" },
      message: { parts: [{ text: "Hello" }] },
    })

    store.deleteRun("run-1")
    expect(store.getConversation("conversation-1")).toBeNull()
    store.close()
  })
})
