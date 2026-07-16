// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { MockLanguageModelV3, simulateReadableStream } from "ai/test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const modelState = vi.hoisted(() => ({ current: undefined as unknown }))

vi.mock("@/packages/ai/server/model", () => ({
  buildProviderOptions: () => undefined,
  resolveProviderForModel: () => ({
    modelId: "mock-model",
    providerType: "openai",
    provider: () => modelState.current,
  }),
}))
vi.mock("../config/config-manager", () => ({ ConfigManager: class {} }))
vi.mock("../space-management/space-management.service", () => ({
  SpaceManagementService: class {},
}))
vi.mock("../space-management/space-registry", () => ({
  SpaceRegistry: class {},
}))

import { FileSpaceAgentService } from "./file-space-agent.service"
import { FileSpaceAgentSessionStore } from "./file-space-agent-session-store"
import type { FileSpaceAgentEvent } from "./types"

const roots: string[] = []

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

function modelStream(
  parts: LanguageModelV3StreamPart[],
  finish: "stop" | "tool-calls" = "stop"
) {
  return {
    stream: simulateReadableStream<LanguageModelV3StreamPart>({
      chunks: [
        { type: "stream-start", warnings: [] },
        ...parts,
        {
          type: "finish",
          usage,
          finishReason: { unified: finish, raw: undefined },
        },
      ],
    }),
  }
}

function textStream(text: string) {
  return modelStream([
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
  ])
}

function streamSequence(...results: ReturnType<typeof modelStream>[]) {
  let index = 0
  return async () => results[index++] ?? results.at(-1)!
}

async function eventually<T>(operation: () => Promise<T | undefined>) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const result = await operation()
    if (result !== undefined) return result
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out waiting for Agent test state")
}

async function createHarness() {
  const root = await mkdtemp(path.join(os.tmpdir(), "eidos-agent-service-"))
  roots.push(root)
  const registry = {
    getSpace: (spaceId: string) =>
      spaceId === "space-1"
        ? { id: spaceId, mode: "file", path: root }
        : undefined,
  }
  const spaces = {
    searchFiles: vi.fn(async () => [
      { path: "Notes.md", title: "Notes", snippet: "Agent context" },
    ]),
    readFile: vi.fn(async (_spaceId, relativePath) => ({
      path: relativePath,
      content: "# Notes\n\nOriginal text\n",
      contentDigest: `sha256:${"a".repeat(64)}`,
      size: 24,
      mtimeMs: 100,
    })),
    readFilePreview: vi.fn(async (_spaceId, relativePath) => ({
      kind: "text" as const,
      path: relativePath,
      content: "# Notes\n\nPreview text\n",
      size: 300_000,
      mtimeMs: 100,
      previewBytes: 23,
      truncated: true,
    })),
    writeFile: vi.fn(async (_spaceId, relativePath, content) => ({
      path: relativePath,
      content,
      contentDigest: `sha256:${"b".repeat(64)}`,
      size: content.length,
      mtimeMs: 101,
    })),
    getBaseSnapshotReadOnly: vi.fn(),
    getBaseTableRow: vi.fn(),
    getBaseTablePage: vi.fn(),
  }
  const config = {
    get: () => ({
      llmProviders: [
        {
          name: "mock-provider",
          models: "mock-model",
          enabled: true,
        },
      ],
    }),
  }
  return {
    root,
    registry,
    config,
    spaces,
    service: new FileSpaceAgentService(
      registry as any,
      spaces as any,
      config as any
    ),
  }
}

function toolEvent(
  events: FileSpaceAgentEvent[],
  status: string
): Extract<FileSpaceAgentEvent, { type: "tool.status" }> | undefined {
  return events.find(
    (event): event is Extract<FileSpaceAgentEvent, { type: "tool.status" }> =>
      event.type === "tool.status" && event.data.tool.status === status
  )
}

