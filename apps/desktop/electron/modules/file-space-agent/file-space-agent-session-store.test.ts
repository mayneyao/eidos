// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { FileSpaceAgentSessionStore } from "./file-space-agent-session-store"
import type { FileSpaceAgentConversation } from "./types"

const roots: string[] = []

async function createStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "eidos-agent-store-"))
  roots.push(root)
  return { root, store: new FileSpaceAgentSessionStore(root) }
}

function conversation(id = "conversation-1"): FileSpaceAgentConversation {
  const now = "2026-07-17T00:00:00.000Z"
  return {
    id,
    spaceId: "space-1",
    title: "Inspect the current Space",
    model: "test-model@test-provider",
    createdAt: now,
    updatedAt: now,
    latestSequence: 0,
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true }))
  )
})

describe("FileSpaceAgentSessionStore", () => {
  it("persists an integrity chained event journal", async () => {
    const { store } = await createStore()
    await store.createConversation(conversation())
    await store.append("conversation-1", {
      type: "message.created",
      data: {
        id: "message-1",
        role: "user",
        text: "What is in this Space?",
        runId: "run-1",
      },
    })

    const events = await store.readEvents("conversation-1")
    expect(events).toHaveLength(2)
    expect(events[0].sequence).toBe(1)
    expect(events[1].sequence).toBe(2)
    expect(events[1].previousChecksum).toBe(events[0].checksum)
    expect(
      (await store.loadConversation("conversation-1"))?.latestSequence
    ).toBe(2)
  })

  it("serializes concurrent appends without losing sequence numbers", async () => {
    const { store } = await createStore()
    await store.createConversation(conversation())
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.append("conversation-1", {
          type: "assistant.delta",
          data: {
            messageId: "assistant-1",
            runId: "run-1",
            text: String(index),
          },
        })
      )
    )

    const events = await store.readEvents("conversation-1")
    expect(events.map((event) => event.sequence)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1)
    )
  })

  it("repairs a partially written final line before the next append", async () => {
    const { root, store } = await createStore()
    await store.createConversation(conversation())
    const journalPath = path.join(root, "conversation-1", "events.jsonl")
    const journal = await readFile(journalPath, "utf8")
    await writeFile(journalPath, `${journal}{\"sequence\":2`, "utf8")

    await store.append("conversation-1", {
      type: "message.created",
      data: {
        id: "message-1",
        role: "user",
        text: "Continue",
        runId: "run-1",
      },
    })

    const events = await store.readEvents("conversation-1")
    expect(events.map((event) => event.sequence)).toEqual([1, 2])
  })

  it("rejects an invalid conversation identifier", async () => {
    const { store } = await createStore()
    await expect(
      store.createConversation(conversation("../escape"))
    ).rejects.toThrow("conversation ID is invalid")
  })
})
