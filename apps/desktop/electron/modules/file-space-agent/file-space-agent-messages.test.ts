// @vitest-environment node

import { describe, expect, it } from "vitest"

import { buildFileSpaceAgentMessages } from "./file-space-agent-messages"
import type { FileSpaceAgentEvent, FileSpaceAgentEventBody } from "./types"

function events(...bodies: FileSpaceAgentEventBody[]): FileSpaceAgentEvent[] {
  return bodies.map((body, index) => ({
    ...body,
    schemaVersion: 2,
    sequence: index + 1,
    timestamp: "2026-07-17T00:00:00.000Z",
  })) as FileSpaceAgentEvent[]
}

describe("buildFileSpaceAgentMessages", () => {
  it("reconstructs a completed semantic assistant snapshot", () => {
    const messages = buildFileSpaceAgentMessages(
      events(
        {
          type: "message.created",
          data: {
            id: "user-1",
            role: "user",
            text: "Inspect the Space",
            runId: "run-1",
          },
        },
        {
          type: "message.snapshot",
          data: {
            message: {
              id: "assistant-1",
              role: "assistant",
              parts: [
                { type: "reasoning", text: "I should search first." },
                {
                  type: "tool-search_space_files",
                  toolCallId: "call-1",
                  toolName: "search_space_files",
                  state: "output-available",
                  input: { query: "Space" },
                  output: [{ path: "Notes.md" }],
                },
                { type: "text", text: "Found Notes.md." },
              ],
              metadata: {
                createdAt: 1,
                model: "model@provider",
                duration: 20,
              },
            },
          },
        }
      )
    )

    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "I should search first." },
        {
          toolCallId: "call-1",
          state: "output-available",
          output: [{ path: "Notes.md" }],
        },
        { type: "text", text: "Found Notes.md." },
      ],
      metadata: { model: "model@provider", duration: 20 },
    })
  })

  it("applies audited truncation and replacement events", () => {
    const messages = buildFileSpaceAgentMessages(
      events(
        {
          type: "message.snapshot",
          data: {
            message: {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "Old request" }],
            },
          },
        },
        {
          type: "message.snapshot",
          data: {
            message: {
              id: "assistant-1",
              role: "assistant",
              parts: [{ type: "text", text: "Old response" }],
            },
          },
        },
        {
          type: "conversation.truncated",
          data: {
            targetMessageId: "user-1",
            replacement: {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "Edited request" }],
            },
          },
        }
      )
    )

    expect(messages).toEqual([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Edited request" }],
        metadata: undefined,
      },
    ])
  })
})
