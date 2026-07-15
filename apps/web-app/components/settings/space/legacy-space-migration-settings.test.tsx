import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { LegacySpaceMigrationSettings } from "./legacy-space-migration-settings"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const createPlanMock = vi.hoisted(() => vi.fn())
const executePlanMock = vi.hoisted(() => vi.fn())
const resetMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())
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

function previewHandle(issues: Array<Record<string, unknown>> = []) {
  return {
    id: "plan-1",
    spaceId: "legacy",
    spaceName: "Legacy Space",
    plan: {
      targetRoot: "/tmp/new-space",
      issues,
      summary: {
        documentCount: 4,
        tableCount: 2,
        rowCount: 120,
        assetCount: 3,
        extensionCount: 2,
      },
    },
  }
}

describe("LegacySpaceMigrationSettings", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    createPlanMock.mockReset()
    executePlanMock.mockReset()
    resetMock.mockReset()
    toastMock.mockReset()
    migrationState.value = {
      available: true,
      planHandle: previewHandle([
        {
          severity: "error",
          code: "asset-symlink-unsupported",
          message: "Asset symlink cannot be exported safely",
        },
        {
          severity: "warning",
          code: "asset-missing",
          message: "One asset is missing",
        },
      ]),
      result: null,
      operation: null,
      progress: null,
      error: null,
      createPlan: createPlanMock,
      executePlan: executePlanMock,
      reset: resetMock,
    }
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        selectFolder: vi.fn().mockResolvedValue("/tmp/selected"),
        showInFileManager: vi.fn(),
        spaceMgmt: {
          registerSpace: vi.fn(),
          switchSpace: vi.fn(),
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

  it("shows the preview and blocks export when the plan has errors", async () => {
    await act(async () => root.render(<LegacySpaceMigrationSettings />))

    expect(container.textContent).toContain("4")
    expect(container.textContent).toContain("120")
    expect(container.textContent).toContain("Extension archives")
    expect(container.textContent).toContain(
      "Asset symlink cannot be exported safely"
    )
    const exportButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Export Space")
    )
    expect(exportButton?.disabled).toBe(true)
  })

  it("chooses another target and executes a valid plan", async () => {
    migrationState.value = {
      ...migrationState.value,
      planHandle: previewHandle(),
    }
    createPlanMock.mockResolvedValue(previewHandle())
    executePlanMock.mockResolvedValue({ status: "completed" })
    await act(async () => root.render(<LegacySpaceMigrationSettings />))

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Change target"))
        ?.click()
      await Promise.resolve()
    })
    expect(createPlanMock).toHaveBeenCalledWith("/tmp/selected")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Export Space"))
        ?.click()
      await Promise.resolve()
    })
    expect(executePlanMock).toHaveBeenCalledTimes(1)
  })

  it("shows legacy extension archive progress", async () => {
    migrationState.value = {
      ...migrationState.value,
      operation: "exporting",
      progress: {
        phase: "extensions",
        completed: 1,
        total: 2,
        currentPath: ".eidos/legacy-extensions/hello-world",
      },
    }
    await act(async () => root.render(<LegacySpaceMigrationSettings />))

    expect(container.textContent).toContain("Archiving legacy extensions…")
    expect(container.textContent).toContain(
      ".eidos/legacy-extensions/hello-world"
    )
  })
})
