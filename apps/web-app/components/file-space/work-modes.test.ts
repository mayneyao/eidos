import {
  FILE_SPACE_WORK_MODES,
  fileSpaceAgentConversationId,
  isFileSpaceAgentUrl,
} from "./work-modes"

describe("file Space work mode registry", () => {
  it("keeps the stable Files, Version, Agent order and shortcuts", () => {
    expect(
      FILE_SPACE_WORK_MODES.map(({ id, shortcut }) => [id, shortcut])
    ).toEqual([
      ["files", 1],
      ["version", 2],
      ["agent", 3],
    ])
  })

  it("recognizes only scoped Agent conversation routes", () => {
    expect(fileSpaceAgentConversationId("/agent/conversation-1")).toBe(
      "conversation-1"
    )
    expect(isFileSpaceAgentUrl("/agent/conversation-1?from=file")).toBe(true)
    expect(isFileSpaceAgentUrl("/agent")).toBe(false)
    expect(isFileSpaceAgentUrl("/space-file#agent/conversation-1")).toBe(false)
  })
})
