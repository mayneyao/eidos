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
    formatVersion: 2,
    id,
    spaceId: "space-1",
    title: "Inspect the current Space",
    model: "test-model@test-provider",
    createdAt: now,
    updatedAt: now,
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true }))
  )
})

describe("FileSpaceAgentSessionStore", () => {
  it("does not import legacy runtime sidecar sessions", async () => {
    const { root } = await createStore()
    await writeFile(
      path.join(root, "legacy-session.meta.json"),
      JSON.stringify({
        id: "legacy-session",
        goal: "Summarize this Space",
        model: "legacy-model@provider",
        space: "space-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:01:00.000Z",
      })
    )
    await writeFile(path.join(root, "legacy-session.jsonl"), "legacy\n")

    const store = new FileSpaceAgentSessionStore(root)
    expect(await store.listConversations()).toEqual([])
    await expect(
      readFile(path.join(root, "legacy-session.jsonl"), "utf8")
    ).resolves.toBe("legacy\n")
  })

  it("persists a sequential semantic event journal without rewriting metadata", async () => {
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
    expect(events[1]).not.toHaveProperty("checksum")
    expect(await store.loadConversation("conversation-1")).toMatchObject({
      updatedAt: "2026-07-17T00:00:00.000Z",
    })
  })

  it("strips machine-local authority and registry IDs from portable metadata", async () => {
    const { root, store } = await createStore()
    await store.createConversation({
      ...conversation(),
      approvalMode: "full-access",
    })

    const metadata = JSON.parse(
      await readFile(path.join(root, "conversation-1", "meta.json"), "utf8")
    ) as Record<string, unknown>
    expect(metadata).not.toHaveProperty("spaceId")
    expect(metadata).not.toHaveProperty("approvalMode")
    expect(await store.loadConversation("conversation-1")).toMatchObject({
      formatVersion: 2,
      id: "conversation-1",
    })
  })

  it("serializes concurrent semantic appends without losing sequence numbers", async () => {
    const { store } = await createStore()
    await store.createConversation(conversation())
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.append("conversation-1", {
          type: "message.snapshot",
          data: {
            message: {
              id: `assistant-${index}`,
              role: "assistant",
              parts: [{ type: "text", text: String(index) }],
            },
          },
        })
      )
    )

    const events = await store.readEvents("conversation-1")
    expect(events.map((event) => event.sequence)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1)
    )
  })

  it("rejects token and reasoning deltas as transient runtime data", async () => {
    const { store } = await createStore()
    await store.createConversation(conversation())

    await expect(
      store.append("conversation-1", {
        type: "assistant.delta",
        data: {
          messageId: "assistant-1",
          runId: "run-1",
          text: "not durable",
        },
      } as never)
    ).rejects.toThrow("transient runtime data")
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

  it("deletes only the native conversation directory", async () => {
    const { root, store } = await createStore()
    await store.createConversation(conversation("native-delete"))
    await writeFile(path.join(root, "native-delete.meta.json"), "legacy")

    await store.deleteConversation("native-delete")

    expect(await store.listConversations()).toEqual([])
    await expect(
      readFile(path.join(root, "native-delete.meta.json"), "utf8")
    ).resolves.toBe("legacy")
  })
})
