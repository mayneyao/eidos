import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodePackage } from "@eidos.space/plugin-runtime/package"
import type {
  PluginListing,
  PluginOpenResult,
  PluginPackagePreview,
} from "../../shared/plugins"
import { PLUGIN_CHANNELS } from "../../shared/plugins"
import type { WindowController } from "../window-controller"
import { readTextFilePreview, saveTextFile } from "../space/text-file-preview"

const mock = vi.hoisted(() => ({
  directory: "",
  selected: "",
  response: 1,
  messageOptions: [] as unknown[],
  showPluginInstall: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  windows: [] as {
    webContents: {
      id: number
      send: ReturnType<typeof vi.fn>
      once: ReturnType<typeof vi.fn>
      isDestroyed(): boolean
    }
    isDestroyed(): boolean
  }[],
}))
vi.mock("electron", () => ({
  app: {
    getPath: (name?: string) =>
      name === "appData" ? `${mock.directory}-app-data` : mock.directory,
    getName: () => "Eidos Lite",
    getLocale: () => "en-US",
    getAppPath: () => process.cwd(),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mock.handlers.set(channel, handler),
    removeHandler: (channel: string) => mock.handlers.delete(channel),
  },
  protocol: { handle: vi.fn(), unhandle: vi.fn() },
  BrowserWindow: {
    getAllWindows: () => mock.windows,
    fromWebContents: (sender: { id: number }) =>
      mock.windows.find((window) => window.webContents.id === sender.id),
  },
  dialog: {
    showOpenDialog: async () => ({
      canceled: false,
      filePaths: [mock.selected],
    }),
    showMessageBox: async (...args: unknown[]) => {
      mock.messageOptions.push(args.at(-1))
      return { response: mock.response }
    },
  },
}))
import { registerPluginIpc } from "./plugin-ipc"
import { PluginRegistry } from "./plugin-registry"
import { PluginService } from "./plugin-service"
import { PluginConnections } from "./plugin-connections"
const id = "example.csv"
let registered: ReturnType<typeof registerPluginIpc>
let switchTestSpace: (owner: number, spaceId: string) => void
const events = new Map<
  number,
  {
    sender: {
      id: number
      mainFrame: object
      once: ReturnType<typeof vi.fn>
      send?: ReturnType<typeof vi.fn>
      isDestroyed(): boolean
    }
    senderFrame: object
  }
>()
const call = (
  channel: keyof typeof PLUGIN_CHANNELS,
  owner: number,
  ...args: unknown[]
) => mock.handlers.get(PLUGIN_CHANNELS[channel])!(events.get(owner), ...args)
const listing = async (owner: number) =>
  (await call("list", owner)) as PluginListing
async function packageVersion(version: string) {
  await fs.writeFile(
    mock.selected,
    encodePackage(
      {
        apiVersion: 1,
        requires: { pluginApi: "3.0.0" },
        id,
        name: "CSV",
        version,
        views: [
          {
            id: "csv",
            title: "CSV",
            kind: "file",
            capabilities: ["document"],
            entry: "./csv.ts",
          },
        ],
        placements: [
          { location: "file/open", view: "csv", extensions: [".csv"] },
        ],
      },
      { "./csv.ts": "export default function mount() {}" }
    )
  )
}
beforeEach(async () => {
  mock.directory = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-ipc-"))
  mock.selected = path.join(mock.directory, "example.eidos-plugin")
  mock.response = 1
  mock.messageOptions = []
  mock.windows = [1, 2, 3].map((id) => ({
    webContents: { id, send: vi.fn(), once: vi.fn(), isDestroyed: () => false },
    isDestroyed: () => false,
  }))
  for (const id of [1, 2, 3]) {
    const mainFrame = {}
    events.set(id, {
      sender: {
        id,
        mainFrame,
        once: vi.fn(),
        send: vi.fn(),
        isDestroyed: () => false,
      },
      senderFrame: mainFrame,
    })
  }
  await packageVersion("1.0.0")
  await fs.writeFile(path.join(mock.directory, "data.csv"), "a,b")
  const sessions = new Map(
    [1, 2].map((id) => [
      id,
      {
        canonical: { id: `space-${id}`, name: `Space ${id}` },
        previewTextFile: (file: string) =>
          readTextFilePreview(mock.directory, file),
        saveTextFile: (request: Parameters<typeof saveTextFile>[1]) =>
          saveTextFile(mock.directory, request),
      },
    ])
  )
  switchTestSpace = (owner, spaceId) => {
    const current = sessions.get(owner)
    if (current) current.canonical.id = spaceId
  }
  mock.showPluginInstall
    .mockReset()
    .mockImplementation(
      (_id, _preview, preferred) => preferred ?? mock.windows[0]
    )
  registered = registerPluginIpc({
    getPreferences: async () => ({ language: "en" }),
    onPreferencesChanged: () => () => {},
    showPluginInstall: mock.showPluginInstall,
    requireSession: (sender: { id: number }) => {
      const session = sessions.get(sender.id)
      if (!session) throw new Error("No active Space")
      return session
    },
  } as unknown as WindowController)
})
afterEach(async () => {
  vi.restoreAllMocks()
  registered?.close()
  events.clear()
  await fs.rm(mock.directory, { recursive: true, force: true })
})

