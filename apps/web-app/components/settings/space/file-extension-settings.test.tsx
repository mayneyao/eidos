import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { FileExtensionSettings } from "./file-extension-settings"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const discoverMock = vi.hoisted(() => vi.fn())
const createTemplateMock = vi.hoisted(() => vi.fn())
const trustMock = vi.hoisted(() => vi.fn())
const revokeTrustMock = vi.hoisted(() => vi.fn())
const setEnabledMock = vi.hoisted(() => vi.fn())
const setGrantMock = vi.hoisted(() => vi.fn())
const startWatchingMock = vi.hoisted(() => vi.fn())
const stopWatchingMock = vi.hoisted(() => vi.fn())
const onMock = vi.hoisted(() => vi.fn())
const offMock = vi.hoisted(() => vi.fn())
const translate = vi.hoisted(
  () =>
    (
      _key: string,
      fallback: string,
      values?: Record<string, string | number>
    ) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
        fallback
      )
)

const contentDigest = `sha256:${"a".repeat(64)}`
const permissionHash = `sha256:${"b".repeat(64)}`

function discoveryFixture(
  lifecycleStatus: "untrusted" | "disabled" | "enabled" = "untrusted"
) {
  const trusted = lifecycleStatus !== "untrusted"
  return {
    root: ".eidos/extensions",
    phase: "runtime-preview",
    executionAvailable: true,
    hostVersion: "0.33.0",
    packages: [
      {
        directoryName: "example.task-counter",
        status: "ready",
        lifecycleStatus,
        canonicalId: "example.task-counter",
        manifest: {
          manifestVersion: 1,
          publisher: "example",
          name: "task-counter",
          displayName: "Task Counter",
          description: "Count Markdown tasks.",
          version: "1.0.0",
          engines: { eidos: ">=0.33.0" },
          entrypoints: { worker: "src/extension.ts" },
          contributes: {
            commands: [
              {
                id: "example.task-counter.count",
                title: "Count tasks",
              },
            ],
          },
          permissions: {
            files: { read: ["**/*.md"], write: [] },
            network: [],
          },
        },
        normalizedPermissions: {
          files: { read: ["**/*.md"], write: [] },
          network: [],
        },
        contentDigest,
        permissionHash,
        requestedGrants: [{ kind: "files.read", value: "**/*.md" }],
        localState: {
          snapshot: {
            packageId: "example.task-counter",
            contentDigest,
            permissionHash,
          },
          trusted,
          enabled: lifecycleStatus === "enabled",
          requestedGrants: trusted
            ? [{ kind: "files.read", value: "**/*.md" }]
            : [],
          granted: [],
        },
        files: [
          { path: "extension.json", size: 200 },
          { path: "src/extension.ts", size: 80 },
        ],
        diagnostics: [],
      },
    ],
    diagnostics: [],
  }
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({
    currentSpace: {
      id: "file-space",
      name: "File Space",
      mode: "file",
      path: "/tmp/file-space",
    },
  }),
}))

describe("FileExtensionSettings", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    discoverMock.mockReset()
    createTemplateMock.mockReset().mockResolvedValue({
      canonicalId: "local.hello-tools",
      root: ".eidos/extensions/local.hello-tools",
      files: ["extension.json", "src/extension.ts", "README.md"],
    })
    trustMock.mockReset().mockResolvedValue({ trusted: true, enabled: false })
    revokeTrustMock
      .mockReset()
      .mockResolvedValue({ trusted: false, enabled: false })
    setEnabledMock
      .mockReset()
      .mockResolvedValue({ trusted: true, enabled: true })
    setGrantMock
      .mockReset()
      .mockResolvedValue({ trusted: true, enabled: false })
    startWatchingMock.mockReset().mockResolvedValue({
      watching: true,
      generation: 0,
    })
    stopWatchingMock.mockReset().mockResolvedValue({
      watching: false,
      generation: 0,
    })
    onMock.mockReset().mockReturnValue("listener-1")
    offMock.mockReset()
    discoverMock.mockResolvedValue(discoveryFixture())
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        on: onMock,
        off: offMock,
        fileExtensions: {
          discover: discoverMock,
          createTemplate: createTemplateMock,
          trust: trustMock,
          revokeTrust: revokeTrustMock,
          setEnabled: setEnabledMock,
          setGrant: setGrantMock,
          startWatching: startWatchingMock,
          stopWatching: stopWatchingMock,
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
    Reflect.deleteProperty(window, "eidos")
  })

  it("shows inspection status and the runtime preview boundary", async () => {
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    expect(discoverMock).toHaveBeenCalledWith("file-space")
    expect(startWatchingMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Developer preview")
    expect(container.textContent).toContain("Task Counter")
    expect(container.textContent).toContain("Untrusted")
    expect(container.textContent).toContain(
      "2 files · 1 contributions · 1 permissions"
    )
    expect(
      [...container.querySelectorAll("button")].map((button) =>
        button.textContent?.trim()
      )
    ).toEqual(["New extension", "Refresh", "Review"])

    const listener = onMock.mock.calls[0]?.[1]
    await act(async () => {
      listener?.({}, { spaceId: "file-space", generation: 1 })
      await Promise.resolve()
    })
    expect(discoverMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      listener?.({}, { spaceId: "file-space", generation: 1 })
      await Promise.resolve()
    })
    expect(discoverMock).toHaveBeenCalledTimes(2)
  })

  it("creates a real local template through the inline form", async () => {
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const newExtension = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "New extension"
    )!
    act(() => newExtension.click())

    const input = container.querySelector<HTMLInputElement>(
      "#local-extension-name"
    )!
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!
    act(() => {
      valueSetter.call(input, "hello-tools")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const create = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Create"
    )!
    await act(async () => {
      create.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createTemplateMock).toHaveBeenCalledWith("file-space", "hello-tools")
    expect(container.textContent).toContain(
      "Created .eidos/extensions/local.hello-tools"
    )
    expect(discoverMock).toHaveBeenCalledTimes(2)
  })

  it("reviews trust, grants, and enablement inline without executing code", async () => {
    discoverMock
      .mockReset()
      .mockResolvedValueOnce(discoveryFixture("untrusted"))
      .mockResolvedValue(discoveryFixture("disabled"))
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const review = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Review"
    )!
    act(() => review.click())
    expect(container.textContent).toContain("Source trust")
    expect(container.textContent).toContain("files.read")
    expect(container.textContent).toContain(
      "Enabled packages run in an isolated Worker bound to exact source bytes"
    )
    expect(
      [
        ...container.querySelectorAll<HTMLButtonElement>("[role='switch']"),
      ].every((control) => control.disabled)
    ).toBe(true)

    const trustSource = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Trust source"
    )!
    await act(async () => {
      trustSource.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    const snapshot = {
      packageId: "example.task-counter",
      contentDigest,
      permissionHash,
    }
    expect(trustMock).toHaveBeenCalledWith("file-space", snapshot)
    expect(container.textContent).toContain("Revoke trust")

    let switches = [
      ...container.querySelectorAll<HTMLElement>("[role='switch']"),
    ]
    await act(async () => {
      switches[1].click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(setGrantMock).toHaveBeenCalledWith("file-space", {
      ...snapshot,
      grant: { kind: "files.read", value: "**/*.md" },
      granted: true,
    })

    switches = [...container.querySelectorAll<HTMLElement>("[role='switch']")]
    await act(async () => {
      switches[0].click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(setEnabledMock).toHaveBeenCalledWith("file-space", snapshot, true)
  })
})
