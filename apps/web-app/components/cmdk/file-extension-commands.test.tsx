import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { FileExtensionPanel } from "@/apps/web-app/hooks/use-file-extension-commands"

import { FileExtensionContributionItems } from "./file-extension-commands"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({
    location: { pathname: "/space-file", search: "", hash: "" },
  }),
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}))

vi.mock("@/components/ui/command", () => ({
  CommandGroup: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: React.PropsWithChildren<{ onSelect: () => void }>) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}))

const panel: FileExtensionPanel = {
  packageId: "local.task-counter",
  contentDigest: `sha256:${"a".repeat(64)}`,
  permissionHash: `sha256:${"b".repeat(64)}`,
  id: "local.task-counter.summary",
  displayName: "Task Summary",
  extensionDisplayName: "Task Counter",
}

describe("FileExtensionContributionItems", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    toastMock.mockReset()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("opens a listed panel directly from the command palette", async () => {
    const openPanel = vi.fn().mockResolvedValue({ sessionId: "panel-1" })
    const onExecute = vi.fn()

    await act(async () => {
      root.render(
        <FileExtensionContributionItems
          commands={[]}
          panels={[panel]}
          execute={vi.fn()}
          openPanel={openPanel}
          onExecute={onExecute}
        />
      )
    })

    const button = container.querySelector("button")
    expect(button?.textContent).toContain("Task Summary")
    await act(async () => {
      button?.click()
      await Promise.resolve()
    })

    expect(onExecute).toHaveBeenCalledOnce()
    expect(openPanel).toHaveBeenCalledWith(panel)
    expect(toastMock).not.toHaveBeenCalled()
  })
})