it("marketplace installs reuse permission approval and Space isolation", async () => {
  const download = vi
    .spyOn(PluginRegistry.prototype, "download")
    .mockResolvedValue(await fs.readFile(mock.selected))
  mock.selected = "missing-file-picker-result"
  mock.response = 0
  expect(await call("install", 1, false, id)).toBe(false)
  expect((await listing(1)).plugins).toHaveLength(0)
  mock.response = 1
  expect(await call("install", 1, false, id)).toBe(true)
  expect(download).toHaveBeenCalledWith(id, expect.any(Function))
  expect((await listing(1)).plugins[0].enabled).toBe(true)
  expect((await listing(2)).plugins[0].enabled).toBe(false)
})

it("installs in the device catalog and enables only the invoking Space", async () => {
  expect(await call("install", 1)).toBe(true)
  expect((await listing(1)).plugins[0].enabled).toBe(true)
  expect((await listing(2)).plugins[0].enabled).toBe(false)
  expect((await listing(3)).space).toBeNull()
  await expect(call("enable", 3, id, true)).rejects.toThrow(/Space/)
  for (const window of mock.windows)
    expect(window.webContents.send).toHaveBeenCalledWith(
      PLUGIN_CHANNELS.event,
      expect.objectContaining({
        event: expect.objectContaining({ observation: "host.catalog" }),
      })
    )
})

it("installs a workspace action with per-Space settings", async () => {
  const journalId = "example.journals"
  await fs.writeFile(
    mock.selected,
    encodePackage(
      {
        apiVersion: 1,
        requires: { pluginApi: "3.0.0" },
        id: journalId,
        name: "Journals",
        version: "0.1.0",
        extension: "./extension.ts",
        actions: [
          {
            id: "today",
            title: "Open today's journal",
            context: "workspace",
            access: "write",
          },
        ],
        placements: [{ location: "command-palette", action: "today" }],
        settings: {
          folder: { type: "string", title: "Folder", default: "journals" },
        },
      },
      { "./extension.ts": "export default function activate() {}" }
    )
  )
  expect(await call("install", 1)).toBe(true)
  expect((await listing(1)).plugins[0].manifest.id).toBe(journalId)
  expect(await call("settings", 1, journalId)).toEqual({ folder: "journals" })
  await call("setSetting", 1, journalId, "folder", "Daily")
  expect(await call("settings", 1, journalId)).toEqual({ folder: "Daily" })
  await expect(call("settings", 2, journalId)).rejects.toThrow(
    "Plugin disabled"
  )
})

it("discloses the workspace file access permission", async () => {
  await fs.writeFile(
    mock.selected,
    encodePackage(
      {
        apiVersion: 1,
        requires: { pluginApi: "3.0.0" },
        id: "example.watch",
        name: "Watch",
        version: "1.0.0",
        workspace: { files: true },
        views: [
          {
            id: "overview",
            title: "Overview",
            kind: "page",
            entry: "./page.ts",
          },
        ],
      },
      { "./page.ts": "export default function mount() {}" }
    )
  )
  expect(await call("install", 1)).toBe(true)
  expect(mock.messageOptions).toContainEqual(
    expect.objectContaining({
      detail: expect.stringContaining(
        "This plugin can read and write files throughout this Space."
      ),
    })
  )
})

