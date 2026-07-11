// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { MarkdownEditor } from "@eidos.space/markdown-editor"

const containers: HTMLDivElement[] = []
const roots: ReturnType<typeof createRoot>[] = []

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("Markdown editor runtime", () => {
  afterEach(() => {
    act(() => {
      for (const root of roots.splice(0)) root.unmount()
    })
    for (const container of containers.splice(0)) container.remove()
  })

  it("constructs package nodes with the app Lexical runtime", async () => {
    const container = document.createElement("div")
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)

    await act(async () => {
      root.render(<MarkdownEditor defaultValue="![Diagram](assets/flow.png)" />)
      await Promise.resolve()
    })

    expect(container.querySelector('[role="textbox"]')).not.toBeNull()
  })
})