beforeEach(() => {
  modelState.current = undefined
})

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("FileSpaceAgentService", () => {
  it("owns a durable streamed run after startRun returns", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("The current Space contains Notes.md."),
    })
    const { service } = await createHarness()

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-1",
      prompt: "What is here?",
      model: "mock-model@mock-provider",
      context: { sourceUrl: "/space-file#Notes.md" },
    })

    const snapshot = await eventually(async () => {
      const next = await service.getConversation("space-1", "conversation-1")
      const succeeded = next.events.some(
        (event) =>
          event.type === "run.status" && event.data.run.status === "succeeded"
      )
      return succeeded && next.activeRun === null ? next : undefined
    })
    expect(
      snapshot.events
        .filter((event) => event.type === "assistant.delta")
        .map((event) => event.data.text)
        .join("")
    ).toBe("The current Space contains Notes.md.")
    expect(
      snapshot.events.some((event) => event.type === "resource.context")
    ).toBe(true)
    expect(snapshot.activeRun).toBeNull()
  })

  it("falls back to a bounded preview for an oversized active file", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("I used the bounded preview."),
    })
    const { service, spaces } = await createHarness()
    spaces.readFile.mockRejectedValueOnce(
      Object.assign(new Error("too large"), { code: "file-too-large" })
    )

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-large-context",
      prompt: "Summarize the open note",
      model: "mock-model@mock-provider",
      context: { sourceUrl: "/space-file#Archive.md" },
    })

    const snapshot = await eventually(async () => {
      const next = await service.getConversation(
        "space-1",
        "conversation-large-context"
      )
      return next.activeRun === null &&
        next.events.some(
          (event) =>
            event.type === "run.status" && event.data.run.status === "succeeded"
        )
        ? next
        : undefined
    })
    expect(spaces.readFilePreview).toHaveBeenCalledWith("space-1", "Archive.md")
    const contextEvent = snapshot.events.find(
      (event) => event.type === "resource.context"
    )
    expect(contextEvent).toMatchObject({
      data: {
        context: {
          path: "Archive.md",
          excerpt: "# Notes\n\nPreview text\n",
        },
      },
    })
    expect(contextEvent?.data.context).not.toHaveProperty("contentDigest")
  })

  it("captures a Base row through the read-only Base runtime", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("The task is open."),
    })
    const { service, spaces } = await createHarness()
    spaces.getBaseSnapshotReadOnly.mockResolvedValueOnce({
      path: "Tasks.base",
      metadata: {
        format: "eidos-base",
        formatVersion: 1,
        schemaVersion: 1,
        app: "Eidos",
        createdAt: "2026-07-17T00:00:00.000Z",
        updatedAt: "2026-07-17T01:00:00.000Z",
        defaultTableId: "tasks",
      },
      tables: [],
    })
    spaces.getBaseTableRow.mockResolvedValueOnce({
      id: "row-1",
      title: "Ship Agent",
      done: false,
    })

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-base-context",
      prompt: "Is this task done?",
      model: "mock-model@mock-provider",
      context: {
        sourceUrl: "/space-file?table=tasks&record=row-1#Tasks.base",
      },
    })

    const snapshot = await eventually(async () => {
      const next = await service.getConversation(
        "space-1",
        "conversation-base-context"
      )
      return next.activeRun === null ? next : undefined
    })
    expect(spaces.getBaseSnapshotReadOnly).toHaveBeenCalledWith(
      "space-1",
      "Tasks.base"
    )
    expect(spaces.getBaseTableRow).toHaveBeenCalledWith(
      "space-1",
      "Tasks.base",
      "tasks",
      "row-1"
    )
    expect(
      snapshot.events.find((event) => event.type === "resource.context")
    ).toMatchObject({
      data: {
        context: {
          kind: "base-row",
          path: "Tasks.base",
          tableId: "tasks",
          rowId: "row-1",
          baseFingerprint: "1:1:2026-07-17T01:00:00.000Z",
          excerpt: expect.stringContaining("Ship Agent"),
        },
      },
    })
  })

  it("rejects invalid polling cursors at the IPC boundary", async () => {
    const { service } = await createHarness()
    await expect(
      service.getConversation("space-1", "conversation-cursor", -1)
    ).rejects.toThrow("non-negative integer")
  })

  it("records an observe tool before returning its result to the model", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-search",
              toolName: "search_space_files",
              input: JSON.stringify({ query: "Agent", limit: 5 }),
            },
          ],
          "tool-calls"
        ),
        textStream("I found Notes.md.")
      ),
    })
    const { service, spaces } = await createHarness()

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-search",
      prompt: "Find Agent notes",
      model: "mock-model@mock-provider",
    })

    const snapshot = await eventually(async () => {
      const next = await service.getConversation(
        "space-1",
        "conversation-search"
      )
      const runSucceeded = next.events.some(
        (event) =>
          event.type === "run.status" && event.data.run.status === "succeeded"
      )
      return toolEvent(next.events, "succeeded") &&
        runSucceeded &&
        next.activeRun === null
        ? next
        : undefined
    })
    expect(spaces.searchFiles).toHaveBeenCalledWith("space-1", "Agent", {
      limit: 5,
      includeContent: true,
    })
    expect(toolEvent(snapshot.events, "succeeded")?.data.tool.name).toBe(
      "space.files.search"
    )
  })

  it("waits for approval and performs a digest-bound patch exactly once", async () => {
    const replacement = "# Notes\n\nUpdated by Agent\n"
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-patch",
              toolName: "patch_space_file",
              input: JSON.stringify({
                path: "Notes.md",
                expectedContentDigest: `sha256:${"a".repeat(64)}`,
                content: replacement,
                summary: "Replace the note body",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The approved patch was saved.")
      ),
    })
    const { service, spaces } = await createHarness()

    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-patch",
      prompt: "Update Notes.md",
      model: "mock-model@mock-provider",
    })
    const waiting = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-patch"
      )
      return toolEvent(snapshot.events, "waiting-approval")
    })
    expect(spaces.writeFile).not.toHaveBeenCalled()
    expect(
      service.decideToolRun(
        "space-1",
        "conversation-patch",
        run.id,
        waiting.data.tool.id,
        "allow-once"
      )
    ).toBe(true)

    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-patch"
      )
      const succeeded = toolEvent(snapshot.events, "succeeded")
      return succeeded && snapshot.activeRun === null ? succeeded : undefined
    })
    expect(spaces.writeFile).toHaveBeenCalledTimes(1)
    expect(spaces.writeFile).toHaveBeenCalledWith(
      "space-1",
      "Notes.md",
      replacement,
      100,
      `sha256:${"a".repeat(64)}`
    )
  })

  it("denies a patch without writing the Space file", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-patch-deny",
              toolName: "patch_space_file",
              input: JSON.stringify({
                path: "Notes.md",
                expectedContentDigest: `sha256:${"a".repeat(64)}`,
                content: "Denied content",
                summary: "Unsafe replacement",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The change was denied and not applied.")
      ),
    })
    const { service, spaces } = await createHarness()

    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-deny",
      prompt: "Replace Notes.md",
      model: "mock-model@mock-provider",
    })
    const waiting = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-deny"
      )
      return toolEvent(snapshot.events, "waiting-approval")
    })
    service.decideToolRun(
      "space-1",
      "conversation-deny",
      run.id,
      waiting.data.tool.id,
      "deny"
    )

    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-deny"
      )
      const denied = toolEvent(snapshot.events, "denied")
      return denied && snapshot.activeRun === null ? denied : undefined
    })
    expect(spaces.writeFile).not.toHaveBeenCalled()
  })

  it("cancels a pending approval without applying the patch", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-patch-stop",
              toolName: "patch_space_file",
              input: JSON.stringify({
                path: "Notes.md",
                expectedContentDigest: `sha256:${"a".repeat(64)}`,
                content: "Stopped content",
                summary: "A patch that must be canceled",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("This response must not be reached.")
      ),
    })
    const { service, spaces } = await createHarness()

    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-stop",
      prompt: "Stop before changing Notes.md",
      model: "mock-model@mock-provider",
    })
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-stop"
      )
      return toolEvent(snapshot.events, "waiting-approval")
    })
    await expect(
      service.stopRun("space-1", "conversation-stop", run.id)
    ).resolves.toBe(true)

    const snapshot = await eventually(async () => {
      const next = await service.getConversation("space-1", "conversation-stop")
      const canceled = next.events.find(
        (event) =>
          event.type === "run.status" && event.data.run.status === "canceled"
      )
      return canceled && next.activeRun === null ? next : undefined
    })
    expect(toolEvent(snapshot.events, "canceled")).toBeDefined()
    expect(spaces.writeFile).not.toHaveBeenCalled()
  })

  it("rejects a stale patch before presenting an approval", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-stale-patch",
              toolName: "patch_space_file",
              input: JSON.stringify({
                path: "Notes.md",
                expectedContentDigest: `sha256:${"c".repeat(64)}`,
                content: "Stale content",
                summary: "Apply a stale replacement",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("This response must not be reached.")
      ),
    })
    const { service, spaces } = await createHarness()

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-stale",
      prompt: "Apply stale content",
      model: "mock-model@mock-provider",
    })
    const snapshot = await eventually(async () => {
      const next = await service.getConversation(
        "space-1",
        "conversation-stale"
      )
      const failed = next.events.find(
        (event) =>
          event.type === "run.status" && event.data.run.status === "failed"
      )
      return failed && next.activeRun === null ? next : undefined
    })
    expect(spaces.writeFile).not.toHaveBeenCalled()
    expect(toolEvent(snapshot.events, "waiting-approval")).toBeUndefined()
    expect(
      snapshot.events.find(
        (event) =>
          event.type === "run.status" && event.data.run.status === "failed"
      )
    ).toMatchObject({
      data: {
        run: { error: expect.stringContaining("changed after it was read") },
      },
    })
  })

  it("marks an unfinished durable run interrupted during lazy recovery", async () => {
    const { service, root } = await createHarness()
    const store = new FileSpaceAgentSessionStore(
      path.join(root, ".eidos", "agent", "sessions")
    )
    const timestamp = "2026-07-17T00:00:00.000Z"
    await store.createConversation({
      id: "conversation-recovery",
      spaceId: "space-1",
      title: "Recover me",
      model: "mock-model@mock-provider",
      createdAt: timestamp,
      updatedAt: timestamp,
      latestSequence: 0,
    })
    await store.append("conversation-recovery", {
      type: "run.status",
      data: {
        run: {
          id: "run-recovery",
          conversationId: "conversation-recovery",
          messageId: "message-recovery",
          status: "running",
          model: "mock-model@mock-provider",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    })

    const snapshot = await service.getConversation(
      "space-1",
      "conversation-recovery"
    )
    const lastRun = [...snapshot.events]
      .reverse()
      .find((event) => event.type === "run.status")
    expect(lastRun).toMatchObject({
      data: {
        run: {
          status: "interrupted",
          error: expect.stringContaining("restarted"),
        },
      },
    })
  })
})
