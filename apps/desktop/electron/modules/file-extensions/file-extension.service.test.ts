// @vitest-environment node

import "reflect-metadata"

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainWindowProvider } from "../space-management/main-window.provider"
import type { SpaceRegistry } from "../space-management/space-registry"
import type { SpaceResourceLifecycle } from "../space-management/space-resource-lifecycle"
import type { FileExtensionInstallManager } from "./file-extension-install-manager"
import type { FileExtensionRuntimeManager } from "./runtime/file-extension-runtime-manager"
import type { FileExtensionRuntimeExecution } from "./runtime/file-extension-runtime-manager"
import type { FileExtensionTemplateRequest } from "./types"

vi.mock("electron", () => ({
  app: { getVersion: () => "0.33.0" },
}))

const roots: string[] = []
const WATCH_EVENT_TIMEOUT_MS = 10_000

function runtimeManagerStub(): FileExtensionRuntimeManager {
  return {
    execute: vi.fn(),
    disposePackage: vi.fn(),
    disposeSpace: vi.fn(),
    disposeAll: vi.fn(),
    has: vi.fn(() => false),
  } as unknown as FileExtensionRuntimeManager
}

async function createFileSpace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
  roots.push(root)
  const packageRoot = path.join(
    root,
    ".eidos",
    "extensions",
    "example.task-counter"
  )
  await mkdir(path.join(packageRoot, "src"), { recursive: true })
  await writeFile(
    path.join(packageRoot, "extension.json"),
    JSON.stringify({
      manifestVersion: 1,
      publisher: "example",
      name: "task-counter",
      displayName: "Task Counter",
      version: "1.0.0",
      engines: { eidos: ">=0.33.0 <1.0.0" },
      entrypoints: { worker: "src/extension.ts" },
      contributes: {
        commands: [{ id: "example.task-counter.count", title: "Count tasks" }],
      },
      permissions: {
        files: { read: ["**/*.md"], write: [] },
        network: [],
      },
    })
  )
  await writeFile(
    path.join(packageRoot, "src", "extension.ts"),
    "export const activate = () => undefined\n"
  )
  return root
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("FileExtensionService", () => {
  it("links an inspected legacy receipt and blocks conflicting ports until resolution", async () => {
    const root = await createFileSpace()
    const extensionsRoot = path.join(root, ".eidos", "extensions")
    const firstPackageRoot = path.join(extensionsRoot, "example.task-counter")
    const receipt = (canonicalPackageId: string, archiveSeed: string) => ({
      format: "eidos-legacy-extension-port",
      formatVersion: 1,
      source: {
        legacyExtensionId: "legacy-task-counter",
        legacySlug: "task-counter",
        archiveDigest: `sha256:${archiveSeed.repeat(64)}`,
      },
      target: {
        canonicalPackageId,
        candidateContribution: "command",
      },
      state: "draft",
    })
    await writeFile(
      path.join(firstPackageRoot, "PORTING.json"),
      JSON.stringify(receipt("example.task-counter", "a"))
    )
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )

    const firstDiscovery = await service.discover("space-a")
    const first = firstDiscovery.packages.find(
      (extension) => extension.canonicalId === "example.task-counter"
    )!
    expect(first).toMatchObject({
      legacyPorting: {
        valid: true,
        receipt: {
          source: { legacyExtensionId: "legacy-task-counter" },
        },
      },
      legacyMappings: [],
    })
    const firstSnapshot = {
      packageId: first.canonicalId!,
      contentDigest: first.contentDigest!,
      permissionHash: first.permissionHash!,
    }
    await expect(
      service.confirmLegacyPorting("space-a", firstSnapshot)
    ).resolves.toMatchObject({
      active: true,
      conflict: "none",
      legacyExtensionId: "legacy-task-counter",
      canonicalPackageId: "example.task-counter",
    })
    await service.trust("space-a", firstSnapshot)
    await service.setEnabled("space-a", firstSnapshot, true)
    await expect(service.listCommands("space-a")).resolves.toHaveLength(1)

    const secondPackageRoot = path.join(extensionsRoot, "example.other-counter")
    await mkdir(path.join(secondPackageRoot, "src"), { recursive: true })
    await writeFile(
      path.join(secondPackageRoot, "extension.json"),
      JSON.stringify({
        manifestVersion: 1,
        publisher: "example",
        name: "other-counter",
        displayName: "Other Counter",
        version: "1.0.0",
        engines: { eidos: ">=0.33.0 <1.0.0" },
        entrypoints: { worker: "src/extension.ts" },
        contributes: {
          commands: [
            { id: "example.other-counter.count", title: "Count elsewhere" },
          ],
        },
        permissions: {
          files: { read: [], write: [] },
          network: [],
        },
      })
    )
    await writeFile(
      path.join(secondPackageRoot, "src", "extension.ts"),
      "export const activate = () => undefined\n"
    )
    await writeFile(
      path.join(secondPackageRoot, "PORTING.json"),
      JSON.stringify(receipt("example.other-counter", "b"))
    )
    const second = (await service.discover("space-a")).packages.find(
      (extension) => extension.canonicalId === "example.other-counter"
    )!
    const secondSnapshot = {
      packageId: second.canonicalId!,
      contentDigest: second.contentDigest!,
      permissionHash: second.permissionHash!,
    }
    await expect(
      service.confirmLegacyPorting("space-a", secondSnapshot)
    ).resolves.toMatchObject({ conflict: "legacy-source" })

    const conflicted = await service.discover("space-a")
    expect(
      conflicted.packages
        .flatMap((extension) => extension.legacyMappings)
        .map((mapping) => mapping.conflict)
    ).toEqual(["legacy-source", "legacy-source"])
    await expect(service.listCommands("space-a")).resolves.toEqual([])
    await expect(
      service.executeCommand("space-a", {
        ...firstSnapshot,
        commandId: "example.task-counter.count",
        resource: { path: "" },
      })
    ).rejects.toThrow(/mapping conflict/)

    await service.retireLegacyPorting("space-a", {
      legacyExtensionId: "legacy-task-counter",
      canonicalPackageId: "example.other-counter",
    })
    const resolved = await service.discover("space-a")
    expect(
      resolved.packages.find(
        (extension) => extension.canonicalId === "example.task-counter"
      )?.legacyMappings
    ).toMatchObject([{ conflict: "none" }])
    await expect(service.listCommands("space-a")).resolves.toHaveLength(1)

    await expect(
      service.confirmLegacyPorting("space-a", secondSnapshot)
    ).resolves.toMatchObject({
      active: true,
      conflict: "legacy-source",
      legacyExtensionId: "legacy-task-counter",
      canonicalPackageId: "example.other-counter",
    })
    await expect(service.listCommands("space-a")).resolves.toEqual([])

    await service.retireLegacyPorting("space-a", {
      legacyExtensionId: "legacy-task-counter",
      canonicalPackageId: "example.other-counter",
    })
    await expect(service.listCommands("space-a")).resolves.toHaveLength(1)
  })

  it("opens an enabled file editor from the exact trusted snapshot", async () => {
    const root = await createFileSpace()
    const packageRoot = path.join(
      root,
      ".eidos",
      "extensions",
      "example.task-counter"
    )
    await writeFile(
      path.join(packageRoot, "extension.json"),
      JSON.stringify({
        manifestVersion: 1,
        publisher: "example",
        name: "task-counter",
        displayName: "Task Counter",
        version: "1.0.0",
        engines: { eidos: ">=0.33.0 <1.0.0" },
        entrypoints: {
          worker: "src/extension.ts",
          ui: "src/editor.ts",
        },
        contributes: {
          commands: [{ id: "example.task-counter.count", title: "Count" }],
          fileEditors: [
            {
              id: "example.task-counter.board",
              displayName: "Task Board",
              selector: [{ filenamePattern: "**/*.md" }],
              priority: "option",
            },
          ],
        },
        permissions: {
          files: { read: ["**/*.md"], write: ["**/*.md"] },
          network: [],
        },
      })
    )
    await writeFile(
      path.join(packageRoot, "src", "editor.ts"),
      [
        'import type { ExtensionFileEditorContext } from "@eidos.space/extension-sdk"',
        "export function activate(context: ExtensionFileEditorContext) {",
        "  context.root.textContent = context.document.snapshot.text",
        "}",
      ].join("\n")
    )
    await writeFile(path.join(root, "tasks.md"), "- [ ] Ship\n")
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const send = vi.fn()
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )
    const extension = (await service.discover("space-a")).packages[0]!
    const snapshot = {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    }
    await service.trust("space-a", snapshot)
    for (const kind of ["files.read", "files.write"] as const) {
      await service.setGrant("space-a", {
        ...snapshot,
        grant: { kind, value: "**/*.md" },
        granted: true,
      })
    }
    await service.setEnabled("space-a", snapshot, true)

    await expect(
      service.listFileEditors("space-a", "tasks.md")
    ).resolves.toMatchObject([
      {
        id: "example.task-counter.board",
        packageId: "example.task-counter",
        displayName: "Task Board",
        editable: true,
      },
    ])
    const editor = await service.openFileEditor("space-a", {
      ...snapshot,
      editorId: "example.task-counter.board",
      path: "tasks.md",
    })
    expect(editor).toMatchObject({
      packageId: "example.task-counter",
      editorId: "example.task-counter.board",
      snapshot: { text: "- [ ] Ship\n", readOnly: false },
      capabilities: { editable: true, save: true },
    })
    expect(editor.source).toContain("__eidosStartSurface")

    await expect(
      service.handleFileEditorRequest(
        "space-a",
        { sessionId: editor.sessionId, viewId: editor.viewId },
        {
          type: "apply-edits",
          requestId: "edit-1",
          documentId: editor.snapshot.documentId,
          baseRevision: 1,
          edits: [{ start: 3, end: 4, text: "x" }],
        }
      )
    ).resolves.toMatchObject({ ok: true, revision: 2 })
    await service.flushFileEditor("space-a", {
      sessionId: editor.sessionId,
      viewId: editor.viewId,
    })
    await expect(readFile(path.join(root, "tasks.md"), "utf8")).resolves.toBe(
      "- [x] Ship\n"
    )
    await service.closeFileEditor("space-a", {
      sessionId: editor.sessionId,
      viewId: editor.viewId,
    })
    await service.setGrant("space-a", {
      ...snapshot,
      grant: { kind: "files.write", value: "**/*.md" },
      granted: false,
    })
    await expect(
      service.listFileEditors("space-a", "tasks.md")
    ).resolves.toMatchObject([{ editable: false }])
    const readOnlyEditor = await service.openFileEditor("space-a", {
      ...snapshot,
      editorId: "example.task-counter.board",
      path: "tasks.md",
    })
    expect(readOnlyEditor).toMatchObject({
      snapshot: { readOnly: true },
      capabilities: { editable: false, save: false, undoRedo: false },
    })
    expect(readOnlyEditor.generation).not.toBe(editor.generation)
    await service.closeFileEditor("space-a", {
      sessionId: readOnlyEditor.sessionId,
      viewId: readOnlyEditor.viewId,
    })
    service.stopWatching("space-a")
  })

  it("opens and refreshes a declared panel through an opaque session", async () => {
    const root = await createFileSpace()
    const packageRoot = path.join(
      root,
      ".eidos",
      "extensions",
      "example.task-counter"
    )
    await writeFile(
      path.join(packageRoot, "extension.json"),
      JSON.stringify({
        manifestVersion: 1,
        publisher: "example",
        name: "task-counter",
        displayName: "Task Counter",
        version: "1.0.0",
        engines: { eidos: ">=0.33.0 <1.0.0" },
        entrypoints: {
          worker: "src/extension.ts",
          ui: "src/panel.ts",
        },
        contributes: {
          commands: [
            { id: "example.task-counter.count", title: "Count tasks" },
          ],
          panels: [
            {
              id: "example.task-counter.summary",
              displayName: "Task Summary",
            },
          ],
        },
        permissions: {
          files: { read: [], write: [] },
          network: [],
        },
      })
    )
    await writeFile(
      path.join(packageRoot, "src", "panel.ts"),
      [
        'import type { ExtensionPanelContext } from "@eidos.space/extension-sdk"',
        "export function activate(context: ExtensionPanelContext) {",
        "  context.root.textContent = JSON.stringify(context.state)",
        "}",
      ].join("\n")
    )
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const send = vi.fn()
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    let invocation = 0
    const execute = vi.fn(async (execution: FileExtensionRuntimeExecution) => {
      invocation += 1
      expect(execution.descriptor.panelIds).toEqual([
        "example.task-counter.summary",
      ])
      await execution.handleRpc({
        type: "rpc",
        requestId: `panel-${invocation}`,
        method: "window.openPanel",
        params: {
          panelId: "example.task-counter.summary",
          state: { pending: invocation, completed: 2 },
        },
      })
    })
    const runtimeManager = {
      ...runtimeManagerStub(),
      execute,
    } as unknown as FileExtensionRuntimeManager
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManager
    )
    const extension = (await service.discover("space-a")).packages[0]!
    const snapshot = {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    }
    await service.trust("space-a", snapshot)
    await service.setEnabled("space-a", snapshot, true)

    const request = {
      ...snapshot,
      commandId: "example.task-counter.count",
      resource: { path: "" },
    }
    await service.executeCommand("space-a", request)
    const firstEvent = send.mock.calls.find(
      ([channel]) => channel === "file-extensions:open-panel"
    )?.[1]
    expect(firstEvent).toMatchObject({
      spaceId: "space-a",
      title: "Task Summary",
      revision: 1,
    })
    expect(JSON.stringify(firstEvent)).not.toContain("pending")
    const first = await service.getPanelSession("space-a", {
      sessionId: firstEvent.sessionId,
    })
    expect(first).toMatchObject({
      packageId: "example.task-counter",
      panelId: "example.task-counter.summary",
      revision: 1,
      state: { pending: 1, completed: 2 },
    })
    expect(first.source).toContain("__eidosStartSurface")

    await service.executeCommand("space-a", request)
    const panelEvents = send.mock.calls.filter(
      ([channel]) => channel === "file-extensions:open-panel"
    )
    expect(panelEvents).toHaveLength(2)
    expect(panelEvents[1]?.[1]).toMatchObject({
      sessionId: first.sessionId,
      revision: 2,
    })
    await expect(
      service.getPanelSession("space-a", { sessionId: first.sessionId })
    ).resolves.toMatchObject({
      revision: 2,
      state: { pending: 2, completed: 2 },
    })

    expect(
      service.closePanelSession("space-a", { sessionId: first.sessionId })
    ).toEqual({ success: true })
    await expect(
      service.getPanelSession("space-a", { sessionId: first.sessionId })
    ).rejects.toThrow("session is unavailable")
    service.stopWatching("space-a")
  })

  it("returns sanitized, inspection-only discovery for a file Space", async () => {
    const root = await createFileSpace()
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )

    const result = await service.discover("space-a")

    expect(result).toMatchObject({
      root: ".eidos/extensions",
      phase: "runtime-preview",
      executionAvailable: true,
      hostVersion: "0.33.0",
      packages: [
        {
          directoryName: "example.task-counter",
          canonicalId: "example.task-counter",
          status: "ready",
          lifecycleStatus: "untrusted",
          localState: { trusted: false, enabled: false },
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain(root)

    await expect(service.startWatching("space-a")).resolves.toMatchObject({
      watching: true,
      generation: 0,
    })
    expect(service.stopWatching("space-a")).toEqual({
      watching: false,
      generation: 0,
    })
  })

  it("rejects missing and legacy database Spaces before touching disk", async () => {
    const registry = {
      getSpace: vi.fn().mockReturnValueOnce(undefined).mockReturnValueOnce({
        id: "legacy",
        name: "Legacy",
        path: "/not/read",
        mode: "legacy",
      }),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )

    await expect(service.discover("missing")).rejects.toThrow("Space not found")
    await expect(service.discover("legacy")).rejects.toThrow(
      "only available in file Spaces"
    )
  })

  it("creates a local template as real package files without overwriting", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
    roots.push(root)
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )

    await expect(
      service.createTemplate("space-a", {
        name: "hello-tools",
        template: "command",
      })
    ).resolves.toEqual({
      canonicalId: "local.hello-tools",
      root: ".eidos/extensions/local.hello-tools",
      files: ["extension.json", "src/extension.ts", "README.md"],
    })
    const packageRoot = path.join(
      root,
      ".eidos",
      "extensions",
      "local.hello-tools"
    )
    expect(
      JSON.parse(
        await readFile(path.join(packageRoot, "extension.json"), "utf8")
      )
    ).toMatchObject({
      publisher: "local",
      name: "hello-tools",
      engines: { eidos: ">=0.33.0" },
    })
    expect(
      await readFile(path.join(packageRoot, "src", "extension.ts"), "utf8")
    ).toContain("local.hello-tools.hello")
    await expect(service.discover("space-a")).resolves.toMatchObject({
      packages: [
        {
          canonicalId: "local.hello-tools",
          status: "ready",
        },
      ],
    })

    await expect(
      service.createTemplate("space-a", {
        name: "notes-editor",
        template: "text-editor",
        filenamePattern: "  **/*.tasks.md  ",
        mediaType: " text/markdown ",
      })
    ).resolves.toEqual({
      canonicalId: "local.notes-editor",
      root: ".eidos/extensions/local.notes-editor",
      files: ["extension.json", "src/editor.ts", "src/editor.css", "README.md"],
    })
    const editorRoot = path.join(
      root,
      ".eidos",
      "extensions",
      "local.notes-editor"
    )
    expect(
      JSON.parse(
        await readFile(path.join(editorRoot, "extension.json"), "utf8")
      )
    ).toMatchObject({
      publisher: "local",
      name: "notes-editor",
      entrypoints: { ui: "src/editor.ts" },
      contributes: {
        fileEditors: [
          {
            id: "local.notes-editor.editor",
            selector: [
              {
                filenamePattern: "**/*.tasks.md",
                mediaType: "text/markdown",
              },
            ],
          },
        ],
      },
      permissions: {
        files: {
          read: ["**/*.tasks.md"],
          write: ["**/*.tasks.md"],
        },
      },
    })
    expect(
      await readFile(path.join(editorRoot, "src", "editor.ts"), "utf8")
    ).toContain("context.document.applyEdits")
    await expect(
      service.createTemplate("space-a", {
        name: "task-panel",
        template: "panel",
      })
    ).resolves.toEqual({
      canonicalId: "local.task-panel",
      root: ".eidos/extensions/local.task-panel",
      files: [
        "extension.json",
        "src/extension.ts",
        "src/panel.ts",
        "src/panel.css",
        "README.md",
      ],
    })
    const panelRoot = path.join(
      root,
      ".eidos",
      "extensions",
      "local.task-panel"
    )
    expect(
      JSON.parse(await readFile(path.join(panelRoot, "extension.json"), "utf8"))
    ).toMatchObject({
      entrypoints: {
        worker: "src/extension.ts",
        ui: "src/panel.ts",
      },
      contributes: {
        panels: [{ id: "local.task-panel.summary" }],
      },
    })
    await expect(
      service.createTemplate("space-a", {
        name: "hello-tools",
        template: "command",
      })
    ).rejects.toThrow("already exists")
    await expect(
      service.createTemplate("space-a", {
        name: "Bad Name",
        template: "command",
      })
    ).rejects.toThrow("Extension name")
    await expect(
      service.createTemplate("space-a", {
        name: "bad-template",
        template: "widget",
      } as unknown as FileExtensionTemplateRequest)
    ).rejects.toThrow("must be command, panel, or text-editor")
    await expect(
      service.createTemplate("space-a", {
        name: "bad-pattern",
        template: "text-editor",
        filenamePattern: 42,
      } as unknown as FileExtensionTemplateRequest)
    ).rejects.toThrow("File pattern must be a string")
  })

  it("binds GitHub preview, apply, cancellation, and uninstall to the current Space", async () => {
    const root = await createFileSpace()
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const runtimeManager = runtimeManagerStub()
    const preview = {
      previewId: "preview-a",
      expiresAt: Date.now() + 60_000,
      operation: "update" as const,
      canonicalId: "example.task-counter",
      displayName: "Task Counter",
      version: "1.1.0",
      source: {
        kind: "github" as const,
        repository: "https://github.com/example/task-counter",
        requested: "refs/heads/main",
        commit: "a".repeat(40),
      },
      contentDigest: `sha256:${"b".repeat(64)}`,
      permissionHash: `sha256:${"c".repeat(64)}`,
      fileCount: 3,
      fileChanges: [
        {
          path: "src/extension.ts",
          kind: "modified" as const,
          beforeSize: 10,
          afterSize: 12,
        },
      ],
      permissionChanges: [],
    }
    const installManager = {
      prepare: vi.fn(async () => preview),
      apply: vi.fn(async () => ({
        canonicalId: preview.canonicalId,
        operation: preview.operation,
        root: `.eidos/extensions/${preview.canonicalId}` as const,
        contentDigest: preview.contentDigest,
        permissionHash: preview.permissionHash,
      })),
      cancel: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
    } as unknown as FileExtensionInstallManager
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManager,
      installManager
    )

    await expect(
      service.prepareGitHubInstall("space-a", {
        repository: "example/task-counter",
        requested: "refs/heads/main",
      })
    ).resolves.toBe(preview)
    await expect(
      service.applyGitHubInstall("space-a", {
        previewId: preview.previewId,
        contentDigest: preview.contentDigest,
        permissionHash: preview.permissionHash,
      })
    ).resolves.toMatchObject({ canonicalId: preview.canonicalId })
    expect(runtimeManager.disposePackage).toHaveBeenCalledWith(
      "space-a",
      preview.canonicalId,
      expect.stringContaining("installed")
    )

    await expect(
      service.cancelGitHubInstall("space-a", "preview-b")
    ).resolves.toEqual({ success: true })
    expect(installManager.cancel).toHaveBeenCalledWith("space-a", "preview-b")

    const installed = (await service.discover("space-a")).packages[0]
    await expect(
      service.uninstall("space-a", {
        directoryName: installed.directoryName,
        canonicalId: installed.canonicalId,
        contentDigest: installed.contentDigest!,
      })
    ).resolves.toEqual({ success: true })
    expect(installManager.uninstall).toHaveBeenCalledWith(
      root,
      expect.objectContaining({ directoryName: "example.task-counter" }),
      "0.33.0"
    )
  })

  it("serializes concurrent creation of the same package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
    roots.push(root)
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )

    const results = await Promise.allSettled([
      service.createTemplate("space-a", {
        name: "same-name",
        template: "command",
      }),
      service.createTemplate("space-a", {
        name: "same-name",
        template: "command",
      }),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
  })

  it("binds trust, grants, and enablement to the inspected snapshot", async () => {
    const root = await createFileSpace()
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )
    const initial = await service.discover("space-a")
    const extension = initial.packages[0]
    const snapshot = {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    }

    await expect(service.trust("space-a", snapshot)).resolves.toMatchObject({
      trusted: true,
      enabled: false,
    })
    await expect(
      service.setGrant("space-a", {
        ...snapshot,
        grant: { kind: "files.read", value: "**/*.md" },
        granted: true,
      })
    ).resolves.toMatchObject({
      granted: [{ kind: "files.read", value: "**/*.md" }],
    })
    await expect(
      service.setEnabled("space-a", snapshot, true)
    ).resolves.toMatchObject({ trusted: true, enabled: true })
    await expect(service.discover("space-a")).resolves.toMatchObject({
      packages: [
        {
          lifecycleStatus: "enabled",
          localState: {
            trusted: true,
            enabled: true,
            granted: [{ kind: "files.read", value: "**/*.md" }],
          },
        },
      ],
    })

    const sourcePath = path.join(
      root,
      ".eidos",
      "extensions",
      "example.task-counter",
      "src",
      "extension.ts"
    )
    await writeFile(sourcePath, "export const activate = () => 'changed'\n")
    await expect(service.discover("space-a")).resolves.toMatchObject({
      packages: [
        {
          lifecycleStatus: "untrusted",
          localState: { trusted: false, enabled: false, granted: [] },
        },
      ],
    })
    await expect(
      service.setEnabled("space-a", snapshot, false)
    ).rejects.toThrow("package changed")
  })

  it("runs source-only changes inside an in-memory development session", async () => {
    const root = await createFileSpace()
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
      getSpaceByPath: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
      getAllSpaces: vi.fn(() => []),
    } as unknown as SpaceRegistry
    const send = vi.fn()
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const runtimeManager = runtimeManagerStub()
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManager
    )
    const extension = (await service.discover("space-a")).packages[0]!
    const anchor = {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    }
    await service.trust("space-a", anchor)
    await service.setGrant("space-a", {
      ...anchor,
      grant: { kind: "files.read", value: "**/*.md" },
      granted: true,
    })
    await service.setEnabled("space-a", anchor, true)

    const session = await service.startDevelopmentSession("space-a", anchor)
    expect(session).toMatchObject({
      anchorSnapshot: anchor,
      currentSnapshot: anchor,
      status: "ready",
      granted: [{ kind: "files.read", value: "**/*.md" }],
    })

    const sourcePath = path.join(
      root,
      ".eidos",
      "extensions",
      "example.task-counter",
      "src",
      "extension.ts"
    )
    await writeFile(sourcePath, "export const activate = () => 'changed'\n")
    await vi.waitFor(
      () => {
        const ready = send.mock.calls.find(
          ([channel, event]) =>
            channel === "file-extensions:development-changed" &&
            event.packageId === anchor.packageId &&
            event.sessionId === session.sessionId &&
            event.status === "ready" &&
            event.generation > session.generation
        )
        expect(ready).toBeDefined()
      },
      { timeout: WATCH_EVENT_TIMEOUT_MS }
    )

    const changed = (await service.discover("space-a")).packages[0]!
    expect(changed.contentDigest).not.toBe(anchor.contentDigest)
    expect(changed).toMatchObject({
      lifecycleStatus: "untrusted",
      localState: { trusted: false, enabled: false, granted: [] },
      developmentSession: {
        sessionId: session.sessionId,
        status: "ready",
        anchorSnapshot: anchor,
        currentSnapshot: {
          contentDigest: changed.contentDigest,
          permissionHash: anchor.permissionHash,
        },
      },
    })
    await expect(service.listCommands("space-a")).resolves.toMatchObject([
      {
        packageId: anchor.packageId,
        contentDigest: changed.contentDigest,
      },
    ])

    await expect(
      service.stopDevelopmentSession("space-a", {
        packageId: anchor.packageId,
        sessionId: session.sessionId,
      })
    ).resolves.toEqual({ success: true })
    await expect(service.listCommands("space-a")).resolves.toEqual([])
    service.stopWatching("space-a")
  })

  it("blocks permission changes during development without inheriting grants", async () => {
    const root = await createFileSpace()
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const send = vi.fn()
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )
    const extension = (await service.discover("space-a")).packages[0]!
    const anchor = {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    }
    await service.trust("space-a", anchor)
    await service.setGrant("space-a", {
      ...anchor,
      grant: { kind: "files.read", value: "**/*.md" },
      granted: true,
    })
    await service.setEnabled("space-a", anchor, true)
    const session = await service.startDevelopmentSession("space-a", anchor)

    const manifestPath = path.join(
      root,
      ".eidos",
      "extensions",
      "example.task-counter",
      "extension.json"
    )
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    manifest.permissions.network = ["https://example.com"]
    await writeFile(manifestPath, JSON.stringify(manifest))

    await vi.waitFor(
      () => {
        expect(send).toHaveBeenCalledWith(
          "file-extensions:development-changed",
          expect.objectContaining({
            sessionId: session.sessionId,
            status: "permissions-changed",
          })
        )
      },
      { timeout: WATCH_EVENT_TIMEOUT_MS }
    )
    await expect(service.listCommands("space-a")).resolves.toEqual([])
    await expect(
      service.setGrant("space-a", {
        ...anchor,
        grant: { kind: "files.read", value: "**/*.md" },
        granted: false,
      })
    ).rejects.toThrow("Stop the extension development session")
    await service.stopDevelopmentSession("space-a", {
      packageId: anchor.packageId,
      sessionId: session.sessionId,
    })
    service.stopWatching("space-a")
  })

  it("reports compile failures and automatically recovers after the source is fixed", async () => {
    const root = await createFileSpace()
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const send = vi.fn()
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )
    const extension = (await service.discover("space-a")).packages[0]!
    const anchor = {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    }
    await service.trust("space-a", anchor)
    await service.setEnabled("space-a", anchor, true)
    const session = await service.startDevelopmentSession("space-a", anchor)
    const sourcePath = path.join(
      root,
      ".eidos",
      "extensions",
      "example.task-counter",
      "src",
      "extension.ts"
    )

    await writeFile(sourcePath, "export const activate = (\n")
    let invalidGeneration = 0
    await vi.waitFor(
      () => {
        const invalid = send.mock.calls.find(
          ([channel, event]) =>
            channel === "file-extensions:development-changed" &&
            event.sessionId === session.sessionId &&
            event.status === "invalid" &&
            ["compile", "inspection"].includes(event.diagnostics?.[0]?.code)
        )?.[1]
        expect(invalid).toBeDefined()
        invalidGeneration = invalid.generation
      },
      { timeout: WATCH_EVENT_TIMEOUT_MS }
    )
    await expect(service.listCommands("space-a")).resolves.toEqual([])

    await writeFile(sourcePath, "export const activate = () => 'fixed'\n")
    await vi.waitFor(
      () => {
        const ready = send.mock.calls.find(
          ([channel, event]) =>
            channel === "file-extensions:development-changed" &&
            event.sessionId === session.sessionId &&
            event.status === "ready" &&
            event.generation > invalidGeneration
        )
        expect(ready).toBeDefined()
      },
      { timeout: WATCH_EVENT_TIMEOUT_MS }
    )
    await expect(service.listCommands("space-a")).resolves.toHaveLength(1)
    await service.stopDevelopmentSession("space-a", {
      packageId: anchor.packageId,
      sessionId: session.sessionId,
    })
    service.stopWatching("space-a")
  })

  it("invalidates only the changed package when the watcher identifies it", async () => {
    const root = await createFileSpace()
    const secondRoot = path.join(
      root,
      ".eidos",
      "extensions",
      "example.note-counter"
    )
    await mkdir(path.join(secondRoot, "src"), { recursive: true })
    await writeFile(
      path.join(secondRoot, "extension.json"),
      JSON.stringify({
        manifestVersion: 1,
        publisher: "example",
        name: "note-counter",
        displayName: "Note Counter",
        version: "1.0.0",
        engines: { eidos: ">=0.33.0 <1.0.0" },
        entrypoints: { worker: "src/extension.ts" },
        contributes: {
          commands: [
            { id: "example.note-counter.count", title: "Count notes" },
          ],
        },
        permissions: { files: { read: [], write: [] }, network: [] },
      })
    )
    await writeFile(
      path.join(secondRoot, "src", "extension.ts"),
      "export const activate = () => undefined\n"
    )
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const send = vi.fn()
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const runtimeManager = runtimeManagerStub()
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManager
    )
    const packages = (await service.discover("space-a")).packages
    const sessions = []
    for (const extension of packages) {
      const snapshot = {
        packageId: extension.canonicalId!,
        contentDigest: extension.contentDigest!,
        permissionHash: extension.permissionHash!,
      }
      await service.trust("space-a", snapshot)
      await service.setEnabled("space-a", snapshot, true)
      sessions.push(await service.startDevelopmentSession("space-a", snapshot))
    }
    send.mockClear()
    vi.mocked(runtimeManager.disposePackage).mockClear()
    vi.mocked(runtimeManager.disposeSpace).mockClear()

    const ignoredRoot = path.join(
      root,
      ".eidos",
      "extensions",
      "example.task-counter",
      "node_modules",
      "dependency"
    )
    await mkdir(ignoredRoot, { recursive: true })
    await writeFile(path.join(ignoredRoot, "index.js"), "generated\n")
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(runtimeManager.disposePackage).not.toHaveBeenCalled()
    expect(runtimeManager.disposeSpace).not.toHaveBeenCalled()

    await writeFile(
      path.join(
        root,
        ".eidos",
        "extensions",
        "example.task-counter",
        "src",
        "extension.ts"
      ),
      "export const activate = () => 'changed'\n"
    )
    await vi.waitFor(
      () => {
        expect(send).toHaveBeenCalledWith(
          "file-extensions:development-changed",
          expect.objectContaining({
            packageId: "example.task-counter",
            status: "ready",
            generation: expect.any(Number),
          })
        )
      },
      { timeout: WATCH_EVENT_TIMEOUT_MS }
    )
    const invalidatedPackages = vi
      .mocked(runtimeManager.disposePackage)
      .mock.calls.map(([, packageId]) => packageId)
    expect(invalidatedPackages).toContain("example.task-counter")
    expect(invalidatedPackages).not.toContain("example.note-counter")
    expect(runtimeManager.disposeSpace).not.toHaveBeenCalled()

    for (const session of sessions) {
      await service.stopDevelopmentSession("space-a", {
        packageId: session.packageId,
        sessionId: session.sessionId,
      })
    }
    service.stopWatching("space-a")
  })

  it("clears development sessions and Workers through the shared app lifecycle", async () => {
    const root = await createFileSpace()
    const space = {
      id: "space-a",
      name: "Space A",
      path: root,
      mode: "file" as const,
    }
    const registry = {
      getSpace: vi.fn(() => space),
      getSpaceByPath: vi.fn(() => space),
      getAllSpaces: vi.fn(() => [space]),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const runtimeManager = runtimeManagerStub()
    const register = vi.fn()
    const resourceLifecycle = {
      register,
    } as unknown as SpaceResourceLifecycle
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManager,
      undefined,
      undefined,
      undefined,
      resourceLifecycle
    )
    const extension = (await service.discover("space-a")).packages[0]!
    const anchor = {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    }
    await service.trust("space-a", anchor)
    await service.setEnabled("space-a", anchor, true)
    await service.startDevelopmentSession("space-a", anchor)

    expect(register).toHaveBeenCalledWith(
      "file-extensions",
      expect.any(Function),
      expect.any(Function)
    )
    const cleanup = register.mock.calls[0]![2] as () => Promise<void>
    await cleanup()

    expect(runtimeManager.disposeAll).toHaveBeenCalledWith(
      "Eidos is shutting down"
    )
    await expect(service.discover("space-a")).resolves.toMatchObject({
      packages: [{ developmentSession: undefined }],
    })
  })

  it("keeps local trust isolated between Spaces with identical packages", async () => {
    const firstRoot = await createFileSpace()
    const secondRoot = await createFileSpace()
    const registry = {
      getSpace: vi.fn((spaceId: string) => ({
        id: spaceId,
        name: spaceId,
        path: spaceId === "space-a" ? firstRoot : secondRoot,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )
    const extension = (await service.discover("space-a")).packages[0]
    await service.trust("space-a", {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    })

    await expect(service.discover("space-a")).resolves.toMatchObject({
      packages: [{ lifecycleStatus: "disabled" }],
    })
    await expect(service.discover("space-b")).resolves.toMatchObject({
      packages: [{ lifecycleStatus: "untrusted" }],
    })
  })

  it("rejects an extensions path that escapes through .eidos", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
    const outside = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
    roots.push(root, outside)
    await mkdir(path.join(outside, "extensions"))
    await symlink(outside, path.join(root, ".eidos"), "dir")
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )

    await expect(service.discover("space-a")).rejects.toThrow("symbolic link")
    await expect(service.startWatching("space-a")).resolves.toMatchObject({
      watching: false,
      reason: "invalid-root",
    })
    await expect(
      service.createTemplate("space-a", {
        name: "hello-tools",
        template: "command",
      })
    ).rejects.toThrow("symbolic link")
  })

  it("rejects a private state path that escapes through a symbolic link", async () => {
    const root = await createFileSpace()
    const outside = await mkdtemp(path.join(tmpdir(), "eidos-file-extension-"))
    roots.push(outside)
    await symlink(outside, path.join(root, ".eidos", "state"), "dir")
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => undefined,
    } as unknown as MainWindowProvider
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManagerStub()
    )

    await expect(service.discover("space-a")).rejects.toThrow("symbolic link")
  })

  it("lists enabled commands and gates readText on the exact granted snapshot", async () => {
    const root = await createFileSpace()
    await writeFile(path.join(root, "tasks.md"), "- [ ] open\n- [x] complete\n")
    const registry = {
      getSpace: vi.fn(() => ({
        id: "space-a",
        name: "Space A",
        path: root,
        mode: "file",
      })),
    } as unknown as SpaceRegistry
    const send = vi.fn()
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const runtimeManager = runtimeManagerStub()
    let runtimeExecution: FileExtensionRuntimeExecution | undefined
    vi.mocked(runtimeManager.execute).mockImplementation(async (execution) => {
      runtimeExecution = execution
    })
    const { FileExtensionService } = await import("./file-extension.service")
    const service = new FileExtensionService(
      registry,
      windowProvider,
      runtimeManager
    )
    const extension = (await service.discover("space-a")).packages[0]!
    const snapshot = {
      packageId: extension.canonicalId!,
      contentDigest: extension.contentDigest!,
      permissionHash: extension.permissionHash!,
    }
    await service.trust("space-a", snapshot)
    await service.setGrant("space-a", {
      ...snapshot,
      grant: { kind: "files.read", value: "**/*.md" },
      granted: true,
    })
    await service.setEnabled("space-a", snapshot, true)

    await expect(service.listCommands("space-a")).resolves.toMatchObject([
      {
        id: "example.task-counter.count",
        title: "Count tasks",
        packageId: "example.task-counter",
      },
    ])
    await expect(
      service.executeCommand("space-a", {
        ...snapshot,
        commandId: "example.task-counter.count",
        resource: { path: "tasks.md" },
      })
    ).resolves.toEqual({ success: true })
    expect(runtimeExecution?.descriptor.snapshot).toEqual(snapshot)
    await expect(
      runtimeExecution?.handleRpc({
        type: "rpc",
        requestId: "read-1",
        method: "space.files.readText",
        params: { path: "tasks.md" },
      })
    ).resolves.toContain("[x] complete")
    await expect(
      runtimeExecution?.handleRpc({
        type: "rpc",
        requestId: "notice-1",
        method: "window.showNotice",
        params: { message: "2 open, 1 completed" },
      })
    ).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledWith(
      "file-extensions:semantic-ui",
      expect.objectContaining({
        kind: "notice",
        spaceId: "space-a",
        packageId: "example.task-counter",
        message: "2 open, 1 completed",
      })
    )

    const confirm = runtimeExecution?.handleRpc({
      type: "rpc",
      requestId: "confirm-1",
      method: "window.confirm",
      params: { title: "Continue?", message: "Count this file?" },
    })
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        "file-extensions:semantic-ui",
        expect.objectContaining({ kind: "confirm", title: "Continue?" })
      )
    )
    const confirmRequest = send.mock.calls.find(
      ([channel, payload]) =>
        channel === "file-extensions:semantic-ui" && payload.kind === "confirm"
    )?.[1]
    expect(confirmRequest?.id).toEqual(expect.any(String))
    expect(
      service.resolveSemanticUi("space-a", {
        requestId: confirmRequest.id,
        value: true,
      })
    ).toEqual({ success: true })
    await expect(confirm).resolves.toBe(true)
    await expect(
      runtimeExecution?.handleRpc({
        type: "rpc",
        requestId: "read-private",
        method: "space.files.readText",
        params: { path: ".eidos/state/extensions.sqlite3" },
      })
    ).rejects.toMatchObject({ code: "CAPABILITY_DENIED" })

    await service.setGrant("space-a", {
      ...snapshot,
      grant: { kind: "files.read", value: "**/*.md" },
      granted: false,
    })
    await expect(
      runtimeExecution?.handleRpc({
        type: "rpc",
        requestId: "read-revoked",
        method: "space.files.readText",
        params: { path: "tasks.md" },
      })
    ).rejects.toMatchObject({ code: "CAPABILITY_DENIED" })
    expect(runtimeManager.disposePackage).toHaveBeenCalledWith(
      "space-a",
      "example.task-counter",
      "Extension permission grants changed"
    )
  })
})
