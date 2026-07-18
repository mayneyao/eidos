import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { LegacySpaceMigrationSettings } from "./legacy-space-migration-settings"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const createPlanMock = vi.hoisted(() => vi.fn())
const executePlanMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())
const selectFolderMock = vi.hoisted(() => vi.fn())
const registerSpaceMock = vi.hoisted(() => vi.fn())
const switchSpaceMock = vi.hoisted(() => vi.fn())
const migrationState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({
    currentSpace: {
      id: "legacy",
      name: "Legacy Space",
      mode: "legacy",
      path: "/tmp/legacy",
    },
  }),
}))

vi.mock("@/apps/web-app/hooks/use-space-migration", () => ({
  useSpaceMigration: () => migrationState.value,
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}))

function planHandle(issues: Array<Record<string, unknown>> = []) {
  return {
    id: "plan-1",
    spaceId: "legacy",
    spaceName: "Legacy Space",
    plan: {
      targetRoot: "/tmp/new-space",
      issues,
    },
  }
}

const migrationResult = {
  status: "completed",
  targetRoot: "/tmp/new-space",
}

describe("LegacySpaceMigrationSettings", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    createPlanMock.mockReset().mockResolvedValue(planHandle())
    executePlanMock.mockReset().mockResolvedValue(migrationResult)
    toastMock.mockReset()
    selectFolderMock.mockReset().mockResolvedValue("/tmp/new-space")
    registerSpaceMock.mockReset().mockResolvedValue({
      success: true,
      space: { id: "file-space" },
    })
    switchSpaceMock.mockReset().mockResolvedValue(undefined)
    migrationState.value = {
      available: true,
      result: null,
      operation: null,
      error: null,
      createPlan: createPlanMock,
      executePlan: executePlanMock,
    }
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        selectFolder: selectFolderMock,
        spaceMgmt: {
          registerSpace: registerSpaceMock,
          switchSpace: switchSpaceMock,
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

  it("renders one migration action without extension UI", async () => {
    await act(async () => root.render(<LegacySpaceMigrationSettings />))

    const buttons = container.querySelectorAll("button")
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.textContent).toContain("Migrate Space")
    expect(container.textContent).not.toContain("Legacy extensions")
    expect(container.textContent).not.toContain("Extension archives")
  })

  it("plans, migrates, registers, and opens the new Space from one action", async () => {
    await act(async () => root.render(<LegacySpaceMigrationSettings />))

    await act(async () => {
      container.querySelector("button")?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(selectFolderMock).toHaveBeenCalledTimes(1)
    expect(createPlanMock).toHaveBeenCalledWith("/tmp/new-space")
    expect(executePlanMock).toHaveBeenCalledTimes(1)
    expect(registerSpaceMock).toHaveBeenCalledWith("/tmp/new-space", {
      customName: "Legacy Space",
      mode: "file",
    })
    expect(switchSpaceMock).toHaveBeenCalledWith("file-space")
  })

  it("reports a blocking plan issue without exposing a preview", async () => {
    createPlanMock.mockResolvedValue(
      planHandle([
        {
          severity: "error",
          code: "asset-symlink-unsupported",
          message: "Asset symlink cannot be exported safely",
        },
      ])
    )
    await act(async () => root.render(<LegacySpaceMigrationSettings />))

    await act(async () => {
      container.querySelector("button")?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(executePlanMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith({
      title: "Unable to migrate Space",
      description: "Asset symlink cannot be exported safely",
      variant: "destructive",
    })
    expect(container.textContent).not.toContain(
      "Asset symlink cannot be exported safely"
    )
    expect(container.querySelectorAll("button")).toHaveLength(1)
  })

  it("reuses the single action to open an already migrated Space", async () => {
    migrationState.value = {
      ...migrationState.value,
      result: migrationResult,
    }
    await act(async () => root.render(<LegacySpaceMigrationSettings />))

    expect(container.querySelector("button")?.textContent).toContain(
      "Open migrated Space"
    )
    await act(async () => {
      container.querySelector("button")?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(selectFolderMock).not.toHaveBeenCalled()
    expect(registerSpaceMock).toHaveBeenCalledTimes(1)
    expect(switchSpaceMock).toHaveBeenCalledWith("file-space")
  })
})