it.each(["read", "write"] as const)(
  "discloses automatic file hook events and %s access before installation",
  async (access) => {
    await fs.writeFile(
      mock.selected,
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "3.7.0" },
          id: "example.title-sync",
          name: "Title Sync",
          version: "1.0.0",
          extension: "./extension.ts",
          hooks: [
            {
              id: "saved",
              title: "Saved",
              event: "document.saved",
              extensions: [".md"],
              access,
            },
            {
              id: "renamed",
              title: "Renamed",
              event: "file.renamed",
              extensions: [".md", ".markdown"],
              access,
            },
          ],
        },
        { "./extension.ts": "export function register() {}" }
      )
    )
    mock.response = 0
    expect(await call("install", 1)).toBe(false)
    expect(mock.messageOptions).toContainEqual(
      expect.objectContaining({
        detail: expect.stringContaining(
          "File hooks run automatically on local document saves and file renames for .md, .markdown files."
        ),
      })
    )
    expect(mock.messageOptions).toContainEqual(
      expect.objectContaining({
        detail: expect.stringContaining(
          access === "write"
            ? "They can change the affected document's text and filename within its existing folder."
            : "They can read the affected document's text and filename, without changing them."
        ),
      })
    )
    expect((await listing(1)).plugins).toEqual([])
  }
)

it("updates from another Space reload active instances and preserve enablement", async () => {
  await call("install", 1)
  const opened = (await call(
    "open",
    1,
    "data.csv",
    `${id}/csv`
  )) as PluginOpenResult
  await packageVersion("2.0.0")
  await call("enable", 2, id, false)
  await call("install", 2)
  expect((await listing(1)).plugins[0]).toMatchObject({
    enabled: true,
    manifest: { version: "2.0.0" },
  })
  expect((await listing(2)).plugins[0]).toMatchObject({
    enabled: false,
    manifest: { version: "2.0.0" },
  })
  expect(mock.windows[0].webContents.send).toHaveBeenCalledWith(
    PLUGIN_CHANNELS.event,
    expect.objectContaining({
      ticket: opened.instance!.ticket,
      event: expect.objectContaining({ observation: "host.reload" }),
    })
  )
})

it("updating from a disabled Space preserves all Space enablement", async () => {
  await call("install", 1)
  await call("enable", 1, id, false)
  await call("enable", 2, id, true)
  await packageVersion("2.0.0")
  await call("install", 1)
  expect((await listing(1)).plugins[0]).toMatchObject({
    enabled: false,
    manifest: { version: "2.0.0" },
  })
  expect((await listing(2)).plugins[0].enabled).toBe(true)
})

it("uninstall cancellation preserves installation; confirmation removes it for all Spaces", async () => {
  await call("install", 1)
  await call("enable", 2, id, true)
  mock.response = 0
  expect(await call("uninstall", 3, id)).toBe(false)
  expect((await listing(2)).plugins[0].enabled).toBe(true)
  mock.response = 1
  expect(await call("uninstall", 3, id)).toBe(true)
  expect((await listing(1)).plugins).toEqual([])
  expect((await listing(2)).plugins).toEqual([])
})

it("handles plugin readme IPC requests", async () => {
  vi.spyOn(PluginRegistry.prototype, "readme").mockResolvedValue(
    "# Plugin Readme"
  )
  expect(await call("readme", 1, id)).toBe("# Plugin Readme")
  await expect(call("readme", 1, 123)).rejects.toThrow(/Invalid plugin/)
})

