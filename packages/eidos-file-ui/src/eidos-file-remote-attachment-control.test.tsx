// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  FileEntry,
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileUIProvider } from "./context"
import { EidosFileRemoteAttachmentControl } from "./eidos-file-remote-attachment-control"

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

const hostState: HostSessionState = {
  sessionId: "session-remote-file",
  phase: "ready-clean",
  capabilities: {
    canWriteCurrent: true,
    canSaveCopy: false,
    canRequestPermission: false,
    hasRecovery: false,
    assetReadSchemes: ["https"],
    assetWriteSchemes: ["https"],
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

const entry: FileEntry = {
  id: "0198c72d-82b5-7968-b163-98be4b7477df",
  name: "cover.png",
  mediaType: "image/png",
  size: "68",
  uri: "https://cdn.example.test/cover.png",
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("EidosFileRemoteAttachmentControl", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("acquires an explicit HTTPS URL through the Host and returns its File entry", async () => {
    const acquireRemoteAsset = vi.fn(async () => ({ entry }))
    const onAcquired = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <EidosFileUIProvider
          assetSession={{
            services: { acquireRemoteAsset } as unknown as HostServices,
            serviceCapabilities,
            state: hostState,
          }}
        >
          <EidosFileRemoteAttachmentControl onAcquired={onAcquired} />
        </EidosFileUIProvider>
      )
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click()
    })
    const inputs = container.querySelectorAll("input")
    await act(async () => {
      setInput(inputs[0]!, entry.uri)
      setInput(inputs[1]!, entry.name)
    })
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })

    expect(acquireRemoteAsset).toHaveBeenCalledWith(
      {
        sessionId: hostState.sessionId,
        uri: entry.uri,
        name: entry.name,
      },
      expect.objectContaining({ requestId: expect.any(String) })
    )
    expect(onAcquired).toHaveBeenCalledWith(entry)
  })

  it("does not render when the Host has no HTTPS write capability", async () => {
    await act(async () => {
      root.render(
        <EidosFileUIProvider
          assetSession={{
            services: {
              acquireRemoteAsset: vi.fn(),
            } as unknown as HostServices,
            serviceCapabilities,
            state: {
              ...hostState,
              capabilities: {
                ...hostState.capabilities,
                assetWriteSchemes: [],
              },
            },
          }}
        >
          <EidosFileRemoteAttachmentControl onAcquired={vi.fn()} />
        </EidosFileUIProvider>
      )
    })

    expect(container.textContent).toBe("")
  })
})
