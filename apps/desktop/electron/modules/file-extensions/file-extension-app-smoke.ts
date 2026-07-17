import "reflect-metadata"

import assert from "node:assert/strict"
import { gzipSync } from "node:zlib"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { app, BrowserWindow, session } from "electron"
import { createEidosFile } from "@eidos.space/eidos-file/better-sqlite3"
import {
  createExtensionEidosFileViewTemplate,
  createExtensionPanelTemplate,
} from "@eidos.space/extension-manifest"
import { extensionSurfaceDataUrl } from "@eidos.space/extension-runtime/surface"
import {
  EXTENSION_SURFACE_BOOTSTRAP_CHANNEL,
  EXTENSION_SURFACE_PROTOCOL_VERSION,
  type ExtensionEidosFileViewContextSnapshot,
  type ExtensionJsonValue,
  type ExtensionSurfaceAppearance,
} from "@eidos.space/extension-surface-protocol"

import type { MainWindowProvider } from "../space-management/main-window.provider"
import type { SpaceRegistry } from "../space-management/space-registry"
import { FileExtensionService } from "./file-extension.service"
import { ElectronFileExtensionRuntimeTransportFactory } from "./runtime/electron-runtime-transport"
import { FileExtensionRuntimeManager } from "./runtime/file-extension-runtime-manager"

const SPACE_ID = "file-extension-app-smoke"
const COMMIT = "a".repeat(40)
const PANEL_PACKAGE_PATH = "packages/lifecycle-panel"
const BASE_VIEW_PACKAGE_PATH = "packages/lifecycle-eidos-file-view"

const SMOKE_APPEARANCE: ExtensionSurfaceAppearance = {
  colorScheme: "light",
  locale: "en",
  theme: {
    background: "rgb(255, 255, 255)",
    foreground: "rgb(17, 24, 39)",
    mutedBackground: "rgb(249, 250, 251)",
    mutedForeground: "rgb(107, 114, 128)",
    border: "rgb(209, 213, 219)",
    accent: "rgb(37, 99, 235)",
    accentForeground: "rgb(255, 255, 255)",
    destructive: "rgb(220, 38, 38)",
    destructiveForeground: "rgb(255, 255, 255)",
    focusRing: "rgb(59, 130, 246)",
    fontFamily: "system-ui, sans-serif",
    monoFontFamily: "ui-monospace, monospace",
  },
}

interface SentEvent {
  channel: string
  payload: unknown
}

function asPlainJsonObject(
  value: ExtensionJsonValue | undefined
): Record<string, ExtensionJsonValue> {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    "Expected extension state to be a JSON object"
  )
  return { ...value }
}

function writeString(
  buffer: Buffer,
  offset: number,
  length: number,
  value: string
): void {
  const encoded = Buffer.from(value)
  assert.ok(encoded.byteLength <= length, `tar field is too long: ${value}`)
  encoded.copy(buffer, offset)
}

