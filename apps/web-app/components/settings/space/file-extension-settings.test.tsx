import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useCMDKStore } from "@/components/cmdk/store"

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
const confirmLegacyPortingMock = vi.hoisted(() => vi.fn())
const retireLegacyPortingMock = vi.hoisted(() => vi.fn())
const executeCommandMock = vi.hoisted(() => vi.fn())
const clearRuntimeOutputMock = vi.hoisted(() => vi.fn())
const openPanelMock = vi.hoisted(() => vi.fn())
const prepareGitHubInstallMock = vi.hoisted(() => vi.fn())
const applyGitHubInstallMock = vi.hoisted(() => vi.fn())
const cancelGitHubInstallMock = vi.hoisted(() => vi.fn())
const uninstallMock = vi.hoisted(() => vi.fn())
const startWatchingMock = vi.hoisted(() => vi.fn())
const stopWatchingMock = vi.hoisted(() => vi.fn())
const startDevelopmentSessionMock = vi.hoisted(() => vi.fn())
const stopDevelopmentSessionMock = vi.hoisted(() => vi.fn())
const onMock = vi.hoisted(() => vi.fn())
const offMock = vi.hoisted(() => vi.fn())
const openTabMock = vi.hoisted(() => vi.fn())
const listSpaceFilesMock = vi.hoisted(() => vi.fn())
const createSpaceFileMock = vi.hoisted(() => vi.fn())
const createSpaceBaseMock = vi.hoisted(() => vi.fn())
const createSpaceBaseViewMock = vi.hoisted(() => vi.fn())
const insertSpaceBaseRowMock = vi.hoisted(() => vi.fn())
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
type FixtureGrant = {
  kind: "files.read" | "files.write" | "network"
  value: string
}
type FileExtensionDiscoveryFixture = Awaited<
  ReturnType<typeof window.eidos.fileExtensions.discover>
>

function discoveryFixture(
  lifecycleStatus: "untrusted" | "disabled" | "enabled" = "untrusted",
  granted: FixtureGrant[] = []
): FileExtensionDiscoveryFixture {
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
            menus: {
              "files/context": [
                {
                  command: "example.task-counter.count",
                  when: "resourceIsDirectory == false",
                  group: "extensions",
                },
              ],
            },
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
        lock: {
          lockVersion: 1,
          source: {
            kind: "github",
            repository: "https://github.com/example/extensions",
            requested: "main",
            commit: "d".repeat(40),
            subdirectory: "packages/task-counter",
          },
          contentDigest,
        },
        requestedGrants: [{ kind: "files.read", value: "**/*.md" }],
        runtimeOutput: [],
        legacyMappings: [],
        localState: {
          snapshot: {
            packageId: "example.task-counter",
            contentDigest,
            permissionHash,
          },
          trusted,
          enabled: lifecycleStatus === "enabled",
          requestedGrants: trusted
            ? [{ kind: "files.read" as const, value: "**/*.md" }]
            : [],
          granted,
        },
        files: [
          { path: "extension.json", size: 200 },
          { path: "src/extension.ts", size: 80 },
        ],
        diagnostics: [],
      },
    ],
    diagnostics: [],
  } as FileExtensionDiscoveryFixture
}

function createdTextEditorFixture() {
  const fixture = discoveryFixture()
  return {
    ...fixture,
    packages: [
      {
        ...fixture.packages[0],
        directoryName: "local.hello-tools",
        canonicalId: "local.hello-tools",
        manifest: {
          ...fixture.packages[0].manifest,
          publisher: "local",
          name: "hello-tools",
          displayName: "Hello Tools",
          description: "Open matching text files with Hello Tools.",
          entrypoints: { ui: "src/editor.ts" },
          contributes: {
            fileEditors: [
              {
                id: "local.hello-tools.editor",
                displayName: "Hello Tools",
                selector: [
                  {
                    filenamePattern: "**/*.tasks.md",
                    mediaType: "text/markdown",
                  },
                ],
                priority: "option" as const,
              },
            ],
          },
          permissions: {
            files: {
              read: ["**/*.tasks.md"],
              write: ["**/*.tasks.md"],
            },
            network: [],
          },
        },
        requestedGrants: [
          { kind: "files.read" as const, value: "**/*.tasks.md" },
          { kind: "files.write" as const, value: "**/*.tasks.md" },
        ],
      },
    ],
  }
}

function panelFixture() {
  const fixture = discoveryFixture("enabled", [
    { kind: "files.read", value: "**/*.md" },
  ])
  const extension = fixture.packages[0]
  if (!extension?.manifest) {
    throw new Error(
      "Expected the discovery fixture to contain an extension manifest"
    )
  }
  return {
    ...fixture,
    packages: [
      {
        ...extension,
        manifest: {
          ...extension.manifest,
          entrypoints: {
            worker: "src/extension.ts",
            ui: "src/panel.ts",
          },
          contributes: {
            ...extension.manifest.contributes,
            panels: [
              {
                id: "example.task-counter.summary",
                displayName: "Task summary",
              },
            ],
          },
        },
        files: [
          { path: "extension.json", size: 200 },
          { path: "src/extension.ts", size: 80 },
          { path: "src/panel.ts", size: 120 },
          { path: "src/panel.css", size: 40 },
          { path: "README.md", size: 60 },
        ],
      },
    ],
  } as FileExtensionDiscoveryFixture
}

function baseViewFixture() {
  const readGrant = { kind: "files.read" as const, value: "**/*.base" }
  const fixture = discoveryFixture("enabled", [readGrant])
  const extension = fixture.packages[0]
  if (!extension?.manifest || !extension.localState) {
    throw new Error(
      "Expected the discovery fixture to contain an extension manifest"
    )
  }
  return {
    ...fixture,
    packages: [
      {
        ...extension,
        manifest: {
          ...extension.manifest,
          entrypoints: { ui: "src/base-view.ts" },
          contributes: {
            baseViews: [
              {
                id: "example.task-counter.cards",
                displayName: "Task cards",
              },
            ],
          },
          permissions: {
            files: { read: ["**/*.base"], write: [] },
            network: [],
          },
        },
        normalizedPermissions: {
          files: { read: ["**/*.base"], write: [] },
          network: [],
        },
        requestedGrants: [readGrant],
        localState: {
          ...extension.localState,
          requestedGrants: [readGrant],
          granted: [readGrant],
        },
        files: [
          { path: "extension.json", size: 200 },
          { path: "src/base-view.ts", size: 120 },
        ],
      },
    ],
  } as FileExtensionDiscoveryFixture
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))

