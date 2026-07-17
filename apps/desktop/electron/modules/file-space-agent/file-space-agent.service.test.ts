// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises"
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
import { FileSpaceAgentRuntimeStateStore } from "./file-space-agent-runtime-state"
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

async function createHarness(extensions?: unknown, versioning?: unknown) {
  const root = await mkdtemp(path.join(os.tmpdir(), "eidos-agent-service-"))
  roots.push(root)
  const registry = {
    getSpace: (spaceId: string) =>
      spaceId === "space-1"
        ? { id: spaceId, mode: "file", path: root }
        : undefined,
  }
  const spaces = {
    listFiles: vi.fn(async () => [
      {
        name: "Notes.md",
        path: "Notes.md",
        parentPath: "",
        kind: "file" as const,
        size: 24,
        mtimeMs: 100,
      },
      {
        name: "Draft.md",
        path: "Draft.md",
        parentPath: "",
        kind: "file" as const,
        size: 12,
        mtimeMs: 100,
      },
    ]),
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
    readBinaryFile: vi.fn(async (_spaceId, relativePath) => ({
      path: relativePath,
      content: new Uint8Array([1, 2, 3]),
      size: 3,
      mtimeMs: 100,
    })),
    writeFile: vi.fn(async (_spaceId, relativePath, content) => ({
      path: relativePath,
      content,
      contentDigest: `sha256:${"b".repeat(64)}`,
      size: content.length,
      mtimeMs: 101,
    })),
    createFile: vi.fn(async (_spaceId, relativePath, content) => ({
      path: relativePath,
      content,
      contentDigest: `sha256:${"b".repeat(64)}`,
      size: content.length,
      mtimeMs: 101,
    })),
    createDirectory: vi.fn(async (_spaceId, relativePath) => ({
      name: path.basename(relativePath),
      path: relativePath,
      parentPath:
        path.dirname(relativePath) === "." ? "" : path.dirname(relativePath),
      kind: "directory" as const,
      size: 0,
      mtimeMs: 101,
    })),
    moveFile: vi.fn(async () => ({ success: true as const })),
    removeFile: vi.fn(async () => ({ success: true as const })),
    getEidosFileSnapshotReadOnly: vi.fn(),
    getEidosFileTableRow: vi.fn(),
    getEidosFileTablePage: vi.fn(),
  }
  const config = {
    get: () => ({
      exaApiKey: "test-exa-key",
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
      config as any,
      extensions as any,
      versioning as any
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
  vi.unstubAllGlobals()
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("FileSpaceAgentService", () => {
  it("rejects an unknown local approval mode at the IPC boundary", async () => {
    const { service } = await createHarness()

    await expect(
      service.setApprovalMode(
        "space-1",
        "conversation-invalid-approval",
        "unrestricted-computer" as any
      )
    ).rejects.toThrow("Agent approval mode is invalid")
  })

  it("offers only native File Space tools to the new runtime", async () => {
    let offeredTools: string[] = []
    modelState.current = new MockLanguageModelV3({
      doStream: async (options) => {
        offeredTools = (options.tools ?? []).map((tool: any) => tool.name)
        return textStream("Native runtime ready.")
      },
    })
    const { service } = await createHarness(
      { listCommands: vi.fn(async () => []) },
      {}
    )
    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-native-runtime",
      prompt: "Inspect the native runtime",
      model: "mock-model@mock-provider",
    })
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-native-runtime"
      )
      return snapshot.activeRun === null ? snapshot : undefined
    })

    expect(offeredTools).toEqual(
      expect.arrayContaining([
        "read_space_file",
        "write_space_file",
        "create_extension",
        "uninstall_extension",
        "get_version_status",
        "commit_space_version",
        "web_search",
        "web_fetch",
      ])
    )
    expect(offeredTools).not.toEqual(
      expect.arrayContaining([
        "bash",
        "file-read",
        "file-write",
        "file-edit",
        "web-search",
        "web-fetch",
      ])
    )
  })

  it("approval-gates web search and reuses the configured Exa key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        results: [
          {
            title: "Eidos",
            url: "https://eidos.space",
            highlights: ["An offline-first personal data framework."],
          },
        ],
      }),
      text: async () => "",
    })
    vi.stubGlobal("fetch", fetchMock)
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-web-search",
              toolName: "web_search",
              input: JSON.stringify({ query: "Eidos file Space", limit: 3 }),
            },
          ],
          "tool-calls"
        ),
        textStream("I found the official Eidos site.")
      ),
    })
    const { service } = await createHarness()
    await service.setApprovalMode(
      "space-1",
      "conversation-web-search",
      "auto-safe"
    )

    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-web-search",
      prompt: "Search for Eidos",
      model: "mock-model@mock-provider",
    })
    const waiting = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-web-search"
      )
      return toolEvent(snapshot.events, "waiting-approval")
    })
    expect(waiting.data.tool).toMatchObject({
      name: "web.search",
      risk: "external",
      approval: "required",
      approvalMode: "auto-safe",
      resource: "https://api.exa.ai",
    })
    expect(fetchMock).not.toHaveBeenCalled()

    service.decideToolRun(
      "space-1",
      "conversation-web-search",
      run.id,
      waiting.data.tool.id,
      "allow-once"
    )
    const snapshot = await eventually(async () => {
      const current = await service.getConversation(
        "space-1",
        "conversation-web-search"
      )
      return current.activeRun === null ? current : undefined
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.exa.ai/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "test-exa-key" }),
      })
    )
    const assistant = snapshot.messages?.find(
      (message) => message.role === "assistant"
    )
    expect(
      assistant?.parts.find((part) => part.toolName === "web_search")?.output
    ).toMatchObject({
      query: "Eidos file Space",
      results: [{ title: "Eidos", url: "https://eidos.space" }],
    })
    expect(toolEvent(snapshot.events, "succeeded")?.data.tool.name).toBe(
      "web.search"
    )
  })

  it("fetches a public source without prompting in full-access mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "text/plain" : null,
      },
      text: async () => "Eidos source body",
    })
    vi.stubGlobal("fetch", fetchMock)
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-web-fetch",
              toolName: "web_fetch",
              input: JSON.stringify({ url: "https://eidos.space/source.txt" }),
            },
          ],
          "tool-calls"
        ),
        textStream("I read the source.")
      ),
    })
    const { service } = await createHarness()
    await service.setApprovalMode(
      "space-1",
      "conversation-web-fetch",
      "full-access"
    )

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-web-fetch",
      prompt: "Read the source",
      model: "mock-model@mock-provider",
    })
    const snapshot = await eventually(async () => {
      const current = await service.getConversation(
        "space-1",
        "conversation-web-fetch"
      )
      return current.activeRun === null ? current : undefined
    })

    expect(toolEvent(snapshot.events, "waiting-approval")).toBeUndefined()
    expect(toolEvent(snapshot.events, "approved")?.data.tool).toMatchObject({
      name: "web.fetch",
      risk: "external",
      approval: "automatic",
      approvalMode: "full-access",
    })
    const assistant = snapshot.messages?.find(
      (message) => message.role === "assistant"
    )
    expect(
      assistant?.parts.find((part) => part.toolName === "web_fetch")?.output
    ).toMatchObject({
      url: "https://eidos.space/source.txt",
      content: "Eidos source body",
    })
  })

  it("owns a durable streamed run after startRun returns", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("The current Space contains Notes.md."),
    })
    const { service, root } = await createHarness()

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
      snapshot.messages
        ?.find((message) => message.role === "assistant")
        ?.parts.find((part) => part.type === "text")?.text
    ).toBe("The current Space contains Notes.md.")
    expect(snapshot.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "conversation.created",
        "message.created",
        "resource.context",
        "message.snapshot",
        "run.status",
      ])
    )
    expect(
      snapshot.events.filter((event) => event.type === "message.snapshot")
    ).toHaveLength(1)
    const journal = (
      await readFile(
        path.join(
          root,
          ".eidos",
          "agent",
          "sessions",
          "conversation-1",
          "events.jsonl"
        ),
        "utf8"
      )
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(journal).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "assistant.delta" }),
      ])
    )
    expect(journal.every((event) => !("checksum" in event))).toBe(true)
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

  it("captures an Eidos File row through the read-only Eidos File runtime", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("The task is open."),
    })
    const { service, spaces } = await createHarness()
    spaces.getEidosFileSnapshotReadOnly.mockResolvedValueOnce({
      path: "Tasks.eidos",
      metadata: {
        format: "eidos-file",
        formatVersion: 2,
        schemaVersion: 1,
        app: "Eidos",
        createdAt: "2026-07-17T00:00:00.000Z",
        updatedAt: "2026-07-17T01:00:00.000Z",
        defaultTableId: "tasks",
      },
      tables: [],
    })
    spaces.getEidosFileTableRow.mockResolvedValueOnce({
      id: "row-1",
      title: "Ship Agent",
      done: false,
    })

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-eidos-file-context",
      prompt: "Is this task done?",
      model: "mock-model@mock-provider",
      context: {
        sourceUrl: "/space-file?table=tasks&record=row-1#Tasks.eidos",
      },
    })

    const snapshot = await eventually(async () => {
      const next = await service.getConversation(
        "space-1",
        "conversation-eidos-file-context"
      )
      return next.activeRun === null ? next : undefined
    })
    expect(spaces.getEidosFileSnapshotReadOnly).toHaveBeenCalledWith(
      "space-1",
      "Tasks.eidos"
    )
    expect(spaces.getEidosFileTableRow).toHaveBeenCalledWith(
      "space-1",
      "Tasks.eidos",
      "tasks",
      "row-1"
    )
    expect(
      snapshot.events.find((event) => event.type === "resource.context")
    ).toMatchObject({
      data: {
        context: {
          kind: "eidos-file-row",
          path: "Tasks.eidos",
          tableId: "tasks",
          rowId: "row-1",
          eidosFileFingerprint: "2:1:2026-07-17T01:00:00.000Z",
          excerpt: expect.stringContaining("Ship Agent"),
        },
      },
    })
  })

  it("attaches an active Space image to the multimodal user message", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("I inspected the image."),
    })
    const { service, spaces } = await createHarness()
    spaces.readFile.mockRejectedValueOnce(
      Object.assign(new Error("binary"), { code: "invalid-encoding" })
    )
    ;(spaces.readFilePreview as any).mockResolvedValueOnce({
      kind: "binary" as const,
      path: "diagram.png",
      size: 3,
      mtimeMs: 100,
    })

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-image",
      prompt: "Explain this image",
      model: "mock-model@mock-provider",
      context: { sourceUrl: "/space-file#diagram.png" },
    })
    const snapshot = await eventually(async () => {
      const next = await service.getConversation(
        "space-1",
        "conversation-image"
      )
      return next.activeRun === null ? next : undefined
    })
    expect(spaces.readBinaryFile).toHaveBeenCalledWith("space-1", "diagram.png")
    expect(
      snapshot.events.find((event) => event.type === "resource.context")
    ).toMatchObject({
      data: {
        context: {
          kind: "image",
          path: "diagram.png",
          mediaType: "image/png",
          size: 3,
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

  it("keeps Agent session files private from generic Agent file tools", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-private-session",
              toolName: "read_space_file",
              input: JSON.stringify({
                path: ".eidos/agent/sessions/conversation-1/events.jsonl",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The private session is not available.")
      ),
    })
    const { service, spaces } = await createHarness()

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-private-read",
      prompt: "Read the Agent journal",
      model: "mock-model@mock-provider",
    })
    const snapshot = await eventually(async () => {
      const current = await service.getConversation(
        "space-1",
        "conversation-private-read"
      )
      return current.activeRun === null ? current : undefined
    })

    expect(spaces.readFile).not.toHaveBeenCalledWith(
      "space-1",
      expect.stringContaining(".eidos/agent")
    )
    expect(
      snapshot.events.find(
        (event) =>
          event.type === "run.status" && event.data.run.status === "failed"
      )
    ).toMatchObject({
      data: {
        run: { error: expect.stringContaining("private runtime data") },
      },
    })
  })

  it.each([
    {
      label: "creates a file",
      toolName: "create_space_file",
      input: {
        path: "Draft.md",
        content: "# Draft\n",
        summary: "Create a draft",
      },
      method: "createFile",
      args: ["space-1", "Draft.md", "# Draft\n"],
    },
    {
      label: "moves a path",
      toolName: "move_space_path",
      input: {
        sourcePath: "Draft.md",
        destinationPath: "Notes/Draft.md",
        summary: "Organize the draft",
      },
      method: "moveFile",
      args: ["space-1", "Draft.md", "Notes/Draft.md"],
    },
    {
      label: "deletes a path",
      toolName: "delete_space_path",
      input: { path: "Draft.md", summary: "Remove the draft" },
      method: "removeFile",
      args: ["space-1", "Draft.md"],
    },
  ])(
    "$label only after approval",
    async ({ toolName, input, method, args }) => {
      modelState.current = new MockLanguageModelV3({
        doStream: streamSequence(
          modelStream(
            [
              {
                type: "tool-call",
                toolCallId: `call-${toolName}`,
                toolName,
                input: JSON.stringify(input),
              },
            ],
            "tool-calls"
          ),
          textStream("The approved Space operation completed.")
        ),
      })
      const { service, spaces } = await createHarness()
      const { run } = await service.startRun({
        spaceId: "space-1",
        conversationId: `conversation-${method}`,
        prompt: "Manage this Space path",
        model: "mock-model@mock-provider",
      })
      const waiting = await eventually(async () => {
        const snapshot = await service.getConversation(
          "space-1",
          `conversation-${method}`
        )
        return toolEvent(snapshot.events, "waiting-approval")
      })
      expect((spaces as any)[method]).not.toHaveBeenCalled()
      service.decideToolRun(
        "space-1",
        `conversation-${method}`,
        run.id,
        waiting.data.tool.id,
        "allow-once"
      )
      await eventually(async () => {
        const snapshot = await service.getConversation(
          "space-1",
          `conversation-${method}`
        )
        return snapshot.activeRun === null ? snapshot : undefined
      })
      expect((spaces as any)[method]).toHaveBeenCalledWith(...args)
    }
  )

  it("keeps a run waiting until every parallel approval is resolved", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-parallel-a",
              toolName: "create_space_file",
              input: JSON.stringify({
                path: "A.md",
                content: "A\n",
                summary: "Create A",
              }),
            },
            {
              type: "tool-call",
              toolCallId: "call-parallel-b",
              toolName: "create_space_file",
              input: JSON.stringify({
                path: "B.md",
                content: "B\n",
                summary: "Create B",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("Parallel approvals were resolved.")
      ),
    })
    const { service, spaces } = await createHarness()
    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-parallel-approvals",
      prompt: "Create A.md and B.md",
      model: "mock-model@mock-provider",
    })
    const waitingTools = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-parallel-approvals"
      )
      const latest = new Map(
        snapshot.events.flatMap((event) =>
          event.type === "tool.status"
            ? [[event.data.tool.id, event.data.tool] as const]
            : []
        )
      )
      const waiting = [...latest.values()].filter(
        (tool) => tool.status === "waiting-approval"
      )
      return waiting.length === 2 ? waiting : undefined
    })
    expect(
      (await service.listConversations("space-1")).find(
        (conversation) => conversation.id === "conversation-parallel-approvals"
      )
    ).toMatchObject({
      latestRunStatus: "waiting-approval",
      pendingApprovalCount: 2,
      pendingApprovalTitle: "Create Space file",
    })

    expect(
      service.decideToolRun(
        "space-1",
        "conversation-parallel-approvals",
        run.id,
        waitingTools[0]!.id,
        "allow-once"
      )
    ).toBe(true)
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-parallel-approvals"
      )
      return spaces.createFile.mock.calls.length === 1 &&
        snapshot.activeRun?.status === "waiting-approval"
        ? snapshot
        : undefined
    })
    expect(
      service.decideToolRun(
        "space-1",
        "conversation-parallel-approvals",
        run.id,
        waitingTools[1]!.id,
        "deny"
      )
    ).toBe(true)
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-parallel-approvals"
      )
      return snapshot.activeRun === null ? snapshot : undefined
    })
  })

  it("automatically approves safe Space changes in approve-for-me mode", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-auto-safe-create",
              toolName: "create_space_file",
              input: JSON.stringify({
                path: "Auto.md",
                content: "# Auto\n",
                summary: "Create an automatic draft",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The safe Space change completed.")
      ),
    })
    const { service, spaces } = await createHarness()
    await service.setApprovalMode(
      "space-1",
      "conversation-auto-safe-create",
      "auto-safe"
    )

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-auto-safe-create",
      prompt: "Create Auto.md",
      model: "mock-model@mock-provider",
    })
    const snapshot = await eventually(async () => {
      const current = await service.getConversation(
        "space-1",
        "conversation-auto-safe-create"
      )
      return current.activeRun === null ? current : undefined
    })

    expect(spaces.createFile).toHaveBeenCalledWith(
      "space-1",
      "Auto.md",
      "# Auto\n"
    )
    expect(toolEvent(snapshot.events, "waiting-approval")).toBeUndefined()
    expect(toolEvent(snapshot.events, "approved")?.data.tool).toMatchObject({
      approval: "automatic",
      approvalMode: "auto-safe",
    })
    expect(snapshot.approvalMode).toBe("auto-safe")
  })

  it("still asks before a destructive action in approve-for-me mode", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-auto-safe-delete",
              toolName: "delete_space_path",
              input: JSON.stringify({
                path: "Draft.md",
                summary: "Delete the draft",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The destructive action was reviewed.")
      ),
    })
    const { service, spaces } = await createHarness()
    await service.setApprovalMode(
      "space-1",
      "conversation-auto-safe-delete",
      "auto-safe"
    )

    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-auto-safe-delete",
      prompt: "Delete Draft.md",
      model: "mock-model@mock-provider",
    })
    const waiting = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-auto-safe-delete"
      )
      return toolEvent(snapshot.events, "waiting-approval")
    })

    expect(waiting.data.tool).toMatchObject({
      approval: "required",
      approvalMode: "auto-safe",
      name: "space.files.delete",
    })
    expect(spaces.removeFile).not.toHaveBeenCalled()
    service.decideToolRun(
      "space-1",
      "conversation-auto-safe-delete",
      run.id,
      waiting.data.tool.id,
      "deny"
    )
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-auto-safe-delete"
      )
      return snapshot.activeRun === null ? snapshot : undefined
    })
    expect(spaces.removeFile).not.toHaveBeenCalled()
  })

  it("runs destructive typed Space actions without prompting in full-access mode", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-full-access-delete",
              toolName: "delete_space_path",
              input: JSON.stringify({
                path: "Draft.md",
                summary: "Delete the draft",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The full-access action completed.")
      ),
    })
    const { service, spaces } = await createHarness()
    await service.setApprovalMode(
      "space-1",
      "conversation-full-access-delete",
      "full-access"
    )

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-full-access-delete",
      prompt: "Delete Draft.md",
      model: "mock-model@mock-provider",
    })
    const snapshot = await eventually(async () => {
      const current = await service.getConversation(
        "space-1",
        "conversation-full-access-delete"
      )
      return current.activeRun === null ? current : undefined
    })

    expect(spaces.removeFile).toHaveBeenCalledWith("space-1", "Draft.md")
    expect(toolEvent(snapshot.events, "waiting-approval")).toBeUndefined()
    expect(toolEvent(snapshot.events, "approved")?.data.tool).toMatchObject({
      approval: "automatic",
      approvalMode: "full-access",
      name: "space.files.delete",
    })
  })

  it("rejects a destructive operation when the approved path snapshot changed", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-stale-delete",
              toolName: "delete_space_path",
              input: JSON.stringify({
                path: "Draft.md",
                summary: "Delete the approved draft",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The stale deletion was rejected.")
      ),
    })
    const { service, spaces } = await createHarness()
    const draft = (mtimeMs: number) => [
      {
        name: "Draft.md",
        path: "Draft.md",
        parentPath: "",
        kind: "file" as const,
        size: 12,
        mtimeMs,
      },
    ]
    spaces.listFiles
      .mockResolvedValueOnce(draft(100))
      .mockResolvedValueOnce(draft(101))

    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-stale-delete",
      prompt: "Delete Draft.md",
      model: "mock-model@mock-provider",
    })
    const waiting = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-stale-delete"
      )
      return toolEvent(snapshot.events, "waiting-approval")
    })
    expect(waiting.data.tool.preview).toContain("Approved snapshot: sha256:")
    service.decideToolRun(
      "space-1",
      "conversation-stale-delete",
      run.id,
      waiting.data.tool.id,
      "allow-once"
    )
    const snapshot = await eventually(async () => {
      const current = await service.getConversation(
        "space-1",
        "conversation-stale-delete"
      )
      return current.activeRun === null ? current : undefined
    })

    expect(spaces.removeFile).not.toHaveBeenCalled()
    expect(toolEvent(snapshot.events, "failed")?.data.tool.error).toContain(
      "changed after approval"
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
              toolName: "write_space_file",
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
              toolName: "write_space_file",
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

  it("refreshes enabled file Extension commands immediately before execution", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-extension",
              toolName: "run_extension_command",
              input: JSON.stringify({
                commandId: "example.tasks.summarize",
                path: "Tasks.eidos",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The approved Extension command completed.")
      ),
    })
    const command = {
      id: "example.tasks.summarize",
      title: "Summarize tasks",
      extensionDisplayName: "Example Tasks",
      packageId: "example.tasks",
      contentDigest: `sha256:${"d".repeat(64)}`,
      permissionHash: `sha256:${"e".repeat(64)}`,
      menus: {},
    }
    const extensions = {
      listCommands: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([command]),
      executeCommand: vi.fn(async () => ({ success: true as const })),
    }
    const { service } = await createHarness(extensions)

    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-extension",
      prompt: "Summarize Tasks.eidos",
      model: "mock-model@mock-provider",
    })
    const waiting = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-extension"
      )
      return snapshot.events.find(
        (event) =>
          event.type === "tool.status" &&
          event.data.tool.name === "extension.command" &&
          event.data.tool.status === "waiting-approval"
      )
    })
    expect(extensions.executeCommand).not.toHaveBeenCalled()
    if (waiting.type !== "tool.status") {
      throw new Error("Expected an Extension tool status event")
    }
    expect(
      service.decideToolRun(
        "space-1",
        "conversation-extension",
        run.id,
        waiting.data.tool.id,
        "allow-once"
      )
    ).toBe(true)
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-extension"
      )
      return snapshot.activeRun === null ? snapshot : undefined
    })
    expect(extensions.executeCommand).toHaveBeenCalledWith("space-1", {
      packageId: "example.tasks",
      contentDigest: `sha256:${"d".repeat(64)}`,
      permissionHash: `sha256:${"e".repeat(64)}`,
      commandId: "example.tasks.summarize",
      resource: { path: "Tasks.eidos" },
    })
  })

  it("creates a native file-based Extension template through approval", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-create-extension",
              toolName: "create_extension",
              input: JSON.stringify({
                name: "daily-summary",
                template: "command",
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The Extension source template was created.")
      ),
    })
    const extensions = {
      listCommands: vi.fn(async () => []),
      createTemplate: vi.fn(async () => ({
        canonicalId: "local.daily-summary",
        root: ".eidos/extensions/local.daily-summary",
        files: ["extension.json", "src/extension.ts"],
      })),
    }
    const { service } = await createHarness(extensions)
    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-create-extension",
      prompt: "Create a daily summary Extension",
      model: "mock-model@mock-provider",
    })
    const waiting = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-create-extension"
      )
      return toolEvent(snapshot.events, "waiting-approval")
    })
    expect(extensions.createTemplate).not.toHaveBeenCalled()
    service.decideToolRun(
      "space-1",
      "conversation-create-extension",
      run.id,
      waiting.data.tool.id,
      "allow-once"
    )
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-create-extension"
      )
      return snapshot.activeRun === null ? snapshot : undefined
    })
    expect(extensions.createTemplate).toHaveBeenCalledWith("space-1", {
      name: "daily-summary",
      template: "command",
    })
  })

  it("uninstalls only an exact inspected Extension snapshot after approval", async () => {
    const digest = `sha256:${"c".repeat(64)}`
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-uninstall-extension",
              toolName: "uninstall_extension",
              input: JSON.stringify({
                directoryName: "local.daily-summary",
                canonicalId: "local.daily-summary",
                contentDigest: digest,
              }),
            },
          ],
          "tool-calls"
        ),
        textStream("The exact Extension snapshot was uninstalled.")
      ),
    })
    const extensions = {
      listCommands: vi.fn(async () => []),
      uninstall: vi.fn(async () => ({ success: true as const })),
    }
    const { service } = await createHarness(extensions)
    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-uninstall-extension",
      prompt: "Uninstall the daily summary Extension",
      model: "mock-model@mock-provider",
    })
    const waiting = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-uninstall-extension"
      )
      return toolEvent(snapshot.events, "waiting-approval")
    })
    expect(extensions.uninstall).not.toHaveBeenCalled()
    service.decideToolRun(
      "space-1",
      "conversation-uninstall-extension",
      run.id,
      waiting.data.tool.id,
      "allow-once"
    )
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-uninstall-extension"
      )
      return snapshot.activeRun === null ? snapshot : undefined
    })
    expect(extensions.uninstall).toHaveBeenCalledWith("space-1", {
      directoryName: "local.daily-summary",
      canonicalId: "local.daily-summary",
      contentDigest: digest,
    })
  })

  it("inspects Extension compile diagnostics without approval", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-inspect-extension",
              toolName: "inspect_extensions",
              input: JSON.stringify({ packageId: "local.daily-summary" }),
            },
          ],
          "tool-calls"
        ),
        textStream("The Extension source is valid.")
      ),
    })
    const extensions = {
      listCommands: vi.fn(async () => []),
      discover: vi.fn(async () => ({
        root: ".eidos/extensions" as const,
        phase: "runtime-preview" as const,
        executionAvailable: true as const,
        hostVersion: "0.33.0",
        packages: [
          {
            directoryName: "local.daily-summary",
            canonicalId: "local.daily-summary",
            status: "ready",
            diagnostics: [],
          },
        ],
        diagnostics: [],
      })),
      validatePackage: vi.fn(async () => ({
        ok: false,
        status: "invalid" as const,
        canonicalId: "local.daily-summary",
        version: "0.1.0",
        contentDigest: `sha256:${"a".repeat(64)}`,
        permissionHash: `sha256:${"b".repeat(64)}`,
        locallyModified: false,
        entrypoints: [{ kind: "worker" as const, path: "src/extension.ts" }],
        diagnostics: [
          {
            code: "TS2339",
            severity: "error" as const,
            path: "src/extension.ts",
            line: 10,
            column: 53,
            message:
              "Property 'readdir' does not exist on type 'ExtensionSpaceFiles'.",
          },
        ],
      })),
    }
    const { service } = await createHarness(extensions)
    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-inspect-extension",
      prompt: "Validate the Extension",
      model: "mock-model@mock-provider",
    })
    const snapshot = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-inspect-extension"
      )
      return snapshot.activeRun === null ? snapshot : undefined
    })
    expect(extensions.discover).toHaveBeenCalledWith("space-1")
    expect(extensions.validatePackage).toHaveBeenCalledWith(
      "space-1",
      "local.daily-summary"
    )
    const inspection = snapshot.events.find(
      (event) =>
        event.type === "tool.status" &&
        event.data.tool.name === "extension.inspect" &&
        event.data.tool.status === "succeeded"
    )
    expect(
      inspection?.type === "tool.status"
        ? inspection.data.tool.resultSummary
        : undefined
    ).toContain("TS2339")
  })

  it("blocks trusting Extension source that fails SDK validation", async () => {
    const digest = `sha256:${"a".repeat(64)}`
    const permissionHash = `sha256:${"b".repeat(64)}`
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-trust-invalid-extension",
              toolName: "trust_extension",
              input: JSON.stringify({
                packageId: "local.daily-summary",
                contentDigest: digest,
                permissionHash,
              }),
            },
          ],
          "tool-calls"
        ),
        textStream(
          "The Extension source must be fixed before it can be trusted."
        )
      ),
    })
    const extensions = {
      listCommands: vi.fn(async () => []),
      validatePackage: vi.fn(async () => ({
        ok: false,
        status: "invalid" as const,
        canonicalId: "local.daily-summary",
        version: "0.1.0",
        contentDigest: digest,
        permissionHash,
        locallyModified: false,
        entrypoints: [],
        diagnostics: [
          {
            code: "TS2339",
            severity: "error" as const,
            path: "src/extension.ts",
            line: 10,
            column: 53,
            message:
              "Property 'readdir' does not exist on type 'ExtensionSpaceFiles'.",
          },
        ],
      })),
      trust: vi.fn(),
    }
    const { service } = await createHarness(extensions)
    await service.setApprovalMode(
      "space-1",
      "conversation-invalid-extension",
      "full-access"
    )

    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-invalid-extension",
      prompt: "Trust the inspected Extension",
      model: "mock-model@mock-provider",
    })
    const snapshot = await eventually(async () => {
      const current = await service.getConversation(
        "space-1",
        "conversation-invalid-extension"
      )
      return current.activeRun === null ? current : undefined
    })

    expect(extensions.validatePackage).toHaveBeenCalledWith(
      "space-1",
      "local.daily-summary"
    )
    expect(extensions.trust).not.toHaveBeenCalled()
    expect(
      snapshot.events.some(
        (event) =>
          event.type === "tool.status" &&
          event.data.tool.name === "extension.trust" &&
          event.data.tool.status === "failed" &&
          event.data.tool.error?.includes("TS2339")
      )
    ).toBe(true)
  })

  it("uses native version status, staging, and commit tools", async () => {
    const head = "a".repeat(40)
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-version-status",
              toolName: "get_version_status",
              input: JSON.stringify({}),
            },
          ],
          "tool-calls"
        ),
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-version-stage",
              toolName: "stage_space_path",
              input: JSON.stringify({ path: "Notes.md", expectedHead: head }),
            },
          ],
          "tool-calls"
        ),
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-version-commit",
              toolName: "commit_space_version",
              input: JSON.stringify({ message: "Update Notes" }),
            },
          ],
          "tool-calls"
        ),
        textStream("The Space version was created.")
      ),
    })
    const status = {
      spaceId: "space-1",
      enabled: true,
      currentHead: head,
      currentBranch: "main",
      mergeHead: null,
      repositoryFormatVersion: 1,
      dirty: true,
      hasUnstagedChanges: true,
      hasStagedChanges: false,
      hasConflicts: false,
      counts: { unstaged: 1, staged: 0, conflicted: 0 },
      paths: [],
    }
    const versioning = {
      getStatus: vi.fn(async () => status),
      stagePath: vi.fn(async () => ({ path: "Notes.md", status })),
      commit: vi.fn(async () => ({
        currentHead: "b".repeat(40),
        currentBranch: "main",
        commit: {
          id: "b".repeat(40),
          parent: head,
          parents: [head],
          tree: null,
          message: "Update Notes",
          timestampMs: 1,
          changes: [],
          changedPaths: 1,
        },
      })),
    }
    const { service } = await createHarness(undefined, versioning)
    const { run } = await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-version",
      prompt: "Create a version for Notes.md",
      model: "mock-model@mock-provider",
    })
    const firstApproval = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-version"
      )
      return snapshot.events.find(
        (event) =>
          event.type === "tool.status" &&
          event.data.tool.name === "version.stage" &&
          event.data.tool.status === "waiting-approval"
      )
    })
    if (firstApproval.type !== "tool.status") throw new Error("Expected stage")
    service.decideToolRun(
      "space-1",
      "conversation-version",
      run.id,
      firstApproval.data.tool.id,
      "allow-once"
    )
    const secondApproval = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-version"
      )
      return snapshot.events.find(
        (event) =>
          event.type === "tool.status" &&
          event.data.tool.name === "version.commit" &&
          event.data.tool.status === "waiting-approval"
      )
    })
    if (secondApproval.type !== "tool.status") {
      throw new Error("Expected commit")
    }
    service.decideToolRun(
      "space-1",
      "conversation-version",
      run.id,
      secondApproval.data.tool.id,
      "allow-once"
    )
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-version"
      )
      return snapshot.activeRun === null ? snapshot : undefined
    })
    expect(versioning.getStatus).toHaveBeenCalledWith("space-1")
    expect(versioning.stagePath).toHaveBeenCalledWith("space-1", {
      path: "Notes.md",
      expectedHead: head,
    })
    expect(versioning.commit).toHaveBeenCalledWith("space-1", {
      message: "Update Notes",
    })
  })

  it("cancels a pending approval without applying the patch", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: streamSequence(
        modelStream(
          [
            {
              type: "tool-call",
              toolCallId: "call-patch-stop",
              toolName: "write_space_file",
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
              toolName: "write_space_file",
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
      formatVersion: 2,
      id: "conversation-recovery",
      spaceId: "space-1",
      title: "Recover me",
      model: "mock-model@mock-provider",
      createdAt: timestamp,
      updatedAt: timestamp,
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
    await store.append("conversation-recovery", {
      type: "tool.status",
      data: {
        tool: {
          id: "tool-approved",
          runId: "run-recovery",
          name: "space.files.delete",
          title: "Delete Space path",
          risk: "modify",
          status: "approved",
          inputSummary: "Delete Draft.md",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    })
    await store.append("conversation-recovery", {
      type: "tool.status",
      data: {
        tool: {
          id: "tool-waiting",
          runId: "run-recovery",
          name: "space.files.createText",
          title: "Create Space file",
          risk: "modify",
          status: "waiting-approval",
          inputSummary: "Create Notes.md",
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
    const latestTools = new Map(
      snapshot.events.flatMap((event) =>
        event.type === "tool.status"
          ? [[event.data.tool.id, event.data.tool] as const]
          : []
      )
    )
    expect(latestTools.get("tool-approved")).toMatchObject({
      status: "outcome-unknown",
      error: expect.stringContaining("may have completed"),
    })
    expect(latestTools.get("tool-waiting")).toMatchObject({
      status: "interrupted",
    })
  })

  it("promotes a local partial assistant snapshot during crash recovery", async () => {
    const { service, root } = await createHarness()
    const store = new FileSpaceAgentSessionStore(
      path.join(root, ".eidos", "agent", "sessions")
    )
    const timestamp = "2026-07-17T00:00:00.000Z"
    await store.createConversation({
      formatVersion: 2,
      id: "conversation-runtime-recovery",
      title: "Recover partial output",
      model: "mock-model@mock-provider",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const run = {
      id: "run-runtime-recovery",
      conversationId: "conversation-runtime-recovery",
      messageId: "assistant-runtime-recovery",
      status: "running" as const,
      model: "mock-model@mock-provider",
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await store.append("conversation-runtime-recovery", {
      type: "run.status",
      data: { run },
    })
    const runtime = new FileSpaceAgentRuntimeStateStore(
      path.join(root, ".eidos", "agent", "local")
    )
    runtime.save({
      run,
      message: {
        id: run.messageId,
        role: "assistant",
        parts: [{ type: "text", text: "Partial answer before restart" }],
      },
    })
    runtime.close()

    const snapshot = await service.getConversation(
      "space-1",
      "conversation-runtime-recovery"
    )

    expect(snapshot.messages).toEqual([
      {
        id: "assistant-runtime-recovery",
        role: "assistant",
        parts: [{ type: "text", text: "Partial answer before restart" }],
        metadata: undefined,
      },
    ])
    expect(
      [...snapshot.events]
        .reverse()
        .find((event) => event.type === "run.status")
    ).toMatchObject({ data: { run: { status: "interrupted" } } })
    const recoveredRuntime = new FileSpaceAgentRuntimeStateStore(
      path.join(root, ".eidos", "agent", "local")
    )
    expect(
      recoveredRuntime.getConversation("conversation-runtime-recovery")
    ).toBeNull()
    recoveredRuntime.close()
  })

  it("forks a durable conversation at a UI message", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("Original response"),
    })
    const { service } = await createHarness()
    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-fork-source",
      prompt: "Original request",
      model: "mock-model@mock-provider",
    })
    const source = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-fork-source"
      )
      return snapshot.activeRun === null && snapshot.messages?.length === 2
        ? snapshot
        : undefined
    })

    const fork = await service.forkConversation(
      "space-1",
      "conversation-fork-source",
      source.messages![1]!.id,
      "conversation-fork-target"
    )
    const target = await service.getConversation(
      "space-1",
      "conversation-fork-target"
    )

    expect(fork).toMatchObject({
      parentId: "conversation-fork-source",
      forkedMessageId: source.messages![1]!.id,
    })
    expect(target.messages).toEqual(source.messages)
    expect(
      target.events.some(
        (event) =>
          event.type === "run.status" && event.data.run.status === "succeeded"
      )
    ).toBe(true)
  })

  it("searches full conversation content and deletes the durable session", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("The answer contains persimmon details."),
    })
    const { service } = await createHarness()
    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-search-delete",
      prompt: "Find the unusual fruit",
      model: "mock-model@mock-provider",
    })
    await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-search-delete"
      )
      return snapshot.activeRun === null ? snapshot : undefined
    })

    await expect(
      service.searchConversations("space-1", "persimmon")
    ).resolves.toEqual([
      expect.objectContaining({ id: "conversation-search-delete" }),
    ])
    await expect(
      service.deleteConversation("space-1", "conversation-search-delete")
    ).resolves.toBe(true)
    await expect(
      service.getConversation("space-1", "conversation-search-delete")
    ).resolves.toMatchObject({ conversation: null, messages: [] })
  })

  it("edits and regenerates without duplicating the user message", async () => {
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("Original response"),
    })
    const { service } = await createHarness()
    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-edit",
      prompt: "Original request",
      model: "mock-model@mock-provider",
    })
    const original = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-edit"
      )
      return snapshot.activeRun === null && snapshot.messages?.length === 2
        ? snapshot
        : undefined
    })
    const userId = original.messages![0]!.id

    await service.replaceMessage(
      "space-1",
      "conversation-edit",
      userId,
      "Edited request",
      "mock-model@mock-provider"
    )
    modelState.current = new MockLanguageModelV3({
      doStream: textStream("Regenerated response"),
    })
    await service.startRun({
      spaceId: "space-1",
      conversationId: "conversation-edit",
      prompt: "Edited request",
      model: "mock-model@mock-provider",
      regenerateFromMessageId: userId,
    })
    const edited = await eventually(async () => {
      const snapshot = await service.getConversation(
        "space-1",
        "conversation-edit"
      )
      return snapshot.activeRun === null && snapshot.messages?.length === 2
        ? snapshot
        : undefined
    })

    expect(edited.messages!.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ])
    expect(edited.messages![0]!.parts[0]).toMatchObject({
      type: "text",
      text: "Edited request",
    })
    expect(edited.messages![1]!.parts).toContainEqual({
      type: "text",
      text: "Regenerated response",
    })
  })
})