function writeOctal(
  buffer: Buffer,
  offset: number,
  length: number,
  value: number
): void {
  writeString(
    buffer,
    offset,
    length,
    `${value.toString(8).padStart(length - 1, "0")}\0`
  )
}

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512)
  writeString(header, 0, 100, name)
  writeOctal(header, 100, 8, 0o644)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  writeString(header, 156, 1, "0")
  writeString(header, 257, 6, "ustar\0")
  writeString(header, 263, 2, "00")
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `)
  return header
}

function githubArchive(files: Record<string, string>): Uint8Array {
  const root = `example-eidos-extensions-${COMMIT.slice(0, 8)}`
  const chunks: Buffer[] = []
  for (const [relativePath, source] of Object.entries(files).sort(
    ([left], [right]) => left.localeCompare(right)
  )) {
    const content = Buffer.from(source)
    chunks.push(
      tarHeader(`${root}/${relativePath}`, content.byteLength),
      content
    )
    const remainder = content.byteLength % 512
    if (remainder) chunks.push(Buffer.alloc(512 - remainder))
  }
  chunks.push(Buffer.alloc(1024))
  return new Uint8Array(gzipSync(Buffer.concat(chunks)))
}

function githubFetch(archive: Uint8Array): typeof globalThis.fetch {
  return async (input) => {
    const url = String(input)
    if (url.includes("/commits/")) {
      return new Response(JSON.stringify({ sha: COMMIT }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.endsWith(`/tarball/${COMMIT}`)) {
      return new Response(Uint8Array.from(archive).buffer, {
        status: 200,
        headers: { "content-type": "application/gzip" },
      })
    }
    return new Response("not found", { status: 404 })
  }
}

async function prepareGitHubPackage(
  service: FileExtensionService,
  archive: Uint8Array,
  subdirectory: string
) {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = githubFetch(archive)
    return await service.prepareGitHubInstall(SPACE_ID, {
      repository: "example/eidos-extensions",
      requested: "v0.1.0",
      subdirectory,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function waitForValue<T>(
  load: () => Promise<T | undefined>,
  message: string,
  timeoutMs = 15_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await load()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}

async function renderInstalledEidosFileView({
  source,
  generation,
  packageId,
  eidosFileViewId,
  viewId,
  context,
  page,
}: {
  source: string
  generation: string
  packageId: string
  eidosFileViewId: string
  viewId: string
  context: ExtensionEidosFileViewContextSnapshot
  page: {
    offset: number
    limit: number
    total: number
    rows: Array<Record<string, string | number | boolean | null>>
  }
}) {
  const runtimeSession = session.fromPartition(
    `eidos-file-extension-app-eidos-file-view-${Date.now()}`,
    { cache: false }
  )
  runtimeSession.setPermissionCheckHandler(() => false)
  runtimeSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false)
  )
  runtimeSession.webRequest.onBeforeRequest(
    {
      urls: [
        "http://*/*",
        "https://*/*",
        "file://*/*",
        "ws://*/*",
        "wss://*/*",
      ],
    },
    (_details, callback) => callback({ cancel: true })
  )
  const runtimeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      session: runtimeSession,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: false,
    },
  })
  runtimeWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  const initialize = {
    type: "initialize",
    surfaceKind: "eidos-file-view",
    protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
    packageId,
    generation,
    eidosFileViewId,
    viewId,
    context,
    appearance: SMOKE_APPEARANCE,
  }

  try {
    await runtimeWindow.loadURL(extensionSurfaceDataUrl())
    return (await runtimeWindow.webContents.executeJavaScript(
      `new Promise((resolve, reject) => {
        const source = ${JSON.stringify(source)};
        const generation = ${JSON.stringify(generation)};
        const initialize = ${JSON.stringify(initialize)};
        const page = ${JSON.stringify(page)};
        const channel = new MessageChannel();
        const port = channel.port1;
        const surfaceLogs = [];
        let activated = false;
        let pageLoaded = false;
        let settled = false;
        const timeout = setTimeout(
          () => fail(new Error("Installed Eidos File view timed out")),
          10000
        );
        const fail = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { port.close(); } catch {}
          reject(error);
        };
        const finish = () => {
          if (settled || !activated || !pageLoaded) return;
          setTimeout(() => {
            try {
              const title = document.querySelector("header strong");
              const cards = Array.from(
                document.querySelectorAll(".record-grid article")
              );
              const cssLoaded = Array.from(
                document.querySelectorAll("style")
              ).some((style) => style.textContent?.includes(".record-grid"));
              if (title?.textContent !== initialize.context.table.name) {
                throw new Error("Installed Eidos File view did not render its table");
              }
              if (cards.length !== page.rows.length) {
                throw new Error("Installed Eidos File view did not render its rows");
              }
              settled = true;
              clearTimeout(timeout);
              try { port.close(); } catch {}
              resolve({
                title: title.textContent,
                cards: cards.map((card) => card.textContent),
                cssLoaded,
                surfaceLogs,
                networkGlobalsBlocked:
                  typeof fetch === "undefined" &&
                  typeof XMLHttpRequest === "undefined",
              });
            } catch (error) {
              fail(error);
            }
          }, 0);
        };
        port.onmessage = (event) => {
          try {
            const message = event.data;
            if (message?.type === "activation-error") {
              throw new Error(
                "Installed Eidos File view activation failed: " + message.message
              );
            }
            if (message?.type === "surface-log") {
              surfaceLogs.push(message);
              return;
            }
            if (message?.type === "ready") {
              if (message.protocolVersion !== initialize.protocolVersion) {
                throw new Error("Installed Eidos File view protocol mismatch");
              }
              port.postMessage(initialize);
              return;
            }
            if (message?.type === "activated") {
              activated = true;
              finish();
              return;
            }
            if (message?.type !== "eidos-file-page-request") return;
            if (
              message.generation !== generation ||
              message.offset !== 0 ||
              message.limit !== 60
            ) {
              throw new Error("Installed Eidos File view requested an invalid page");
            }
            port.postMessage({
              type: "eidos-file-page-result",
              requestId: message.requestId,
              ok: true,
              page,
            });
            pageLoaded = true;
            finish();
          } catch (error) {
            fail(error);
          }
        };
        port.start();
        window.postMessage(
          {
            type: ${JSON.stringify(EXTENSION_SURFACE_BOOTSTRAP_CHANNEL)},
            source,
            generation,
          },
          "*",
          [channel.port2]
        );
      })`,
      true
    )) as {
      title: string
      cards: string[]
      cssLoaded: boolean
      surfaceLogs: Array<{
        generation: string
        level: "debug" | "info" | "log" | "warn" | "error"
        message: string
      }>
      networkGlobalsBlocked: boolean
    }
  } finally {
    if (!runtimeWindow.isDestroyed()) runtimeWindow.destroy()
    await runtimeSession.clearStorageData()
  }
}

async function renderDevelopmentPanel({
  source,
  generation,
  packageId,
  panelId,
  sessionId,
  state,
}: {
  source: string
  generation: string
  packageId: string
  panelId: string
  sessionId: string
  state?: ExtensionJsonValue
}) {
  const runtimeSession = session.fromPartition(
    `eidos-file-extension-app-panel-${Date.now()}`,
    { cache: false }
  )
  runtimeSession.setPermissionCheckHandler(() => false)
  runtimeSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false)
  )
  runtimeSession.webRequest.onBeforeRequest(
    {
      urls: [
        "http://*/*",
        "https://*/*",
        "file://*/*",
        "ws://*/*",
        "wss://*/*",
      ],
    },
    (_details, callback) => callback({ cancel: true })
  )
  const runtimeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      session: runtimeSession,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: false,
    },
  })
  runtimeWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  const initialize = {
    type: "initialize",
    surfaceKind: "panel",
    protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
    packageId,
    generation,
    panelId,
    sessionId,
    state,
    appearance: SMOKE_APPEARANCE,
  }

  try {
    await runtimeWindow.loadURL(extensionSurfaceDataUrl())
    return (await runtimeWindow.webContents.executeJavaScript(
      `new Promise((resolve, reject) => {
        const source = ${JSON.stringify(source)};
        const generation = ${JSON.stringify(generation)};
        const initialize = ${JSON.stringify(initialize)};
        const channel = new MessageChannel();
        const port = channel.port1;
        const surfaceLogs = [];
        let settled = false;
        const timeout = setTimeout(
          () => fail(new Error("Development panel timed out")),
          10000
        );
        const fail = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { port.close(); } catch {}
          reject(error);
        };
        port.onmessage = (event) => {
          try {
            const message = event.data;
            if (message?.type === "activation-error") {
              throw new Error(
                "Development panel activation failed: " + message.message
              );
            }
            if (message?.type === "surface-log") {
              surfaceLogs.push(message);
              return;
            }
            if (message?.type === "ready") {
              if (message.protocolVersion !== initialize.protocolVersion) {
                throw new Error("Development panel protocol mismatch");
              }
              port.postMessage(initialize);
              return;
            }
            if (message?.type !== "activated" || settled) return;
            setTimeout(() => {
              try {
                const marker = document.querySelector(
                  '[data-development-panel="version-two"]'
                );
                if (!marker) {
                  throw new Error("Development panel did not render new source");
                }
                settled = true;
                clearTimeout(timeout);
                try { port.close(); } catch {}
                resolve({
                  text: marker.textContent,
                  surfaceLogs,
                  networkGlobalsBlocked:
                    typeof fetch === "undefined" &&
                    typeof XMLHttpRequest === "undefined",
                });
              } catch (error) {
                fail(error);
              }
            }, 0);
          } catch (error) {
            fail(error);
          }
        };
        port.start();
        window.postMessage(
          {
            type: ${JSON.stringify(EXTENSION_SURFACE_BOOTSTRAP_CHANNEL)},
            source,
            generation,
          },
          "*",
          [channel.port2]
        );
      })`,
      true
    )) as {
      text: string
      surfaceLogs: Array<{
        generation: string
        level: "debug" | "info" | "log" | "warn" | "error"
        message: string
      }>
      networkGlobalsBlocked: boolean
    }
  } finally {
    if (!runtimeWindow.isDestroyed()) runtimeWindow.destroy()
    await runtimeSession.clearStorageData()
  }
}

async function run(): Promise<void> {
  await app.whenReady()
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "eidos-file-extension-app-smoke-")
  )
  const spacePath = path.join(temporaryRoot, "space")
  const events: SentEvent[] = []
  const space = {
    id: SPACE_ID,
    name: "Extension App Smoke",
    path: spacePath,
    mode: "file" as const,
  }
  const registry = {
    getSpace: (spaceId: string) => (spaceId === SPACE_ID ? space : null),
    getAllSpaces: () => [space],
    getSpaceByPath: (candidate: string) =>
      path.resolve(candidate) === path.resolve(spacePath) ? space : null,
  } as unknown as SpaceRegistry
  const windowProvider = {
    getWindow: () => ({
      webContents: {
        send: (channel: string, payload: unknown) => {
          events.push({ channel, payload })
        },
      },
    }),
  } as unknown as MainWindowProvider
  const runtimeManager = new FileExtensionRuntimeManager(
    new ElectronFileExtensionRuntimeTransportFactory()
  )
  const service = new FileExtensionService(
    registry,
    windowProvider,
    runtimeManager
  )

  try {
    await mkdir(spacePath, { recursive: true })
    await writeFile(
      path.join(spacePath, "tasks.md"),
      [
        "# Release tasks",
        "",
        "- [ ] Verify installation",
        "- [x] Grant permissions",
        "- [ ] Open the panel",
        "",
      ].join("\n")
    )

    const panelTemplate = createExtensionPanelTemplate({
      publisher: "example",
      name: "lifecycle-panel",
      engineRange: ">=0.0.0",
    })
    const eidosFileViewTemplate = createExtensionEidosFileViewTemplate({
      publisher: "example",
      name: "lifecycle-eidos-file-view",
      displayName: "Lifecycle Eidos File View",
      engineRange: ">=0.0.0",
    })
    const eidosFileViewContribution =
      eidosFileViewTemplate.manifest.contributes.eidosFileViews?.[0]
    assert.ok(
      eidosFileViewContribution,
      "Eidos File view template should declare its contribution"
    )

    const eidosFile = createEidosFile(path.join(spacePath, "tasks.eidos"), {
      title: "Release Tasks",
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [
          {
            name: "Status",
            columnName: "status",
            type: "select",
            property: {
              options: [
                { id: "doing", name: "Doing", color: "blue" },
                { id: "done", name: "Done", color: "green" },
              ],
            },
          },
        ],
      },
    })
    eidosFile.insertRow("tasks", {
      title: "Ship Eidos File views",
      status: "doing",
    })
    eidosFile.insertRow("tasks", {
      title: "Run app smoke",
      status: "done",
    })
    const savedView = eidosFile.createView("tasks", {
      name: "Extension Cards",
      type: `extension:${eidosFileViewContribution.id}`,
    })
    const eidosFileTable = eidosFile.getTable("tasks")
    const eidosFileFields = eidosFile.listFields("tasks")
    const rawEidosFilePage = eidosFile.getRowPage("tasks", 0, 60)
    const eidosFileContext: ExtensionEidosFileViewContextSnapshot = {
      resourcePath: "tasks.eidos",
      table: {
        id: eidosFileTable.id,
        name: eidosFileTable.name,
        rowCount: rawEidosFilePage.total,
      },
      view: { id: savedView.id, name: savedView.name },
      fields: eidosFileFields.map((field) => ({
        name: field.name,
        columnName: field.tableColumnName,
        type: field.type,
        property: null,
      })),
    }
    const eidosFilePage = {
      offset: rawEidosFilePage.offset,
      limit: rawEidosFilePage.limit,
      total: rawEidosFilePage.total,
      rows: rawEidosFilePage.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            typeof value === "bigint"
              ? value.toString()
              : value instanceof Uint8Array
                ? `[binary ${value.byteLength} bytes]`
                : value,
          ])
        )
      ) as Array<Record<string, string | number | boolean | null>>,
    }
    eidosFile.close()
    assert.equal(
      savedView.type,
      `extension:${eidosFileViewContribution.id}`,
      "Eidos File should persist the selected extension view type"
    )

    const archive = githubArchive(
      Object.fromEntries([
        ...panelTemplate.files.map(
          (file) =>
            [`${PANEL_PACKAGE_PATH}/${file.path}`, file.content] as const
        ),
        ...eidosFileViewTemplate.files.map(
          (file) =>
            [`${BASE_VIEW_PACKAGE_PATH}/${file.path}`, file.content] as const
        ),
      ])
    )

    const panelPreview = await prepareGitHubPackage(
      service,
      archive,
      PANEL_PACKAGE_PATH
    )
    assert.equal(panelPreview.operation, "install")
    assert.equal(panelPreview.canonicalId, panelTemplate.canonicalId)
    assert.equal(panelPreview.source.commit, COMMIT)
    const panelInstalled = await service.applyGitHubInstall(SPACE_ID, {
      previewId: panelPreview.previewId,
      contentDigest: panelPreview.contentDigest,
      permissionHash: panelPreview.permissionHash,
    })
    assert.equal(panelInstalled.canonicalId, panelTemplate.canonicalId)

    const panelSnapshot = {
      packageId: panelInstalled.canonicalId,
      contentDigest: panelInstalled.contentDigest,
      permissionHash: panelInstalled.permissionHash,
    }
    const panelTrusted = await service.trust(SPACE_ID, panelSnapshot)
    assert.equal(panelTrusted.trusted, true)
    assert.equal(panelTrusted.enabled, false)
    assert.deepEqual(panelTrusted.requestedGrants, [
      { kind: "files.read", value: "**/*.markdown" },
      { kind: "files.read", value: "**/*.md" },
    ])
    for (const grant of panelTrusted.requestedGrants) {
      await service.setGrant(SPACE_ID, {
        ...panelSnapshot,
        grant,
        granted: true,
      })
    }
    const panelEnabled = await service.setEnabled(SPACE_ID, panelSnapshot, true)
    assert.equal(panelEnabled.enabled, true)
    assert.deepEqual(panelEnabled.granted, panelTrusted.requestedGrants)

    const eidosFileViewPreview = await prepareGitHubPackage(
      service,
      archive,
      BASE_VIEW_PACKAGE_PATH
    )
    assert.equal(eidosFileViewPreview.operation, "install")
    assert.equal(
      eidosFileViewPreview.canonicalId,
      eidosFileViewTemplate.canonicalId
    )
    assert.equal(eidosFileViewPreview.source.commit, COMMIT)
    assert.deepEqual(
      eidosFileViewPreview.permissionChanges.map(({ kind, value, change }) => ({
        kind,
        value,
        change,
      })),
      [{ kind: "files.read", value: "**/*.eidos", change: "added" }]
    )
    const eidosFileViewInstalled = await service.applyGitHubInstall(SPACE_ID, {
      previewId: eidosFileViewPreview.previewId,
      contentDigest: eidosFileViewPreview.contentDigest,
      permissionHash: eidosFileViewPreview.permissionHash,
    })
    assert.equal(
      eidosFileViewInstalled.canonicalId,
      eidosFileViewTemplate.canonicalId
    )
    const eidosFileViewSnapshot = {
      packageId: eidosFileViewInstalled.canonicalId,
      contentDigest: eidosFileViewInstalled.contentDigest,
      permissionHash: eidosFileViewInstalled.permissionHash,
    }
    assert.deepEqual(
      await service.listEidosFileViews(SPACE_ID, "tasks.eidos"),
      [],
      "Untrusted Eidos File views must not be discoverable"
    )
    const eidosFileViewTrusted = await service.trust(
      SPACE_ID,
      eidosFileViewSnapshot
    )
    assert.deepEqual(eidosFileViewTrusted.requestedGrants, [
      { kind: "files.read", value: "**/*.eidos" },
    ])
    for (const grant of eidosFileViewTrusted.requestedGrants) {
      await service.setGrant(SPACE_ID, {
        ...eidosFileViewSnapshot,
        grant,
        granted: true,
      })
    }
    assert.deepEqual(
      await service.listEidosFileViews(SPACE_ID, "tasks.eidos"),
      [],
      "Disabled Eidos File views must not be discoverable"
    )
    const eidosFileViewEnabled = await service.setEnabled(
      SPACE_ID,
      eidosFileViewSnapshot,
      true
    )
    assert.equal(eidosFileViewEnabled.enabled, true)
    const discoveredEidosFileViews = await service.listEidosFileViews(
      SPACE_ID,
      "tasks.eidos"
    )
    assert.deepEqual(
      discoveredEidosFileViews.map(({ id, packageId, displayName }) => ({
        id,
        packageId,
        displayName,
      })),
      [
        {
          id: eidosFileViewContribution.id,
          packageId: eidosFileViewTemplate.canonicalId,
          displayName: eidosFileViewContribution.displayName,
        },
      ]
    )

    const palette = await service.listCommandPalette(SPACE_ID)
    assert.deepEqual(
      palette.commands.map((command) => command.id),
      [`${panelTemplate.canonicalId}.open-summary`]
    )
    assert.deepEqual(
      palette.panels.map((panel) => panel.id),
      [`${panelTemplate.canonicalId}.summary`]
    )

    await service.executeCommand(SPACE_ID, {
      ...panelSnapshot,
      commandId: `${panelTemplate.canonicalId}.open-summary`,
      resource: { path: "tasks.md" },
    })
    const panelEvent = events.find(
      (event) => event.channel === "file-extensions:open-panel"
    )?.payload as { sessionId?: string } | undefined
    assert.ok(panelEvent?.sessionId, "command should open its declared panel")
    const panel = await service.getPanelSession(SPACE_ID, {
      sessionId: panelEvent.sessionId,
    })
    assert.equal(panel.packageId, panelTemplate.canonicalId)
    assert.equal(panel.panelId, `${panelTemplate.canonicalId}.summary`)
    assert.equal(panel.title, "Lifecycle Panel")
    assert.ok(panel.state && typeof panel.state === "object")
    assert.deepEqual(
      { ...panel.state },
      {
        path: "tasks.md",
        total: 3,
        completed: 1,
        pending: 2,
      }
    )
    assert.match(panel.source, /__eidosStartSurface/)

    const openedEidosFileView = await service.openEidosFileView(SPACE_ID, {
      ...eidosFileViewSnapshot,
      eidosFileViewId: eidosFileViewContribution.id,
      path: "tasks.eidos",
    })
    assert.equal(
      openedEidosFileView.packageId,
      eidosFileViewTemplate.canonicalId
    )
    assert.equal(
      openedEidosFileView.eidosFileViewId,
      eidosFileViewContribution.id
    )
    assert.match(openedEidosFileView.source, /__eidosStartSurface/)
    const renderedEidosFileView = await renderInstalledEidosFileView({
      source: openedEidosFileView.source,
      generation: openedEidosFileView.generation,
      packageId: eidosFileViewSnapshot.packageId,
      eidosFileViewId: eidosFileViewContribution.id,
      viewId: savedView.id,
      context: eidosFileContext,
      page: eidosFilePage,
    })
    assert.equal(renderedEidosFileView.title, "Tasks")
    assert.equal(renderedEidosFileView.cards.length, 2)
    assert.ok(
      renderedEidosFileView.cards.some((card) =>
        card.includes("Ship Eidos File views")
      )
    )
    assert.ok(
      renderedEidosFileView.cards.some((card) => card.includes("Run app smoke"))
    )
    assert.equal(renderedEidosFileView.cssLoaded, true)
    assert.equal(renderedEidosFileView.networkGlobalsBlocked, true)
    assert.ok(
      renderedEidosFileView.surfaceLogs.some(
        (entry) =>
          entry.level === "info" &&
          entry.message.includes(
            "Lifecycle Eidos File View Eidos File view activated"
          )
      )
    )
    for (const entry of renderedEidosFileView.surfaceLogs) {
      await service.reportSurfaceOutput(SPACE_ID, {
        surfaceKind: "eidos-file-view",
        ...eidosFileViewSnapshot,
        generation: openedEidosFileView.generation,
        level: entry.level,
        message: entry.message,
      })
    }
    const discovery = await service.discover(SPACE_ID)
    const eidosFileViewSummary = discovery.packages.find(
      (candidate) => candidate.canonicalId === eidosFileViewTemplate.canonicalId
    )
    assert.ok(
      eidosFileViewSummary?.runtimeOutput.some(
        (entry) =>
          entry.source === "eidos-file-view" &&
          entry.message.includes(
            "Lifecycle Eidos File View Eidos File view activated"
          )
      ),
      "Installed Eidos File view logs should reach the extension runtime output"
    )

    const localTemplate = await service.createTemplate(SPACE_ID, {
      name: "development-loop",
      template: "command",
    })
    assert.equal(localTemplate.canonicalId, "local.development-loop")
    assert.deepEqual(localTemplate.files.sort(), [
      "README.md",
      "extension.json",
      "src/extension.ts",
    ])
    const localPackageRoot = path.join(
      spacePath,
      ".eidos",
      "extensions",
      localTemplate.canonicalId
    )
    const localSourcePath = path.join(localPackageRoot, "src", "extension.ts")
    await writeFile(
      path.join(localPackageRoot, "src", "style.css"),
      ".command { color: currentColor; }\n"
    )
    const localPackage = await waitForValue(
      async () =>
        (await service.discover(SPACE_ID)).packages.find(
          (candidate) => candidate.canonicalId === localTemplate.canonicalId
        ),
      "Created local extension was not discovered"
    )
    assert.equal(localPackage.lifecycleStatus, "untrusted")
    assert.ok(localPackage.contentDigest)
    assert.ok(localPackage.permissionHash)
    const localSnapshot = {
      packageId: localTemplate.canonicalId,
      contentDigest: localPackage.contentDigest,
      permissionHash: localPackage.permissionHash,
    }
    const localTrusted = await service.trust(SPACE_ID, localSnapshot)
    assert.equal(localTrusted.trusted, true)
    assert.deepEqual(localTrusted.requestedGrants, [])
    const localEnabled = await service.setEnabled(SPACE_ID, localSnapshot, true)
    assert.equal(localEnabled.enabled, true)

    const localCommandId = `${localTemplate.canonicalId}.hello`
    await service.executeCommand(SPACE_ID, {
      ...localSnapshot,
      commandId: localCommandId,
      resource: { path: "tasks.md" },
    })
    assert.ok(
      (await service.discover(SPACE_ID)).packages
        .find(
          (candidate) => candidate.canonicalId === localTemplate.canonicalId
        )
        ?.runtimeOutput.some(
          (entry) =>
            entry.source === "worker" &&
            entry.message.includes("Development Loop command invoked")
        ),
      "Created local command should execute before development starts"
    )

    const development = await service.startDevelopmentSession(
      SPACE_ID,
      localSnapshot
    )
    await writeFile(
      localSourcePath,
      'import "./style.css"\nexport const activate = () => undefined\n'
    )
    const failedDevelopment = await waitForValue(async () => {
      const candidate = (await service.discover(SPACE_ID)).packages.find(
        (entry) => entry.canonicalId === localTemplate.canonicalId
      )
      const session = candidate?.developmentSession
      return session?.status === "invalid" &&
        session.sessionId === development.sessionId &&
        session.diagnostics[0]?.code === "compile"
        ? session
        : undefined
    }, "Invalid local extension source did not produce a compile diagnostic")
    assert.equal(
      failedDevelopment.diagnostics[0]?.path,
      "src/style.css",
      "Compile diagnostics should identify the failing module"
    )
    await writeFile(
      localSourcePath,
      [
        'import type { ExtensionContext } from "@eidos.space/extension-sdk"',
        "",
        "export function activate(context: ExtensionContext) {",
        "  context.subscriptions.add(",
        "    context.commands.register(",
        `      ${JSON.stringify(localCommandId)},`,
        "      async (resource) => {",
        '        console.info("development-version-two", { path: resource.path })',
        '        context.window.showNotice("development-version-two")',
        "      }",
        "    )",
        "  )",
        "}",
        "",
      ].join("\n")
    )
    const reloadedLocalPackage = await waitForValue(async () => {
      const candidate = (await service.discover(SPACE_ID)).packages.find(
        (entry) => entry.canonicalId === localTemplate.canonicalId
      )
      const session = candidate?.developmentSession
      return session?.status === "ready" &&
        session.sessionId === development.sessionId &&
        session.generation > failedDevelopment.generation &&
        session.currentSnapshot?.contentDigest !== localSnapshot.contentDigest
        ? candidate
        : undefined
    }, "Local extension source did not recompile in development")
    assert.ok(reloadedLocalPackage.contentDigest)
    assert.ok(reloadedLocalPackage.permissionHash)
    const reloadedSnapshot = {
      packageId: localTemplate.canonicalId,
      contentDigest: reloadedLocalPackage.contentDigest,
      permissionHash: reloadedLocalPackage.permissionHash,
    }
    const reloadedPalette = await service.listCommandPalette(SPACE_ID)
    const reloadedCommand = reloadedPalette.commands.find(
      (command) => command.id === localCommandId
    )
    assert.deepEqual(
      reloadedCommand && {
        packageId: reloadedCommand.packageId,
        contentDigest: reloadedCommand.contentDigest,
        permissionHash: reloadedCommand.permissionHash,
      },
      reloadedSnapshot,
      "Command Palette should use the current development snapshot"
    )
    await service.executeCommand(SPACE_ID, {
      ...reloadedSnapshot,
      commandId: localCommandId,
      resource: { path: "tasks.md" },
    })
    assert.ok(
      (await service.discover(SPACE_ID)).packages
        .find(
          (candidate) => candidate.canonicalId === localTemplate.canonicalId
        )
        ?.runtimeOutput.some(
          (entry) =>
            entry.source === "worker" &&
            entry.message.includes("development-version-two")
        ),
      "Reloaded local command should execute the new source"
    )
    await service.stopDevelopmentSession(SPACE_ID, {
      packageId: localTemplate.canonicalId,
      sessionId: development.sessionId,
    })
    assert.equal(
      (await service.listCommandPalette(SPACE_ID)).commands.some(
        (command) => command.id === localCommandId
      ),
      false,
      "Stopping development must restore snapshot-bound trust"
    )
    await service.uninstall(SPACE_ID, {
      directoryName: localTemplate.canonicalId,
      canonicalId: localTemplate.canonicalId,
      contentDigest: reloadedSnapshot.contentDigest,
    })

    const localPanelTemplate = await service.createTemplate(SPACE_ID, {
      name: "development-panel",
      template: "panel",
    })
    assert.equal(localPanelTemplate.canonicalId, "local.development-panel")
    assert.deepEqual(localPanelTemplate.files.sort(), [
      "README.md",
      "extension.json",
      "src/extension.ts",
      "src/panel.css",
      "src/panel.ts",
    ])
    const localPanelPackage = await waitForValue(
      async () =>
        (await service.discover(SPACE_ID)).packages.find(
          (candidate) =>
            candidate.canonicalId === localPanelTemplate.canonicalId
        ),
      "Created local panel extension was not discovered"
    )
    assert.ok(localPanelPackage.contentDigest)
    assert.ok(localPanelPackage.permissionHash)
    const localPanelSnapshot = {
      packageId: localPanelTemplate.canonicalId,
      contentDigest: localPanelPackage.contentDigest,
      permissionHash: localPanelPackage.permissionHash,
    }
    const localPanelTrusted = await service.trust(SPACE_ID, localPanelSnapshot)
    for (const grant of localPanelTrusted.requestedGrants) {
      await service.setGrant(SPACE_ID, {
        ...localPanelSnapshot,
        grant,
        granted: true,
      })
    }
    await service.setEnabled(SPACE_ID, localPanelSnapshot, true)

    const localPanelCommandId = `${localPanelTemplate.canonicalId}.open-summary`
    const localPanelEventOffset = events.length
    await service.executeCommand(SPACE_ID, {
      ...localPanelSnapshot,
      commandId: localPanelCommandId,
      resource: { path: "tasks.md" },
    })
    const localPanelEvent = events
      .slice(localPanelEventOffset)
      .find((event) => event.channel === "file-extensions:open-panel")
      ?.payload as { sessionId?: string; revision?: number } | undefined
    assert.ok(
      localPanelEvent?.sessionId,
      "Created local panel command should open its UI"
    )
    const localPanelSession = await service.getPanelSession(SPACE_ID, {
      sessionId: localPanelEvent.sessionId,
    })
    assert.deepEqual(asPlainJsonObject(localPanelSession.state), {
      path: "tasks.md",
      total: 3,
      completed: 1,
      pending: 2,
    })

    const localPanelDevelopment = await service.startDevelopmentSession(
      SPACE_ID,
      localPanelSnapshot
    )
    const localPanelSourcePath = path.join(
      spacePath,
      ".eidos",
      "extensions",
      localPanelTemplate.canonicalId,
      "src",
      "panel.ts"
    )
    await writeFile(
      localPanelSourcePath,
      [
        'import type { ExtensionPanelContext } from "@eidos.space/extension-sdk"',
        'import "./panel.css"',
        "",
        "export function activate(context: ExtensionPanelContext) {",
        "  const state = (context.state ?? {}) as { pending?: number; completed?: number }",
        '  const shell = document.createElement("main")',
        '  shell.dataset.developmentPanel = "version-two"',
        "  shell.innerHTML = `<h1>development-version-two</h1><p>${String(state.pending ?? 0)} pending</p>`",
        "  context.root.replaceChildren(shell)",
        "}",
        "",
      ].join("\n")
    )
    const reloadedLocalPanelPackage = await waitForValue(async () => {
      const candidate = (await service.discover(SPACE_ID)).packages.find(
        (entry) => entry.canonicalId === localPanelTemplate.canonicalId
      )
      const developmentSession = candidate?.developmentSession
      const refreshedPanel = events.find(
        (event) =>
          event.channel === "file-extensions:open-panel" &&
          (event.payload as { sessionId?: string }).sessionId ===
            localPanelSession.sessionId &&
          ((event.payload as { revision?: number }).revision ?? 0) >
            localPanelSession.revision
      )
      return developmentSession?.status === "ready" &&
        developmentSession.sessionId === localPanelDevelopment.sessionId &&
        developmentSession.generation > localPanelDevelopment.generation &&
        refreshedPanel
        ? candidate
        : undefined
    }, "Local panel source did not refresh its open UI session")
    assert.ok(reloadedLocalPanelPackage.contentDigest)
    assert.ok(reloadedLocalPanelPackage.permissionHash)
    const reloadedLocalPanelSession = await service.getPanelSession(SPACE_ID, {
      sessionId: localPanelSession.sessionId,
    })
    assert.ok(
      reloadedLocalPanelSession.revision > localPanelSession.revision,
      "Panel hot reload should advance the open surface revision"
    )
    assert.deepEqual(
      asPlainJsonObject(reloadedLocalPanelSession.state),
      { path: "tasks.md", total: 3, completed: 1, pending: 2 },
      "Panel hot reload should preserve its command-produced state"
    )
    assert.match(reloadedLocalPanelSession.source, /development-version-two/)
    const renderedDevelopmentPanel = await renderDevelopmentPanel({
      source: reloadedLocalPanelSession.source,
      generation: reloadedLocalPanelSession.generation,
      packageId: reloadedLocalPanelSession.packageId,
      panelId: reloadedLocalPanelSession.panelId,
      sessionId: reloadedLocalPanelSession.sessionId,
      state: reloadedLocalPanelSession.state,
    })
    assert.match(renderedDevelopmentPanel.text, /development-version-two/)
    assert.match(renderedDevelopmentPanel.text, /2 pending/)
    assert.equal(renderedDevelopmentPanel.networkGlobalsBlocked, true)
    await service.stopDevelopmentSession(SPACE_ID, {
      packageId: localPanelTemplate.canonicalId,
      sessionId: localPanelDevelopment.sessionId,
    })
    await service.uninstall(SPACE_ID, {
      directoryName: localPanelTemplate.canonicalId,
      canonicalId: localPanelTemplate.canonicalId,
      contentDigest: reloadedLocalPanelPackage.contentDigest,
    })

    await service.uninstall(SPACE_ID, {
      directoryName: eidosFileViewTemplate.canonicalId,
      canonicalId: eidosFileViewTemplate.canonicalId,
      contentDigest: eidosFileViewInstalled.contentDigest,
    })
    assert.deepEqual(
      await service.listEidosFileViews(SPACE_ID, "tasks.eidos"),
      []
    )
    await service.uninstall(SPACE_ID, {
      directoryName: panelTemplate.canonicalId,
      canonicalId: panelTemplate.canonicalId,
      contentDigest: panelInstalled.contentDigest,
    })
    assert.deepEqual(await service.listCommandPalette(SPACE_ID), {
      commands: [],
      panels: [],
    })
    assert.deepEqual(
      await readdir(path.join(spacePath, ".eidos", "extensions")),
      []
    )
    assert.deepEqual(
      await readdir(
        path.join(spacePath, ".eidos", "cache", "extensions", "staging")
      ),
      []
    )

    console.log(
      JSON.stringify({
        ok: true,
        lifecycle: [
          "install-panel",
          "install-eidos-file-view",
          "trust",
          "grant",
          "enable",
          "command-palette",
          "worker",
          "panel",
          "eidos-file-view-discovery",
          "eidos-file-view-render",
          "local-create",
          "local-command",
          "local-panel-create",
          "local-panel-open",
          "development-failure",
          "development-reload",
          "panel-development-reload",
          "panel-development-render",
          "development-trust-reset",
          "uninstall",
          "staging-cleanup",
        ],
        packageIds: [
          panelTemplate.canonicalId,
          eidosFileViewTemplate.canonicalId,
        ],
        panelState: panel.state,
        eidosFileView: {
          viewId: savedView.id,
          title: renderedEidosFileView.title,
          cards: renderedEidosFileView.cards.length,
        },
      })
    )
  } finally {
    service.stopWatching(SPACE_ID)
    runtimeManager.disposeAll("File extension app smoke completed")
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

app.on("window-all-closed", () => {})

void run().then(
  () => app.exit(0),
  (error) => {
    console.error(error)
    app.exit(1)
  }
)
