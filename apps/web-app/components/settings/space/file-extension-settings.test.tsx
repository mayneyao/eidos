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
      "Open source",
      "Review",
    ])

    const openSource = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Open source"
    )!
    act(() => openSource.click())
    expect(openTabMock).toHaveBeenCalledWith(
      "/space-file#.eidos%2Fextensions%2Fexample.task-counter%2Fsrc%2Fextension.ts",
      "extension.ts"
    )

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
    ).toEqual(["Command", "Panel", "Text editor"])
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
      (button) => button.textContent?.trim() === "Open source"
    )!
    act(() => openCreatedSource.click())
    expect(openTabMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fextensions%2Flocal.hello-tools%2Fsrc%2Feditor.ts",
      "editor.ts"
    )
    expect(discoverMock).toHaveBeenCalledTimes(2)
  })

  it("runs an enabled command directly and opens a filtered command palette", async () => {
    discoverMock.mockResolvedValue(discoveryFixture("enabled"))
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
      "some requested capabilities are still denied (1)"
    )
    expect(container.textContent).not.toContain(
      "This snapshot is ready. Use any contribution below"
    )
    const run = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Run"
    )!
    await act(async () => {
      run.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(executeCommandMock).toHaveBeenCalledWith("file-space", {
      packageId: "example.task-counter",
      contentDigest,
      permissionHash,
      commandId: "example.task-counter.count",
      resource: { path: "" },
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
    expect(container.textContent).toContain(
      "This snapshot is trusted but disabled"
    )

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

    expect(container.textContent).toContain("Source-only changes reload")
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

  it("can remove an invalid package that has no snapshot identity", async () => {
    discoverMock.mockResolvedValue({
      ...discoveryFixture(),
      packages: [
        {
          directoryName: "broken-package",
          status: "invalid",
          lifecycleStatus: "invalid",
          requestedGrants: [],
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
