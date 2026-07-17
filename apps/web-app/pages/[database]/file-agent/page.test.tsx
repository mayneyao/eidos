// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  FileSpaceAgentConversationSnapshot,
  FileSpaceAgentEvent,
} from "@/apps/desktop/electron/modules/file-space-agent/types"
import { getFileSpaceAgentSessionActivities } from "@/apps/web-app/components/file-space-agent/session-activity"

import { FileSpaceAgentPage } from "./page"

const mocks = vi.hoisted(() => ({
  getConversation: vi.fn(),
  startRun: vi.fn(),
  setApprovalMode: vi.fn(),
  stopRun: vi.fn(),
  decideToolRun: vi.fn(),
  navigate: vi.fn(),
  setAIModel: vi.fn(),
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({
    currentSpace: { id: "space-1", mode: "file", path: "/tmp/space-1" },
  }),
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({
    params: { conversationId: "conversation-1" },
    location: {
      pathname: "/agent/conversation-1",
      search: "",
      hash: "",
      state: {
        sourceUrl: "/space-file?heading=Plan#Notes.md",
        selection: "selected context",
      },
    },
    navigate: mocks.navigate,
  }),
}))

vi.mock("@/hooks/use-tab-title", () => ({ useTabTitle: () => undefined }))
vi.mock("@/apps/web-app/hooks/use-doc-find-in-page", () => ({
  useDocFindInPage: () => undefined,
}))

vi.mock("@/components/settings/stores", () => ({
  useAIConfigStore: () => ({
    aiConfig: {
      llmProviders: [
        {
          enabled: true,
          name: "Local",
          models: "test-model",
        },
      ],
    },
  }),
}))

vi.mock("@/apps/web-app/store/app-store", () => ({
  useAppStore: () => ({
    aiModel: "test-model@Local",
    setAIModel: mocks.setAIModel,
  }),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function event(
  body: Omit<
    FileSpaceAgentEvent,
    "sequence" | "timestamp" | "checksum" | "previousChecksum"
  >,
  sequence: number
): FileSpaceAgentEvent {
  return {
    ...body,
    sequence,
    timestamp: "2026-07-17T00:00:00.000Z",
    previousChecksum: sequence === 1 ? null : "previous",
    checksum: `checksum-${sequence}`,
  } as FileSpaceAgentEvent
}

function snapshot(): FileSpaceAgentConversationSnapshot {
  const run = {
    id: "run-1",
    conversationId: "conversation-1",
    messageId: "assistant-1",
    status: "waiting-approval" as const,
    model: "test-model@Local",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  }
  return {
    conversation: {
      formatVersion: 2,
      id: "conversation-1",
      spaceId: "space-1",
      title: "Summarize this note",
      model: "test-model@Local",
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
    },
    activeRun: run,
    approvalMode: "auto-safe",
    messages: [
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "Summarize this note" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "I will inspect the note first." },
          {
            type: "tool-write_space_file",
            toolCallId: "call-1",
            toolName: "write_space_file",
            state: "input-available",
            input: { path: "Notes.md" },
          },
          { type: "text", text: "Then I will explain the result." },
        ],
      },
    ],
    events: [
      event(
        {
          type: "message.created",
          data: {
            id: "message-1",
            role: "user",
            text: "Summarize this note",
            runId: "run-1",
          },
        },
        1
      ),
      event(
        {
          type: "resource.context",
          data: {
            runId: "run-1",
            context: {
              kind: "markdown",
              path: "Notes.md",
              heading: "Plan",
              selection: "selected context",
              excerpt: "selected context",
              contentDigest: `sha256:${"a".repeat(64)}`,
              mtimeMs: 1,
              capturedAt: "2026-07-17T00:00:00.000Z",
              reason: "selection",
            },
          },
        },
        2
      ),
      event(
        {
          type: "tool.status",
          data: {
            tool: {
              id: "tool-1",
              runId: "run-1",
              toolCallId: "call-1",
              name: "space.files.writeText",
              title: "Modify Space file",
              risk: "modify",
              status: "waiting-approval",
              resource: "Notes.md",
              inputSummary: "Append a summary",
              preview: "--- a/Notes.md\n+++ b/Notes.md\n+Summary",
              createdAt: "2026-07-17T00:00:00.000Z",
              updatedAt: "2026-07-17T00:00:00.000Z",
            },
          },
        },
        3
      ),
      event({ type: "run.status", data: { run } }, 4),
    ],
  }
}

describe("FileSpaceAgentPage", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    mocks.getConversation.mockReset()
    mocks.getConversation.mockResolvedValueOnce(snapshot())
    mocks.getConversation.mockResolvedValue({
      conversation: snapshot().conversation,
      activeRun: snapshot().activeRun,
      approvalMode: snapshot().approvalMode,
      messages: snapshot().messages,
      events: [],
    })
    mocks.decideToolRun.mockReset()
    mocks.decideToolRun.mockResolvedValue(true)
    mocks.startRun.mockReset()
    mocks.startRun.mockResolvedValue(undefined)
    mocks.setApprovalMode.mockReset()
    mocks.setApprovalMode.mockResolvedValue("ask")
    Object.assign(window, {
      eidos: {
        fileSpaceAgent: {
          getConversation: mocks.getConversation,
          startRun: mocks.startRun,
          setApprovalMode: mocks.setApprovalMode,
          stopRun: mocks.stopRun,
          decideToolRun: mocks.decideToolRun,
        },
      },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("renders explainable context and sends a scoped approval decision", async () => {
    await act(async () => {
      root.render(<FileSpaceAgentPage />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain("Notes.md")
    expect(container.textContent).toContain("Selection")
    expect(container.textContent).toContain("Modify Space file")
    expect(container.textContent).toContain("Append a summary")
    expect(container.textContent).toContain("Allow once")
    expect(container.textContent).toContain("Approve for me")
    const restoredText = container.textContent ?? ""
    expect(restoredText.indexOf("I will inspect the note first.")).toBeLessThan(
      restoredText.indexOf("Modify Space file")
    )
    expect(restoredText.indexOf("Modify Space file")).toBeLessThan(
      restoredText.indexOf("Then I will explain the result.")
    )
    expect(restoredText.match(/Modify Space file/g)).toHaveLength(1)
    expect(getFileSpaceAgentSessionActivities()["conversation-1"]?.status).toBe(
      "waiting-approval"
    )

    const allow = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Allow once")
    )
    await act(async () => {
      allow?.click()
      await Promise.resolve()
    })

    expect(mocks.decideToolRun).toHaveBeenCalledWith(
      "space-1",
      "conversation-1",
      "run-1",
      "tool-1",
      "allow-once"
    )
  })

  it("restores the main-process approval mode without sending authority in a run", async () => {
    const idle = snapshot()
    idle.activeRun = null
    idle.events = []
    idle.messages = []
    idle.approvalMode = "full-access"
    mocks.getConversation.mockReset()
    mocks.getConversation.mockResolvedValue(idle)

    await act(async () => {
      root.render(<FileSpaceAgentPage />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain("Full access")
    const textarea = container.querySelector("textarea")
    const send = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Send")
    )
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set
      setValue?.call(textarea, "Inspect this Space")
      textarea?.dispatchEvent(new Event("input", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      send?.click()
      await Promise.resolve()
    })

    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Inspect this Space" })
    )
    expect(mocks.startRun.mock.calls[0]?.[0]).not.toHaveProperty("approvalMode")
  })
})