it("previews shell-opened packages in the main window and installs only after confirmation", async () => {
  const file = mock.selected
  expect(await registered.openPackage(file)).toBe(true)
  const preview = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  expect(preview).toMatchObject({
    filename: "example.eidos-plugin",
    manifest: { id, version: "1.0.0" },
  })
  expect((await listing(3)).plugins).toHaveLength(0)
  expect(mock.messageOptions).toHaveLength(0)
  expect(await call("packagePreviews", 2)).toEqual([])
  expect(await call("packagePreviews", 1)).toEqual([preview])
  const readme = vi.spyOn(PluginRegistry.prototype, "readme")
  expect(await call("readme", 1, id, "en", preview.token)).toBeNull()
  expect(readme).not.toHaveBeenCalled()
  await expect(call("installPrepared", 2, preview.token)).rejects.toThrow(
    /preview/
  )
  // The confirmed bytes stay the same even if the source file changes after preview.
  await packageVersion("2.0.0")
  mock.response = 0
  expect(await call("installPrepared", 1, preview.token)).toBe(false)
  expect(mock.messageOptions.at(-1)).toMatchObject({
    message: expect.stringContaining("Space: Space 1"),
  })
  expect((await listing(3)).plugins).toHaveLength(0)
  mock.response = 1
  expect(await call("installPrepared", 1, preview.token)).toBe(true)
  expect((await listing(1)).plugins[0]).toMatchObject({
    enabled: true,
    manifest: { version: "1.0.0" },
  })
  const reviews = mock.messageOptions.length
  expect(await call("installPrepared", 1, preview.token)).toBe(true)
  expect(mock.messageOptions).toHaveLength(reviews)
  await call("enable", 1, id, false)
  await call("enable", 2, id, true)
  await registered.openPackage(file)
  const update = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  expect(await call("installPrepared", 1, update.token)).toBe(true)
  expect((await listing(1)).plugins[0]).toMatchObject({
    enabled: false,
    manifest: { version: "2.0.0" },
  })
  expect((await listing(2)).plugins[0].enabled).toBe(true)
  await fs.writeFile(file, "invalid archive")
  await expect(registered.openPackage(file)).rejects.toThrow()
  await expect(registered.openPackage("relative.eidos-plugin")).rejects.toThrow(
    "Invalid plugin package path"
  )
  await expect(
    registered.openPackage(path.join(mock.directory, "file.txt"))
  ).rejects.toThrow("Invalid plugin package path")
})

it("installs marketplace packages into the target Space and isolates its progress", async () => {
  const download = vi
    .spyOn(PluginRegistry.prototype, "download")
    .mockResolvedValue(await fs.readFile(mock.selected))
  expect(await call("installMarketplace", 1, id)).toBe(true)
  expect(download).toHaveBeenCalledOnce()
  expect((await listing(1)).plugins[0].enabled).toBe(true)
  expect((await listing(2)).plugins[0].enabled).toBe(false)
  expect(await call("installTasks", 1)).toMatchObject({
    [id]: { status: "installed" },
  })
  expect(await call("installTasks", 2)).toEqual({})
  await expect(call("installMarketplace", 3, id)).rejects.toThrow(/Space/)
  await expect(call("install", 3)).rejects.toThrow(/Space/)
  await expect(call("installPrepared", 3, "token")).rejects.toThrow(/Space/)
  await expect(call("installMarketplace", 1, "../invalid")).rejects.toThrow(
    /Invalid marketplace/
  )
})

it("opens file-picker and dropped package previews without reviewing or installing them", async () => {
  expect(await call("previewPackage", 1, mock.selected)).toBe(true)
  expect(mock.showPluginInstall.mock.calls.at(-1)![2]).toBe(mock.windows[0])
  expect((await listing(1)).plugins).toHaveLength(0)
  expect(mock.messageOptions).toHaveLength(0)
  const preview = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  await call("installPrepared", 1, preview.token)
  expect((await listing(1)).plugins[0].enabled).toBe(true)
  await expect(
    call("previewPackage", 1, "relative.eidos-plugin")
  ).rejects.toThrow(/Invalid plugin/)
})

it("rejects a queued installation if its target Space changes before review", async () => {
  const bytes = await fs.readFile(mock.selected)
  let finish!: (bytes: Uint8Array) => void
  const download = vi
    .spyOn(PluginRegistry.prototype, "download")
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
  const first = call("installMarketplace", 1, id)
  const second = call("installMarketplace", 2, id)
  const results = Promise.allSettled([first, second])
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  switchTestSpace(2, "space-three")
  finish(bytes)
  const [installed, cancelled] = await results
  expect(installed).toMatchObject({ status: "fulfilled", value: true })
  expect(cancelled).toMatchObject({
    status: "rejected",
    reason: expect.objectContaining({
      message: "Space changed before installation",
    }),
  })
  expect(mock.messageOptions).toHaveLength(1)
  expect((await listing(1)).plugins[0].enabled).toBe(true)
  expect((await listing(2)).plugins[0].enabled).toBe(false)
})