vi.mock("@/apps/web-app/store/tabs", () => ({
  useTabStore: (
    selector: (state: { openTab: typeof openTabMock }) => unknown
  ) => selector({ openTab: openTabMock }),
}))

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
    useAppRuntimeStore.setState({ isCmdkOpen: false })
    useCMDKStore.setState({ input: "", searchNodes: [] })
    openTabMock.mockReset()
    listSpaceFilesMock.mockReset().mockResolvedValue([])
    createSpaceFileMock.mockReset().mockResolvedValue({
      path: "Extension preview.tasks.md",
    })
    createSpaceBaseMock.mockReset().mockResolvedValue({ path: "preview.base" })
    createSpaceBaseViewMock
      .mockReset()
      .mockResolvedValue({ path: "preview.base" })
    insertSpaceBaseRowMock.mockReset().mockResolvedValue({ rowCount: 1 })
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
    confirmLegacyPortingMock.mockReset().mockResolvedValue({
      active: true,
      conflict: "none",
    })
    retireLegacyPortingMock.mockReset().mockResolvedValue({
      active: false,
      conflict: "none",
    })
    executeCommandMock.mockReset().mockResolvedValue({ success: true })
    clearRuntimeOutputMock.mockReset().mockResolvedValue({ success: true })
    prepareGitHubInstallMock.mockReset().mockResolvedValue({
      previewId: "preview-a",
      expiresAt: Date.now() + 60_000,
      operation: "install",
      canonicalId: "example.task-counter",
      displayName: "Task Counter",
      version: "1.0.0",
      source: {
        kind: "github",
        repository: "https://github.com/example/task-counter",
        requested: "refs/tags/v1.0.0",
        commit: "c".repeat(40),
        subdirectory: "packages/task-counter",
      },
      contentDigest,
      permissionHash,
      fileCount: 3,
      fileChanges: [
        { path: "extension.json", kind: "added", afterSize: 200 },
        { path: "src/extension.ts", kind: "added", afterSize: 80 },
      ],
      permissionChanges: [
        { kind: "files.read", value: "**/*.md", change: "added" },
      ],
    })
    applyGitHubInstallMock.mockReset().mockResolvedValue({
      canonicalId: "example.task-counter",
      operation: "install",
      root: ".eidos/extensions/example.task-counter",
      contentDigest,
      permissionHash,
    })
    cancelGitHubInstallMock.mockReset().mockResolvedValue({ success: true })
    uninstallMock.mockReset().mockResolvedValue({ success: true })
    startWatchingMock.mockReset().mockResolvedValue({
      watching: true,
      generation: 0,
    })
    stopWatchingMock.mockReset().mockResolvedValue({
      watching: false,
      generation: 0,
    })
    startDevelopmentSessionMock.mockReset().mockResolvedValue({
      sessionId: "development-1",
      packageId: "example.task-counter",
      anchorSnapshot: {
        packageId: "example.task-counter",
        contentDigest,
        permissionHash,
      },
      currentSnapshot: {
        packageId: "example.task-counter",
        contentDigest,
        permissionHash,
      },
      status: "ready",
      diagnostics: [],
      granted: [],
      startedAt: 1,
      generation: 1,
    })
    stopDevelopmentSessionMock.mockReset().mockResolvedValue({ success: true })
    openPanelMock.mockReset().mockResolvedValue({
      sessionId: "panel-1",
      packageId: "example.task-counter",
      panelId: "example.task-counter.summary",
      title: "Task summary",
      revision: 1,
      generation: "generation-1",
      source: "<!doctype html>",
    })
    onMock.mockReset().mockReturnValue("listener-1")
    offMock.mockReset()
    discoverMock.mockResolvedValue(discoveryFixture())
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        on: onMock,
        off: offMock,
        spaceMgmt: {
          listFiles: listSpaceFilesMock,
          createFile: createSpaceFileMock,
          createBase: createSpaceBaseMock,
          createBaseView: createSpaceBaseViewMock,
          insertBaseRow: insertSpaceBaseRowMock,
        },
        fileExtensions: {
          discover: discoverMock,
          createTemplate: createTemplateMock,
          trust: trustMock,
          revokeTrust: revokeTrustMock,
          setEnabled: setEnabledMock,
          setGrant: setGrantMock,
          confirmLegacyPorting: confirmLegacyPortingMock,
          retireLegacyPorting: retireLegacyPortingMock,
          executeCommand: executeCommandMock,
          clearRuntimeOutput: clearRuntimeOutputMock,
          openPanel: openPanelMock,
          prepareGitHubInstall: prepareGitHubInstallMock,
          applyGitHubInstall: applyGitHubInstallMock,
          cancelGitHubInstall: cancelGitHubInstallMock,
          uninstall: uninstallMock,
          startWatching: startWatchingMock,
          stopWatching: stopWatchingMock,
          startDevelopmentSession: startDevelopmentSessionMock,
          stopDevelopmentSession: stopDevelopmentSessionMock,
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
    ).toEqual([
      "Install from GitHub",
      "New extension",
      "Refresh",
      "Open worker",
      "Review",
    ])

    const openSource = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Open worker"
    )!
    act(() => openSource.click())
    expect(openTabMock).toHaveBeenCalledWith(
      "/space-file#.eidos%2Fextensions%2Fexample.task-counter%2Fsrc%2Fextension.ts",
      "extension.ts"
    )

    let resolveBackground:
      | ((value: ReturnType<typeof discoveryFixture>) => void)
      | undefined
    discoverMock.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof discoveryFixture>>((resolve) => {
          resolveBackground = resolve
        })
    )
    const listener = onMock.mock.calls[0]?.[1]
    await act(async () => {
      listener?.({}, { spaceId: "file-space", generation: 1 })
      await Promise.resolve()
    })
    const refresh = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Refresh")!
    expect(refresh.disabled).toBe(false)
    await act(async () => {
      resolveBackground?.(discoveryFixture())
      await Promise.resolve()
    })
    expect(discoverMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      listener?.({}, { spaceId: "file-space", generation: 1 })
      await Promise.resolve()
    })
    expect(discoverMock).toHaveBeenCalledTimes(2)
  })

  it("opens panel UI first and exposes each source entrypoint inline", async () => {
    discoverMock.mockResolvedValue(panelFixture())
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const openUi = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Open UI"
    )!
    act(() => openUi.click())
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fextensions%2Fexample.task-counter%2Fsrc%2Fpanel.ts",
      "panel.ts"
    )

    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Manage")!
        .click()
    )
    expect(container.textContent).toContain("Source files")
    expect(container.textContent).toContain("Manifestextension.json")
    expect(container.textContent).toContain("Worker entrypointsrc/extension.ts")
    expect(container.textContent).toContain("UI entrypointsrc/panel.ts")
    expect(container.textContent).toContain("Source filesrc/panel.css")
    expect(container.textContent).not.toContain("Source fileREADME.md")

    const openPanel = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Open panel"
    )!
    await act(async () => {
      openPanel.click()
      await Promise.resolve()
    })
    expect(openPanelMock).toHaveBeenCalledWith("file-space", {
      packageId: "example.task-counter",
      contentDigest,
      permissionHash,
      panelId: "example.task-counter.summary",
    })
    expect(container.textContent).toContain("Panel opened in a tab.")

    const openWorker = [...container.querySelectorAll("button")].find(
      (button) =>
        button.textContent?.trim() === "Open" &&
        button.parentElement?.textContent?.includes("Worker entrypoint")
    )!
    act(() => openWorker.click())
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fextensions%2Fexample.task-counter%2Fsrc%2Fextension.ts",
      "extension.ts"
    )
  })

  it("opens an inspection diagnostic at its exact source file", async () => {
    const fixture = discoveryFixture()
    fixture.packages[0]!.diagnostics = [
      {
        code: "package-import-syntax",
        severity: "error",
        message: "Unexpected token",
        path: "src/extension.ts",
      },
    ]
    discoverMock.mockResolvedValue(fixture)
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const diagnosticSource = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "src/extension.ts"
    )!
    act(() => diagnosticSource.click())
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fextensions%2Fexample.task-counter%2Fsrc%2Fextension.ts",
      "extension.ts"
    )
  })

  it("identifies a non-package entry at the extensions root", async () => {
    discoverMock.mockResolvedValue({
      ...discoveryFixture(),
      packages: [
        {
          directoryName: "README.md",
          status: "invalid",
          lifecycleStatus: "invalid",
          requestedGrants: [],
          runtimeOutput: [],
          legacyMappings: [],
          files: [],
          diagnostics: [
            {
              code: "package-not-directory",
              severity: "error",
              message:
                "Entries under the extensions root must be package directories",
              path: "README.md",
            },
          ],
        },
      ],
    })
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    expect(container.textContent).toContain(
      "package-not-directory: Entries under the extensions root must be package directories · README.md"
    )
  })

  it("creates a text-editor template through the inline starter selector", async () => {
    discoverMock
      .mockReset()
      .mockResolvedValueOnce(discoveryFixture())
      .mockResolvedValue(createdTextEditorFixture())
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const newExtension = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "New extension"
    )!
    act(() => newExtension.click())

    const templateOptions = [
      ...container.querySelectorAll<HTMLInputElement>(
        'input[name="local-extension-template"]'
      ),
    ]
    expect(
      templateOptions.map((option) => option.parentElement?.textContent?.trim())
    ).toEqual(["Command", "Panel", "Text editor", "Base view"])
    expect(templateOptions[0]?.checked).toBe(true)
    act(() => templateOptions[2]!.click())
    expect(templateOptions[2]?.checked).toBe(true)

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
    const pattern = container.querySelector<HTMLInputElement>(
      "#local-extension-pattern"
    )!
    act(() => {
      valueSetter.call(pattern, "**/*.tasks.md")
      pattern.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const create = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Create"
    )!
    await act(async () => {
      create.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createTemplateMock).toHaveBeenCalledWith("file-space", {
      name: "hello-tools",
      template: "text-editor",
      filenamePattern: "**/*.tasks.md",
      mediaType: "text/markdown",
    })
    expect(container.textContent).toContain(
      "Created .eidos/extensions/local.hello-tools"
    )
    expect(container.textContent).toContain(
      "Next: review its source, grant matching file access, and enable it below"
    )
    expect(container.textContent).toContain("Source trust")
    expect(container.textContent).toContain("How to use")
    expect(container.textContent).toContain("Trust source first")
    expect(container.textContent).not.toContain(
      "Right-click a matching file → Open with → Hello Tools"
    )
    expect(container.textContent).toContain("**/*.tasks.md · text/markdown")
    const openCreatedSource = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Open UI"
    )!
    act(() => openCreatedSource.click())
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fextensions%2Flocal.hello-tools%2Fsrc%2Feditor.ts",
      "editor.ts"
    )
    expect(discoverMock).toHaveBeenCalledTimes(2)
  })

  it("opens the UI entrypoint after creating a panel starter", async () => {
    discoverMock
      .mockReset()
      .mockResolvedValueOnce(discoveryFixture())
      .mockResolvedValue(discoveryFixture())
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "New extension")!
        .click()
    )
    const templateOptions = [
      ...container.querySelectorAll<HTMLInputElement>(
        'input[name="local-extension-template"]'
      ),
    ]
    act(() => templateOptions[1]!.click())
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

    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Create")!
        .click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(createTemplateMock).toHaveBeenCalledWith("file-space", {
      name: "hello-tools",
      template: "panel",
      filenamePattern: undefined,
      mediaType: undefined,
    })

    const createdStatus =
      container.querySelector<HTMLElement>("[role='status']")!
    const openCreatedUi = [...createdStatus.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Open UI"
    )!
    act(() => openCreatedUi.click())
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fextensions%2Flocal.hello-tools%2Fsrc%2Fpanel.ts",
      "panel.ts"
    )
  })

  it("creates a Base view starter and opens its UI source", async () => {
    createTemplateMock.mockResolvedValue({
      canonicalId: "local.record-cards",
      root: ".eidos/extensions/local.record-cards",
      files: [
        "extension.json",
        "src/base-view.ts",
        "src/base-view.css",
        "README.md",
      ],
    })
    discoverMock
      .mockReset()
      .mockResolvedValueOnce(discoveryFixture())
      .mockResolvedValue(discoveryFixture())
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })
    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "New extension")!
        .click()
    )
    const templateOptions = [
      ...container.querySelectorAll<HTMLInputElement>(
        'input[name="local-extension-template"]'
      ),
    ]
    act(() => templateOptions[3]!.click())
    const input = container.querySelector<HTMLInputElement>(
      "#local-extension-name"
    )!
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!
    act(() => {
      valueSetter.call(input, "record-cards")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Create")!
        .click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createTemplateMock).toHaveBeenCalledWith("file-space", {
      name: "record-cards",
      template: "base-view",
      filenamePattern: undefined,
      mediaType: undefined,
    })
    expect(container.textContent).toContain(
      "Open a .base file, add a view, then choose this extension layout"
    )
    const createdStatus =
      container.querySelector<HTMLElement>("[role='status']")!
    act(() =>
      [...createdStatus.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Open UI")!
        .click()
    )
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fextensions%2Flocal.record-cards%2Fsrc%2Fbase-view.ts",
      "base-view.ts"
    )
  })

  it("runs an enabled file command with a real sample resource", async () => {
    discoverMock.mockResolvedValue(
      discoveryFixture("enabled", [{ kind: "files.read", value: "**/*.md" }])
    )
    listSpaceFilesMock.mockResolvedValue([{ name: "Extension preview.md" }])
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const manage = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Manage"
    )!
    act(() => manage.click())

    expect(container.textContent).toContain("How to use")
    expect(container.textContent).toContain("Count tasks")
    expect(container.textContent).toContain("example.task-counter.count")
    expect(container.textContent).toContain("Command Palette ⌘K · File menu")
    expect(container.textContent).toContain(
      "This snapshot is ready. Use any contribution below"
    )
    const run = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Run with sample file"
    )!
    await act(async () => {
      run.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(createSpaceFileMock).toHaveBeenCalledWith(
      "file-space",
      "Extension preview 2.md",
      "# Count tasks\n\n- [ ] Try the extension command\n- [x] Create a real resource context\n"
    )
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#Extension%20preview%202.md",
      "Extension preview 2.md"
    )
    expect(executeCommandMock).toHaveBeenCalledWith("file-space", {
      packageId: "example.task-counter",
      contentDigest,
      permissionHash,
      commandId: "example.task-counter.count",
      resource: { path: "Extension preview 2.md" },
    })
    expect(container.textContent).toContain("Command completed.")

    const openCommandPalette = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Command Palette")
    )!
    expect(openCommandPalette.disabled).toBe(false)
    act(() => openCommandPalette.click())
    expect(useAppRuntimeStore.getState().isCmdkOpen).toBe(true)
    expect(useCMDKStore.getState().input).toBe("Count tasks")
  })

  it("does not run a file command before its read grant is approved", async () => {
    discoverMock.mockResolvedValue(discoveryFixture("enabled"))
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })
    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Manage")!
        .click()
    )

    expect(container.textContent).toContain(
      "Grant matching file read access below before running this command."
    )
    expect(
      [...container.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Run")
      )
    ).toBe(false)
    expect(executeCommandMock).not.toHaveBeenCalled()
  })

  it("routes a scoped file command to the matching file context menu", async () => {
    const readGrant = {
      kind: "files.read" as const,
      value: "projects/*.md",
    }
    const fixture = discoveryFixture("enabled", [readGrant])
    const extension = fixture.packages[0]!
    extension.requestedGrants = [readGrant]
    extension.manifest!.permissions = {
      files: { read: [readGrant.value], write: [] },
      network: [],
    }
    extension.normalizedPermissions = extension.manifest!.permissions
    extension.localState = {
      ...extension.localState!,
      requestedGrants: [readGrant],
      granted: [readGrant],
    }
    discoverMock.mockResolvedValue(fixture)
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })
    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Manage")!
        .click()
    )

    expect(container.textContent).toContain(
      "Right-click a matching file in Files to run this command with its resource context."
    )
    expect(
      [...container.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Run")
      )
    ).toBe(false)
    expect(createSpaceFileMock).not.toHaveBeenCalled()
    expect(executeCommandMock).not.toHaveBeenCalled()
  })

  it("shows live bounded Worker output and clears it without reloading discovery", async () => {
    discoverMock.mockResolvedValue(discoveryFixture("enabled"))
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })
    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Manage")!
        .click()
    )

    const outputListener = onMock.mock.calls.find(
      ([channel]) => channel === "file-extensions:runtime-output"
    )?.[1] as ((_event: unknown, payload: unknown) => void) | undefined
    expect(outputListener).toBeDefined()
    act(() =>
      outputListener?.(undefined, {
        spaceId: "file-space",
        packageId: "example.task-counter",
        entry: {
          sequence: 1,
          timestamp: 1_700_000_000_000,
          source: "panel",
          level: "info",
          message: "Found 3 Markdown tasks",
        },
      })
    )

    expect(container.textContent).toContain("Runtime output")
    expect(container.textContent).toContain("Found 3 Markdown tasks")
    expect(container.textContent).toContain("panel")
    const clear = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Clear"
    )!
    await act(async () => {
      clear.click()
      await Promise.resolve()
    })
    expect(clearRuntimeOutputMock).toHaveBeenCalledWith(
      "file-space",
      "example.task-counter"
    )
    expect(container.textContent).not.toContain("Found 3 Markdown tasks")
    expect(discoverMock).toHaveBeenCalledTimes(1)
  })

  it("surfaces runtime issues and expands new errors without accepting malformed output", async () => {
    discoverMock.mockResolvedValue(discoveryFixture("enabled"))
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const outputListener = onMock.mock.calls.find(
      ([channel]) => channel === "file-extensions:runtime-output"
    )?.[1] as ((_event: unknown, payload: unknown) => void) | undefined
    act(() =>
      outputListener?.(undefined, {
        spaceId: "file-space",
        packageId: "example.task-counter",
        entry: {
          sequence: 1,
          timestamp: 1_700_000_000_000,
          source: "panel",
          level: "warn",
          message: "Task data is incomplete",
        },
      })
    )
    expect(container.textContent).toContain("Runtime warning")
    expect(container.textContent).toContain("Task data is incomplete")
    expect(container.textContent).not.toContain("Runtime output")

    act(() =>
      outputListener?.(undefined, {
        spaceId: "file-space",
        packageId: "example.task-counter",
        entry: {
          sequence: 2,
          timestamp: 1_700_000_001_000,
          level: "error",
          message: "Malformed event should be ignored",
        },
      })
    )
    expect(container.textContent).not.toContain(
      "Malformed event should be ignored"
    )
    expect(container.textContent).not.toContain("Runtime output")

    const errorMessage = `加载失败 🚨 ${"x".repeat(300)}`
    const errorPayload = {
      spaceId: "file-space",
      packageId: "example.task-counter",
      entry: {
        sequence: 2,
        timestamp: 1_700_000_002_000,
        source: "worker",
        level: "error",
        message: errorMessage,
      },
    }
    act(() => outputListener?.(undefined, errorPayload))

    expect(container.textContent).toContain("Runtime error")
    expect(container.textContent).toContain("Runtime output")
    const issueSummary = [...container.querySelectorAll('[role="alert"]')].find(
      (element) => element.textContent?.includes("Runtime error")
    )!
    expect(issueSummary.querySelector(".line-clamp-2")?.textContent).toBe(
      errorMessage
    )
    expect(
      [...container.querySelectorAll("pre")].filter(
        (element) => element.textContent === errorMessage
      )
    ).toHaveLength(1)

    act(() => outputListener?.(undefined, errorPayload))
    expect(
      [...container.querySelectorAll("pre")].filter(
        (element) => element.textContent === errorMessage
      )
    ).toHaveLength(1)

    const clear = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Clear"
    )!
    await act(async () => {
      clear.click()
      await Promise.resolve()
    })
    expect(container.textContent).not.toContain("Runtime error")
    expect(container.textContent).not.toContain(errorMessage)
  })

  it("requires explicit legacy linking and blocks controls on a mapping conflict", async () => {
    const candidate = discoveryFixture("enabled")
    candidate.packages[0]!.legacyPorting = {
      valid: true,
      diagnostics: [],
      receipt: {
        format: "eidos-legacy-extension-port",
        formatVersion: 1,
        source: {
          legacyExtensionId: "legacy-task-counter",
          legacySlug: "task-counter",
          archiveDigest: `sha256:${"c".repeat(64)}`,
        },
        target: {
          canonicalPackageId: "example.task-counter",
          candidateContribution: "command",
        },
        state: "draft",
      },
    }
    discoverMock.mockResolvedValue(candidate)
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })
    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Manage")!
        .click()
    )
    expect(container.textContent).toContain("Legacy migration")
    expect(container.textContent).toContain(
      "PORTING.json is a candidate receipt only"
    )
    const linkLegacy = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Link legacy source"
    )!
    await act(async () => {
      linkLegacy.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(confirmLegacyPortingMock).toHaveBeenCalledWith("file-space", {
      packageId: "example.task-counter",
      contentDigest,
      permissionHash,
    })

    const conflicted = discoveryFixture("enabled")
    conflicted.packages[0]!.legacyPorting = candidate.packages[0]!.legacyPorting
    conflicted.packages[0]!.legacyMappings = [
      {
        legacyExtensionId: "legacy-task-counter",
        legacySlug: "task-counter",
        canonicalPackageId: "example.task-counter",
        archiveDigest: `sha256:${"c".repeat(64)}`,
        candidateContribution: "command",
        active: true,
        conflict: "legacy-source",
        conflictingLegacyExtensionIds: [],
        conflictingCanonicalPackageIds: ["example.other-counter"],
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    discoverMock.mockResolvedValue(conflicted)
    const refresh = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Refresh"
    )!
    await act(async () => {
      refresh.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain("Migration conflict")
    expect(container.textContent).toContain("Resolve migration link")
    expect(container.textContent).not.toContain("Command completed.")
    const unlink = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Unlink"
    )!
    await act(async () => {
      unlink.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(retireLegacyPortingMock).toHaveBeenCalledWith("file-space", {
      legacyExtensionId: "legacy-task-counter",
      canonicalPackageId: "example.task-counter",
    })
  })

  it("only reports a contribution as ready after requested grants are approved", async () => {
    const fixture = discoveryFixture("enabled", [
      { kind: "files.read", value: "**/*.md" },
    ])
    discoverMock.mockResolvedValue(fixture)
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const manage = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Manage"
    )!
    act(() => manage.click())

    expect(container.textContent).toContain(
      "This snapshot is ready. Use any contribution below"
    )
    expect(container.textContent).not.toContain(
      "some requested capabilities are still denied"
    )
  })

  it("reviews an immutable GitHub snapshot before installing it", async () => {
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const installFromGitHub = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Install from GitHub"
    )!
    act(() => installFromGitHub.click())
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!
    const repository = container.querySelector<HTMLInputElement>(
      "#github-extension-repository"
    )!
    const requestedRef = container.querySelector<HTMLInputElement>(
      "#github-extension-ref"
    )!
    const subdirectory = container.querySelector<HTMLInputElement>(
      "#github-extension-subdirectory"
    )!
    act(() => {
      valueSetter.call(repository, "https://github.com/example/task-counter")
      repository.dispatchEvent(new Event("input", { bubbles: true }))
      valueSetter.call(requestedRef, "refs/tags/v1.0.0")
      requestedRef.dispatchEvent(new Event("input", { bubbles: true }))
      valueSetter.call(subdirectory, "packages/task-counter")
      subdirectory.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const prepare = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Prepare review"
    )!
    await act(async () => {
      prepare.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(prepareGitHubInstallMock).toHaveBeenCalledWith("file-space", {
      repository: "https://github.com/example/task-counter",
      requested: "refs/tags/v1.0.0",
      subdirectory: "packages/task-counter",
    })
    expect(container.textContent).toContain("Permission changes")
    expect(container.textContent).toContain("+ files.read **/*.md")
    expect(container.textContent).toContain("cccccccccccc")
    expect(container.textContent).toContain("packages/task-counter")
    expect(container.textContent).toContain("src/extension.ts")

    const install = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Install reviewed source"
    )!
    await act(async () => {
      install.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(applyGitHubInstallMock).toHaveBeenCalledWith("file-space", {
      previewId: "preview-a",
      contentDigest,
      permissionHash,
    })
    expect(container.textContent).toContain(
      "Installed example.task-counter. Review permissions"
    )
  })

  it("keeps the recorded monorepo path when checking an update", async () => {
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const review = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Review"
    )!
    act(() => review.click())
    const checkUpdate = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Check update"
    )!
    act(() => checkUpdate.click())

    expect(
      container.querySelector<HTMLInputElement>("#github-extension-repository")
        ?.value
    ).toBe("https://github.com/example/extensions")
    expect(
      container.querySelector<HTMLInputElement>("#github-extension-ref")?.value
    ).toBe("main")
    expect(
      container.querySelector<HTMLInputElement>(
        "#github-extension-subdirectory"
      )?.value
    ).toBe("packages/task-counter")
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
    expect(container.textContent).toContain(
      "Step 1 of 3 · Review the source, then trust this exact snapshot below."
    )
    expect(container.textContent).toContain("Source trust")
    expect(container.textContent).toContain("files.read")
    expect(container.textContent).toContain(
      "Logic executes in an isolated Worker, while panels and file editors render in sandboxed frames"
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
    expect(container.textContent).toContain(
      "Step 2 of 3 · Review requested capabilities (1) before enabling the extension."
    )
    expect(container.textContent).toContain(
      "This snapshot is trusted but disabled"
    )

    const permissionSwitch = container.querySelector<HTMLElement>(
      '[role="switch"][aria-label="files.read **/*.md"]'
    )!
    await act(async () => {
      permissionSwitch.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(setGrantMock).toHaveBeenCalledWith("file-space", {
      ...snapshot,
      grant: { kind: "files.read", value: "**/*.md" },
      granted: true,
    })

    const enableExtension = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Enable extension"
    )!
    await act(async () => {
      enableExtension.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(setEnabledMock).toHaveBeenCalledWith("file-space", snapshot, true)

    const uninstall = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Uninstall extension"
    )!
    act(() => uninstall.click())
    expect(container.textContent).toContain(
      "Remove this package source from the Space?"
    )
    const removeSource = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove source"
    )!
    await act(async () => {
      removeSource.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(uninstallMock).toHaveBeenCalledWith("file-space", {
      directoryName: "example.task-counter",
      canonicalId: "example.task-counter",
      contentDigest,
    })
  })

  it("guides a trusted package without permissions directly to enablement", async () => {
    const fixture = discoveryFixture("disabled")
    const extension = fixture.packages[0]!
    extension.requestedGrants = []
    extension.normalizedPermissions = {
      files: { read: [], write: [] },
      network: [],
    }
    extension.manifest!.permissions = {
      files: { read: [], write: [] },
      network: [],
    }
    extension.localState = {
      ...extension.localState!,
      requestedGrants: [],
      granted: [],
    }
    discoverMock.mockResolvedValue(fixture)
    setEnabledMock.mockResolvedValue({
      snapshot: {
        packageId: "example.task-counter",
        contentDigest,
        permissionHash,
      },
      trusted: true,
      enabled: true,
      requestedGrants: [],
      granted: [],
    })

    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Manage")!
        .click()
    )

    const content = container.textContent ?? ""
    expect(content).toContain(
      "Step 3 of 3 · Enable the extension to make its contributions available."
    )
    expect(content.indexOf("Source trust")).toBeLessThan(
      content.indexOf("Permission grants")
    )
    expect(content.indexOf("Permission grants")).toBeLessThan(
      content.indexOf("Enablement")
    )

    const enable = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Enable extension"
    )!
    await act(async () => {
      enable.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(setEnabledMock).toHaveBeenCalledWith(
      "file-space",
      {
        packageId: "example.task-counter",
        contentDigest,
        permissionHash,
      },
      true
    )
    expect(container.textContent).toContain(
      "Ready · This exact snapshot is trusted, permitted, and enabled."
    )
    const run = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Run"
    )!
    await act(async () => {
      run.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(createSpaceFileMock).not.toHaveBeenCalled()
    expect(executeCommandMock).toHaveBeenCalledWith("file-space", {
      packageId: "example.task-counter",
      contentDigest,
      permissionHash,
      commandId: "example.task-counter.count",
      resource: { path: "" },
    })
  })

  it("offers an explicit enable action before registering a trusted command", async () => {
    discoverMock.mockResolvedValue(discoveryFixture("disabled", []))
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const manage = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Manage"
    )!
    act(() => manage.click())

    expect(container.textContent).toContain(
      "This snapshot is trusted but disabled. Enable it to add its contributions to Eidos."
    )
    expect(container.textContent).not.toContain("Command Palette⌘K")

    const enableExtension = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Enable extension"
    )!
    await act(async () => {
      enableExtension.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(setEnabledMock).toHaveBeenCalledWith(
      "file-space",
      {
        packageId: "example.task-counter",
        contentDigest,
        permissionHash,
      },
      true
    )
    expect(useAppRuntimeStore.getState().isCmdkOpen).toBe(false)
  })

  it("uses the committed mutation state while discovery is still stale", async () => {
    discoverMock.mockResolvedValue(discoveryFixture("disabled", []))
    setEnabledMock.mockResolvedValue({
      snapshot: {
        packageId: "example.task-counter",
        contentDigest,
        permissionHash,
      },
      trusted: true,
      enabled: true,
      requestedGrants: [{ kind: "files.read", value: "**/*.md" }],
      granted: [{ kind: "files.read", value: "**/*.md" }],
    })

    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const manage = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Manage"
    )!
    act(() => manage.click())

    const enableExtension = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Enable extension"
    )!
    await act(async () => {
      enableExtension.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("1 enabled · 0 disabled")
    expect(container.textContent).toContain("This snapshot is ready")
    expect(container.textContent).toContain("Run")
  })

  it("shows only the next usable action for a trusted file editor", async () => {
    const fixture = createdTextEditorFixture()
    fixture.packages[0]!.lifecycleStatus = "disabled"
    fixture.packages[0]!.localState = {
      ...fixture.packages[0]!.localState!,
      trusted: true,
      enabled: false,
    }
    discoverMock.mockResolvedValue(fixture)
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const manage = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Manage"
    )!
    act(() => manage.click())

    expect(container.textContent).not.toContain(
      "Right-click a matching file → Open with → Hello Tools"
    )
    const enableExtension = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Enable extension"
    )!
    await act(async () => {
      enableExtension.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(setEnabledMock).toHaveBeenCalledWith(
      "file-space",
      {
        packageId: "local.hello-tools",
        contentDigest,
        permissionHash,
      },
      true
    )
  })

  it("creates and opens a matching sample for a ready file editor", async () => {
    const fixture = createdTextEditorFixture()
    fixture.packages[0]!.lifecycleStatus = "enabled"
    fixture.packages[0]!.localState = {
      ...fixture.packages[0]!.localState!,
      trusted: true,
      enabled: true,
      granted: [
        { kind: "files.read", value: "**/*.tasks.md" },
        { kind: "files.write", value: "**/*.tasks.md" },
      ],
    }
    listSpaceFilesMock.mockResolvedValue([
      { name: "Extension preview.tasks.md" },
    ])
    discoverMock.mockResolvedValue(fixture)
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const manage = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Manage"
    )!
    act(() => manage.click())
    const createSample = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Create sample file"
    )!
    await act(async () => {
      createSample.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listSpaceFilesMock).toHaveBeenCalledWith("file-space", "")
    expect(createSpaceFileMock).toHaveBeenCalledWith(
      "file-space",
      "Extension preview 2.tasks.md",
      "# Hello Tools\n\nStart editing this sample file.\n"
    )
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file?editor=local.hello-tools.editor#Extension%20preview%202.tasks.md",
      "Extension preview 2.tasks.md"
    )
  })

  it("creates and opens a populated sample for a ready Base view", async () => {
    listSpaceFilesMock.mockResolvedValue([{ name: "Extension preview.base" }])
    discoverMock.mockResolvedValue(baseViewFixture())
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Manage")!
        .click()
    )
    expect(container.textContent).toContain(
      "Open a .base file, add a view, then choose Task cards"
    )
    const createSample = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Create sample Base"
    )!
    await act(async () => {
      createSample.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listSpaceFilesMock).toHaveBeenCalledWith("file-space", "")
    expect(createSpaceBaseMock).toHaveBeenCalledWith(
      "file-space",
      "Extension preview 2.base",
      {
        title: "Task cards preview",
        defaultTable: {
          id: "records",
          name: "Records",
          createDefaultView: false,
          fields: [
            {
              name: "Status",
              columnName: "status",
              type: "select",
              property: {
                options: [
                  { id: "planned", name: "Planned", color: "gray" },
                  { id: "active", name: "Active", color: "blue" },
                  { id: "done", name: "Done", color: "green" },
                ],
              },
            },
            { name: "Notes", columnName: "notes", type: "text" },
          ],
        },
      }
    )
    expect(createSpaceBaseViewMock).toHaveBeenCalledWith(
      "file-space",
      "Extension preview 2.base",
      "records",
      {
        name: "Task cards",
        type: "extension:example.task-counter.cards",
      }
    )
    expect(insertSpaceBaseRowMock).toHaveBeenCalledTimes(3)
    expect(insertSpaceBaseRowMock).toHaveBeenNthCalledWith(
      1,
      "file-space",
      "Extension preview 2.base",
      "records",
      {
        title: "Explore this extension view",
        status: "active",
        notes: "Edit the extension source and start a development session.",
      }
    )
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#Extension%20preview%202.base",
      "Extension preview 2.base"
    )
  })

  it("starts and stops an inline development session from an enabled snapshot", async () => {
    const enabled = discoveryFixture("enabled")
    discoverMock.mockResolvedValue(enabled)
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const manage = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Manage"
    )!
    act(() => manage.click())
    expect(container.textContent).toContain(
      "Start development before editing source. Source-only saves will compile and reload without trusting every new digest; permission changes remain blocked."
    )
    expect(
      (container.textContent ?? "").indexOf("Development session")
    ).toBeLessThan((container.textContent ?? "").indexOf("Source trust"))
    const start = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start development"
    )!
    await act(async () => {
      start.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(startDevelopmentSessionMock).toHaveBeenCalledWith("file-space", {
      packageId: "example.task-counter",
      contentDigest,
      permissionHash,
    })

    const development = {
      ...enabled,
      packages: [
        {
          ...enabled.packages[0],
          developmentSession: {
            sessionId: "development-1",
            packageId: "example.task-counter",
            anchorSnapshot: {
              packageId: "example.task-counter",
              contentDigest,
              permissionHash,
            },
            currentSnapshot: {
              packageId: "example.task-counter",
              contentDigest,
              permissionHash,
            },
            status: "ready" as const,
            diagnostics: [],
            granted: [],
            startedAt: 1,
            generation: 1,
          },
        },
      ],
    }
    discoverMock.mockResolvedValue(development)
    await act(async () => {
      const refresh = [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Refresh"
      )!
      refresh.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain(
      "Generation 1 is running from the current source. Source-only saves compile and reload automatically."
    )
    expect(
      [
        ...container.querySelectorAll<HTMLButtonElement>("[role='switch']"),
      ].every((control) => control.disabled)
    ).toBe(true)
    const stop = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Stop development"
    )!
    await act(async () => {
      stop.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(stopDevelopmentSessionMock).toHaveBeenCalledWith("file-space", {
      packageId: "example.task-counter",
      sessionId: "development-1",
    })
  })

  it("makes development compile failures actionable and announces recovery", async () => {
    const anchor = discoveryFixture("enabled")
    const invalidDigest = `sha256:${"c".repeat(64)}`
    const developmentSession = {
      sessionId: "development-1",
      packageId: "example.task-counter",
      anchorSnapshot: {
        packageId: "example.task-counter",
        contentDigest,
        permissionHash,
      },
      currentSnapshot: {
        packageId: "example.task-counter",
        contentDigest: invalidDigest,
        permissionHash,
      },
      status: "invalid" as const,
      diagnostics: [
        {
          code: "compile" as const,
          message: "Unexpected token",
          path: "src/extension.ts",
        },
      ],
      granted: [{ kind: "files.read" as const, value: "**/*.md" }],
      startedAt: 1,
      generation: 2,
    }
    const invalid = {
      ...anchor,
      packages: [
        {
          ...anchor.packages[0],
          lifecycleStatus: "untrusted" as const,
          contentDigest: invalidDigest,
          localState: {
            snapshot: {
              packageId: "example.task-counter",
              contentDigest: invalidDigest,
              permissionHash,
            },
            trusted: false,
            enabled: false,
            requestedGrants: [],
            granted: [],
          },
          developmentSession,
        },
      ],
    }
    discoverMock.mockResolvedValue(invalid)
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Manage")!
        .click()
    )
    const developmentStatus = container.querySelector('[role="status"]')!
    expect(developmentStatus.textContent).toContain("Fix required")
    expect(developmentStatus.textContent).toContain(
      "Generation 2 could not compile. Fix the diagnostics below and save; this session will recover automatically."
    )
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "compile: Unexpected token"
    )
    const openSource = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Open source"
    )!
    act(() => openSource.click())
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fextensions%2Fexample.task-counter%2Fsrc%2Fextension.ts",
      "extension.ts"
    )

    const recoveredDigest = `sha256:${"d".repeat(64)}`
    const recoveredSession = {
      ...developmentSession,
      currentSnapshot: {
        packageId: "example.task-counter",
        contentDigest: recoveredDigest,
        permissionHash,
      },
      status: "ready" as const,
      diagnostics: [],
      generation: 3,
    }
    const developmentListener = onMock.mock.calls.find(
      ([channel]) => channel === "file-extensions:development-changed"
    )?.[1] as ((_event: unknown, payload: unknown) => void) | undefined
    const discoveryCallsBeforeRecovery = discoverMock.mock.calls.length

    const checkingSession = {
      ...developmentSession,
      currentSnapshot: undefined,
      status: "checking" as const,
      diagnostics: [],
      generation: 3,
    }
    act(() => {
      developmentListener?.(undefined, {
        spaceId: "file-space",
        packageId: "example.task-counter",
        sessionId: "development-1",
        status: "checking",
        generation: 3,
        diagnostics: [],
        session: checkingSession,
      })
    })
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Checking generation 3 against the trusted development anchor."
    )

    const permissionsChangedSession = {
      ...developmentSession,
      status: "permissions-changed" as const,
      diagnostics: [
        {
          code: "inspection" as const,
          message: "Requested permissions changed",
        },
      ],
      generation: 4,
    }
    act(() => {
      developmentListener?.(undefined, {
        spaceId: "file-space",
        packageId: "example.task-counter",
        sessionId: "development-1",
        status: "permissions-changed",
        generation: 4,
        diagnostics: permissionsChangedSession.diagnostics,
        session: permissionsChangedSession,
      })
    })
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "The extension ID or requested permissions changed."
    )

    const missingSession = {
      ...developmentSession,
      currentSnapshot: undefined,
      status: "missing" as const,
      diagnostics: [
        {
          code: "inspection" as const,
          message: "Package source is missing",
        },
      ],
      generation: 5,
    }
    act(() => {
      developmentListener?.(undefined, {
        spaceId: "file-space",
        packageId: "example.task-counter",
        sessionId: "development-1",
        status: "missing",
        generation: 5,
        diagnostics: missingSession.diagnostics,
        session: missingSession,
      })
    })
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "The package source is missing."
    )

    recoveredSession.generation = 6
    act(() => {
      developmentListener?.(undefined, {
        spaceId: "file-space",
        packageId: "example.task-counter",
        sessionId: "development-1",
        status: "ready",
        generation: 6,
        diagnostics: [],
        session: recoveredSession,
      })
    })

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Generation 6 is running from the current source. Source-only saves compile and reload automatically."
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).not.toContain("Unexpected token")
    expect(discoverMock).toHaveBeenCalledTimes(discoveryCallsBeforeRecovery)

    act(() => {
      developmentListener?.(undefined, {
        spaceId: "file-space",
        packageId: "example.task-counter",
        sessionId: "development-1",
        status: "invalid",
        generation: 2,
        diagnostics: developmentSession.diagnostics,
        session: developmentSession,
      })
    })
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Generation 6 is running from the current source."
    )

    act(() => {
      developmentListener?.(undefined, {
        spaceId: "file-space",
        packageId: "example.task-counter",
        sessionId: "development-1",
        status: "stopped",
        generation: 7,
        diagnostics: [],
      })
    })
    expect(container.textContent).not.toContain("Stop development")
    expect(discoverMock).toHaveBeenCalledTimes(discoveryCallsBeforeRecovery)
  })

  it("can remove an invalid package that has no snapshot identity", async () => {
    discoverMock.mockResolvedValue({
      ...discoveryFixture(),
      packages: [
        {
          directoryName: "broken-package",
          status: "invalid",
          lifecycleStatus: "invalid",
          requestedGrants: [],
          runtimeOutput: [],
          legacyMappings: [],
          files: [{ path: "src/extension.ts", size: 80 }],
          diagnostics: [
            {
              code: "package-manifest-missing",
              severity: "error",
              message: "extension.json is missing",
            },
          ],
        },
      ],
    })
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    const openSource = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Open source"
    )!
    act(() => openSource.click())
    expect(openTabMock).toHaveBeenCalledWith(
      "/space-file#.eidos%2Fextensions%2Fbroken-package%2Fsrc%2Fextension.ts",
      "extension.ts"
    )

    const remove = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove"
    )!
    act(() => remove.click())
    expect(container.textContent).toContain(
      "Remove this invalid package source from the Space?"
    )
    const removeSource = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove source"
    )!
    await act(async () => {
      removeSource.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(uninstallMock).toHaveBeenCalledWith("file-space", {
      directoryName: "broken-package",
      canonicalId: undefined,
      contentDigest: undefined,
    })
  })
})
