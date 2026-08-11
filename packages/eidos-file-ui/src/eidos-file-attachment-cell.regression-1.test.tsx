// @vitest-environment jsdom

// Regression: ISSUE-001 — the second File action was clipped by a fixed 32px footer
// Found by /qa on 2026-08-11

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
} from "@eidos.space/eidos-file"
import { GridCellKind, type Theme } from "@glideapps/glide-data-grid"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileUIProvider } from "./context"
import {
  EidosFileAttachmentCellEditor,
  type EidosFileAttachmentCell,
} from "./eidos-file-attachment-cell"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const serviceCapabilities: HostServiceCapabilities = {
  canOpenSource: true,
  canCreateSource: false,
  canRequestPermission: false,
  canSaveCopy: false,
  canReconcileCommit: false,
  canResolveConflict: false,
  canRecover: false,
  canUseAssets: true,
}

const state: HostSessionState = {
  sessionId: "session-file-actions",
  phase: "ready-clean",
  capabilities: {
    canWriteCurrent: true,
    canSaveCopy: false,
    canRequestPermission: false,
    hasRecovery: false,
    assetReadSchemes: ["https", "relative"],
    assetWriteSchemes: ["https", "relative"],
    casGuarantee: "cooperative",
    atomicReplace: true,
    durability: "best-effort",
  },
  limits: {
    sourceBytesMax: "268435456",
    candidateBytesMax: "268435456",
    recoveryBytesMax: "0",
    recoveryEntriesMax: 0,
    recoveryRetentionSecondsMax: 0,
    assetBytesMax: "268435456",
    assetPreviewBytesMax: "67108864",
    concurrentAssetLeasesMax: 4,
    concurrentSessionsMax: 1,
  },
}

describe("File cell action layout regression", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("keeps local and remote actions in a height-aware scrollable footer", async () => {
    const cell: EidosFileAttachmentCell = {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      copyData: "",
      data: {
        kind: "eidos-file-file-cell",
        entries: [],
        onImport: vi.fn(async () => []),
      },
    }
    await act(async () => {
      root.render(
        <EidosFileUIProvider
          assetSession={{
            services: {
              acquireRemoteAsset: vi.fn(),
            } as unknown as HostServices,
            serviceCapabilities,
            state,
          }}
        >
          <EidosFileAttachmentCellEditor
            value={cell}
            onChange={vi.fn()}
            onFinishedEditing={vi.fn()}
            isHighlighted={false}
            target={{ x: 0, y: 0, width: 240, height: 36 }}
            forceEditMode={false}
            theme={{} as Theme}
          />
        </EidosFileUIProvider>
      )
    })

    const actions = container.querySelector(
      "[data-eidos-file-attachment-actions]"
    )
    expect(actions?.className).toContain("h-auto")
    expect(actions?.className).toContain("min-h-8")
    expect(actions?.className).toContain("shrink")
    expect(actions?.className).toContain("overflow-y-auto")
    expect(Array.from(actions?.classList ?? [])).not.toContain("h-8")
    expect(Array.from(actions?.classList ?? [])).not.toContain("shrink-0")

    const buttons = Array.from(actions?.querySelectorAll("button") ?? [])
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "Add files",
      "Add from URL",
    ])

    await act(async () => {
      buttons[1]?.click()
    })
    expect(actions?.querySelector("form")).not.toBeNull()
    expect(actions?.querySelectorAll("input")).toHaveLength(2)
    expect(actions?.textContent).toContain("Add files")
  })
})