it("activates automatic backgrounds through the target Space lifecycle after installation", async () => {
  const start = vi
    .spyOn(PluginService.prototype, "autoStartBackgrounds")
    .mockResolvedValue()
  await fs.writeFile(
    mock.selected,
    encodePackage(
      {
        apiVersion: 1,
        requires: { pluginApi: "3.7.0" },
        id,
        name: "Background",
        version: "1.0.0",
        background: { entry: "./background.js", autoStart: true },
      },
      { "./background.js": "export default function activate() {}" }
    )
  )
  await registered.openPackage(mock.selected)
  const preview = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  await call("installPrepared", 1, preview.token)
  expect(start).toHaveBeenCalledWith(1, "space-1", id)
  expect(start).toHaveBeenCalledTimes(1)
})

it("dropped packages install and update by manifest ID while preserving Space enablement", async () => {
  const dropped = mock.selected
  mock.selected = "must-not-open-file-picker"
  expect(await call("install", 1, false, undefined, dropped)).toBe(true)
  await call("enable", 1, id, false)
  await call("enable", 2, id, true)
  mock.selected = dropped
  await packageVersion("2.0.0")
  mock.selected = "must-not-open-file-picker"
  expect(await call("install", 1, false, undefined, dropped)).toBe(true)
  expect((await listing(1)).plugins[0]).toMatchObject({
    enabled: false,
    manifest: { version: "2.0.0" },
  })
  expect((await listing(2)).plugins[0].enabled).toBe(true)
  // Same-version replacement is useful for local development packages.
  expect(await call("install", 1, false, undefined, dropped)).toBe(true)
})

it("dropped packages still require approval and reject invalid paths and contents", async () => {
  mock.response = 0
  expect(await call("install", 1, false, undefined, mock.selected)).toBe(false)
  expect((await listing(1)).plugins).toHaveLength(0)
  for (const source of [
    123,
    "relative.eidos-plugin",
    "/tmp/not-a-plugin.txt",
  ]) {
    await expect(call("install", 1, false, undefined, source)).rejects.toThrow(
      /Invalid dropped/
    )
  }
  await expect(
    call("install", 1, true, undefined, mock.selected)
  ).rejects.toThrow(/Invalid dropped/)
  await expect(call("install", 1, false, id, mock.selected)).rejects.toThrow(
    /Invalid dropped/
  )
  await fs.writeFile(mock.selected, "invalid archive")
  await expect(
    call("install", 1, false, undefined, mock.selected)
  ).rejects.toThrow()
  expect((await listing(1)).plugins).toHaveLength(0)
})

it("allows two authenticated requests per instance and cancels both", async () => {
  vi.spyOn(PluginService.prototype, "connectionAccess").mockResolvedValue({
    scope: ["space-1", id, "ai", "https://example.com"],
    configurable: false,
    url: "https://example.com",
    signal: new AbortController().signal,
  })
  const pending: {
    signal: AbortSignal
    resolve: (value: Record<string, never>) => void
  }[] = []
  vi.spyOn(PluginConnections.prototype, "request").mockImplementation(
    async (_scope, _url, _body, signal) =>
      new Promise((resolve, reject) => {
        pending.push({ signal, resolve })
        signal.addEventListener("abort", () => reject(new Error("Cancelled")), {
          once: true,
        })
      })
  )
  const first = call("connection", 1, "ticket", "ai", "request", {})
  const second = call("connection", 1, "ticket", "ai", "request", {})
  await vi.waitFor(() => expect(pending).toHaveLength(2))
  await expect(
    call("connection", 1, "ticket", "ai", "request", {})
  ).rejects.toThrow(/busy/)
  pending[0].resolve({})
  await first
  const replacement = call("connection", 1, "ticket", "ai", "request", {})
  const settled = Promise.allSettled([second, replacement])
  await vi.waitFor(() => expect(pending).toHaveLength(3))
  await call("connection", 1, "ticket", "ai", "cancel", null)
  expect((await settled).map((result) => result.status)).toEqual([
    "rejected",
    "rejected",
  ])
  expect(pending[1].signal.aborted).toBe(true)
  expect(pending[2].signal.aborted).toBe(true)
})
