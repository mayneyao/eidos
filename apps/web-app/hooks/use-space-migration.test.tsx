import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useSpaceMigration } from "./use-space-migration"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const createPlanMock = vi.hoisted(() => vi.fn())
const executePlanMock = vi.hoisted(() => vi.fn())
const discardPlanMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))

const handle = {
  id: "plan-1",
  spaceId: "legacy",
  spaceName: "Legacy Space",
  plan: {
    targetRoot: "/tmp/new-space",
    issues: [],
  },
}

const result = {
  status: "completed",
  targetRoot: "/tmp/new-space",
}

describe("useSpaceMigration", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: ReturnType<typeof useSpaceMigration> | null = null

  function Harness() {
    latest = useSpaceMigration("legacy")
    return null
  }

  beforeEach(() => {
    latest = null
    createPlanMock.mockReset().mockResolvedValue(handle)
    executePlanMock.mockReset().mockResolvedValue(result)
    discardPlanMock.mockReset()
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        spaceMigration: {
          createPlan: createPlanMock,
          executePlan: executePlanMock,
          discardPlan: discardPlanMock,
        },
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("can execute a newly created plan without an intermediate render", async () => {
    await act(async () => root.render(<Harness />))

    await act(async () => {
      await latest?.createPlan("/tmp/new-space")
      await latest?.executePlan()
    })

    expect(createPlanMock).toHaveBeenCalledWith("legacy", "/tmp/new-space")
    expect(executePlanMock).toHaveBeenCalledWith("plan-1")
    expect(latest?.result).toEqual(result)
  })

  it("discards a pending plan when the Settings view unmounts", async () => {
    await act(async () => root.render(<Harness />))
    await act(async () => {
      await latest?.createPlan("/tmp/new-space")
    })

    act(() => root.unmount())

    expect(discardPlanMock).toHaveBeenCalledWith("plan-1")
    root = createRoot(container)
  })
})
