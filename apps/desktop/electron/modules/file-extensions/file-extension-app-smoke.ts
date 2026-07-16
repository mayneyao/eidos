import "reflect-metadata"

import assert from "node:assert/strict"
import { gzipSync } from "node:zlib"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { app } from "electron"
import { createExtensionPanelTemplate } from "@eidos.space/extension-manifest"

import type { MainWindowProvider } from "../space-management/main-window.provider"
import type { SpaceRegistry } from "../space-management/space-registry"
import { FileExtensionService } from "./file-extension.service"
import { ElectronFileExtensionRuntimeTransportFactory } from "./runtime/electron-runtime-transport"
import { FileExtensionRuntimeManager } from "./runtime/file-extension-runtime-manager"

const SPACE_ID = "file-extension-app-smoke"
const COMMIT = "a".repeat(40)
const PACKAGE_PATH = "packages/lifecycle-panel"

interface SentEvent {
  channel: string
  payload: unknown
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
      return new Response(archive, {
        status: 200,
        headers: { "content-type": "application/gzip" },
      })
    }
    return new Response("not found", { status: 404 })
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

    const template = createExtensionPanelTemplate({
      publisher: "example",
      name: "lifecycle-panel",
      engineRange: ">=0.0.0",
    })
    const archive = githubArchive(
      Object.fromEntries(
        template.files.map((file) => [
          `${PACKAGE_PATH}/${file.path}`,
          file.content,
        ])
      )
    )
    const originalFetch = globalThis.fetch
    let preview
    try {
      globalThis.fetch = githubFetch(archive)
      preview = await service.prepareGitHubInstall(SPACE_ID, {
        repository: "example/eidos-extensions",
        requested: "v0.1.0",
        subdirectory: PACKAGE_PATH,
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    assert.equal(preview.operation, "install")
    assert.equal(preview.canonicalId, template.canonicalId)
    assert.equal(preview.source.commit, COMMIT)
    const installed = await service.applyGitHubInstall(SPACE_ID, {
      previewId: preview.previewId,
      contentDigest: preview.contentDigest,
      permissionHash: preview.permissionHash,
    })
    assert.equal(installed.canonicalId, template.canonicalId)

    const snapshot = {
      packageId: installed.canonicalId,
      contentDigest: installed.contentDigest,
      permissionHash: installed.permissionHash,
    }
    const trusted = await service.trust(SPACE_ID, snapshot)
    assert.equal(trusted.trusted, true)
    assert.equal(trusted.enabled, false)
    assert.deepEqual(trusted.requestedGrants, [
      { kind: "files.read", value: "**/*.markdown" },
      { kind: "files.read", value: "**/*.md" },
    ])
    for (const grant of trusted.requestedGrants) {
      await service.setGrant(SPACE_ID, {
        ...snapshot,
        grant,
        granted: true,
      })
    }
    const enabled = await service.setEnabled(SPACE_ID, snapshot, true)
    assert.equal(enabled.enabled, true)
    assert.deepEqual(enabled.granted, trusted.requestedGrants)

    const palette = await service.listCommandPalette(SPACE_ID)
    assert.deepEqual(
      palette.commands.map((command) => command.id),
      [`${template.canonicalId}.open-summary`]
    )
    assert.deepEqual(
      palette.panels.map((panel) => panel.id),
      [`${template.canonicalId}.summary`]
    )

    await service.executeCommand(SPACE_ID, {
      ...snapshot,
      commandId: `${template.canonicalId}.open-summary`,
      resource: { path: "tasks.md" },
    })
    const panelEvent = events.find(
      (event) => event.channel === "file-extensions:open-panel"
    )?.payload as { sessionId?: string } | undefined
    assert.ok(panelEvent?.sessionId, "command should open its declared panel")
    const panel = await service.getPanelSession(SPACE_ID, {
      sessionId: panelEvent.sessionId,
    })
    assert.equal(panel.packageId, template.canonicalId)
    assert.equal(panel.panelId, `${template.canonicalId}.summary`)
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

    await service.uninstall(SPACE_ID, {
      directoryName: template.canonicalId,
      canonicalId: template.canonicalId,
      contentDigest: installed.contentDigest,
    })
    assert.deepEqual(await service.listCommandPalette(SPACE_ID), {
      commands: [],
      panels: [],
    })
    assert.deepEqual(
      await readdir(path.join(spacePath, ".eidos", "extensions")),
      []
    )

    console.log(
      JSON.stringify({
        ok: true,
        lifecycle: [
          "install",
          "trust",
          "grant",
          "enable",
          "command-palette",
          "worker",
          "panel",
          "uninstall",
        ],
        packageId: template.canonicalId,
        panelState: panel.state,
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
