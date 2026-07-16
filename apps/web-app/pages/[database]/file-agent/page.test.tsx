// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  FileSpaceAgentConversationSnapshot,
  FileSpaceAgentEvent,
} from "@/apps/desktop/electron/modules/file-space-agent/types"

import { FileSpaceAgentPage } from "./page"

const mocks = vi.hoisted(() => ({
  getConversation: vi.fn(),
  startRun: vi.fn(),
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
      id: "conversation-1",
      spaceId: "space-1",
      title: "Summarize this note",
      model: "test-model@Local",
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
      latestSequence: 4,
    },
    activeRun: run,
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
              name: "space.files.patchText",
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
      events: [],
    })
    mocks.decideToolRun.mockReset()
    mocks.decideToolRun.mockResolvedValue(true)
    Object.assign(window, {
      eidos: {
        fileSpaceAgent: {
          getConversation: mocks.getConversation,
          startRun: mocks.startRun,
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
})
