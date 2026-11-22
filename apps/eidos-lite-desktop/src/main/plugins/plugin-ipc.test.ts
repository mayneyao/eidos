import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { MessageBoxOptions } from "electron"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodePackage } from "@eidos.space/plugin-runtime/package"
import type {
  PluginListing,
  PluginOpenResult,
  PluginPackagePreview,
  SpaceFileEditorSettings,
} from "../../shared/plugins"
import { PLUGIN_CHANNELS } from "../../shared/plugins"
import type { WindowController } from "../window-controller"
import { readTextFilePreview, saveTextFile } from "../space/text-file-preview"
import type { PluginManifest } from "@eidos.space/plugin-sdk"

const mock = vi.hoisted(() => ({
  directory: "",
  selected: "",
  response: "confirm" as number | "confirm" | "cancel",
  checkboxChecked: false,
  messageOptions: [] as MessageBoxOptions[],
  showPluginInstall: vi.fn(),
  openSpaceFileEditorSettings: vi.fn(),
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
    getPreferredSystemLanguages: () => ["en-US"],
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
    showMessageBox: async (_owner: unknown, options: MessageBoxOptions) => {
      mock.messageOptions.push(options)
      const selection = mock.response
      const response =
        typeof selection === "number"
          ? selection
          : options.buttons?.findIndex((label) =>
              selection === "cancel" ? label === "Cancel" : label !== "Cancel"
            )
      if (response === undefined || response < 0)
        throw new Error("Mock dialog button was not found")
      return { response, checkboxChecked: mock.checkboxChecked }
    },
  },
}))
import { registerPluginIpc } from "./plugin-ipc"
import { PluginRegistry } from "./plugin-registry"
import { PluginService } from "./plugin-service"
import { PluginConnections } from "./plugin-connections"
import { PluginStore } from "./plugin-store"
const id = "example.csv"
let registered: ReturnType<typeof registerPluginIpc>
let switchTestSpace: (owner: number, spaceId: string) => void
let settingsContext:
  | (Omit<SpaceFileEditorSettings, "extensions"> & { spaceId: string })
  | null
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
async function packageVersion(
  version: string,
  manifest: Partial<PluginManifest> = {},
  modules: Record<string, string> = {}
) {
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
        ...manifest,
      },
      { "./csv.ts": "export default function mount() {}", ...modules }
    )
  )
}
beforeEach(async () => {
  mock.directory = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-ipc-"))
  mock.selected = path.join(mock.directory, "example.eidos-plugin")
  mock.response = "confirm"
  mock.checkboxChecked = false
  mock.messageOptions = []
  settingsContext = null
  mock.openSpaceFileEditorSettings.mockClear()
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
        canonical: {
          id: `space-${id}`,
          name: `Space ${id}`,
          root: mock.directory,
        },
        previewTextFile: (file: string) =>
          readTextFilePreview(mock.directory, file),
        statFile: async (file: string) => {
          const stats = await fs.stat(path.join(mock.directory, file))
          return {
            path: file,
            name: path.basename(file),
            extension: path.extname(file),
            size: stats.size,
            isDirectory: stats.isDirectory(),
          }
        },
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
    .mockImplementation((_id, _preview, preferred, onReady) => {
      const owner = preferred ?? mock.windows[0]
      onReady?.(owner)
      return owner
    })
  const sessionFor = (sender: { id: number }) => sessions.get(sender.id)
  registered = registerPluginIpc({
    getPreferences: async () => ({ language: "en" }),
    onPreferencesChanged: () => () => {},
    showPluginInstall: mock.showPluginInstall,
    openSpaceFileEditorSettings: mock.openSpaceFileEditorSettings,
    getSpaceFileEditorSettingsContext: (sender: { id: number }) =>
      sender.id === 3 ? settingsContext : null,
    sessionFor,
    requireSession: (sender: { id: number }) => {
      const session = sessionFor(sender)
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

it("routes a validated sidebar request only to the owning workbench", async () => {
  expect(await call("install", 1)).toBe(true)
  const { instance } = (await call(
    "open",
    1,
    "data.csv",
    `${id}/csv`
  )) as PluginOpenResult
  const request = {
    protocol: "eidos-plugin",
    apiVersion: 1,
    id: "sidebar",
    method: "ui.openFile",
    params: { relativePath: "data.csv", target: "sidebar" },
  }
  expect(await call("request", 2, instance!.ticket, request)).toMatchObject({
    response: { error: { code: "INSTANCE_CLOSED" } },
  })
  expect(await call("request", 1, instance!.ticket, request)).toEqual({
    response: {
      protocol: "eidos-plugin",
      apiVersion: 1,
      id: "sidebar",
      result: null,
    },
    draftPath: "data.csv",
    draft: null,
  })
  expect(events.get(1)!.sender.send).toHaveBeenCalledWith(
    PLUGIN_CHANNELS.openFileInSidebar,
    "space-1",
    "data.csv"
  )
  expect(events.get(2)!.sender.send).not.toHaveBeenCalledWith(
    PLUGIN_CHANNELS.openFileInSidebar,
    expect.anything(),
    expect.anything()
  )
})

it.each([
  {
    platform: "darwin",
    cancelId: 1,
    installButtons: ["Install", "Cancel"],
    updateButtons: ["Update", "Cancel"],
  },
  {
    platform: "linux",
    cancelId: 0,
    installButtons: ["Cancel", "Install"],
    updateButtons: ["Cancel", "Update"],
  },
])(
  "keeps Cancel the safe default in install and update reviews on $platform",
  async ({ platform, cancelId, installButtons, updateButtons }) => {
    const originalPlatform = process.platform
    Object.defineProperty(process, "platform", { value: platform })
    try {
      mock.response = cancelId
      expect(await call("install", 1)).toBe(false)
      expect((await listing(1)).plugins).toHaveLength(0)
      expect(mock.messageOptions.at(-1)).toMatchObject({
        buttons: installButtons,
        defaultId: cancelId,
        cancelId,
        checkboxLabel: expect.stringContaining(".csv"),
        checkboxChecked: false,
      })

      mock.response = 1 - cancelId
      expect(await call("install", 1)).toBe(true)
      expect((await listing(1)).plugins[0].manifest.version).toBe("1.0.0")
      await packageVersion("2.0.0")

      mock.response = cancelId
      expect(await call("install", 1)).toBe(false)
      expect((await listing(1)).plugins[0].manifest.version).toBe("1.0.0")
      expect(mock.messageOptions.at(-1)).toMatchObject({
        buttons: updateButtons,
        defaultId: cancelId,
        cancelId,
      })
      expect(mock.messageOptions.at(-1)).not.toHaveProperty("checkboxLabel")

      mock.response = 1 - cancelId
      expect(await call("install", 1)).toBe(true)
      expect((await listing(1)).plugins[0].manifest.version).toBe("2.0.0")
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform })
    }
  }
)

it("marketplace installs reuse permission approval and Space isolation", async () => {
  const download = vi
    .spyOn(PluginRegistry.prototype, "download")
    .mockResolvedValue(await fs.readFile(mock.selected))
  mock.selected = "missing-file-picker-result"
  mock.response = "cancel"
  expect(await call("install", 1, false, id)).toBe(false)
  expect((await listing(1)).plugins).toHaveLength(0)
  mock.response = "confirm"
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
    mock.response = "cancel"
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
  mock.checkboxChecked = true
  mock.response = "cancel"
  expect(await call("installPrepared", 1, preview.token)).toBe(false)
  expect(await call("packagePreviews", 1)).toEqual([preview])
  expect(mock.messageOptions.at(-1)).toMatchObject({
    message: expect.stringContaining("Space: Space 1"),
    checkboxLabel: "Open .csv files with this plugin by default in this Space",
    checkboxChecked: false,
  })
  expect((await listing(3)).plugins).toHaveLength(0)
  expect((await listing(1)).space?.associations).toEqual({})
  mock.response = "confirm"
  expect(await call("installPrepared", 1, preview.token)).toBe(true)
  expect(await call("packagePreviews", 1)).toEqual([])
  expect((await listing(1)).plugins[0]).toMatchObject({
    enabled: true,
    manifest: { version: "1.0.0" },
  })
  expect((await listing(1)).space?.associations).toEqual({
    ".csv": `${id}/csv`,
  })
  expect(await call("open", 1, "data.csv")).toMatchObject({
    instance: { editor: { key: `${id}/csv` } },
  })
  expect(await call("open", 2, "data.csv")).toEqual({ instance: null })
  await expect(call("installPrepared", 1, preview.token)).rejects.toThrow(
    /preview/
  )
  await call("enable", 1, id, false)
  await call("enable", 2, id, true)
  await registered.openPackage(file)
  const update = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  expect(await call("installPrepared", 1, update.token)).toBe(true)
  expect(mock.messageOptions.at(-1)).not.toHaveProperty("checkboxLabel")
  expect((await listing(1)).plugins[0]).toMatchObject({
    enabled: false,
    manifest: { version: "2.0.0" },
  })
  expect((await listing(2)).plugins[0].enabled).toBe(true)
  expect((await listing(2)).space?.associations).toEqual({})
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
  expect(mock.messageOptions.at(-1)).toMatchObject({ checkboxChecked: false })
  expect((await listing(1)).space?.associations).toEqual({})
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

it("opts into unambiguous marketplace file editors while protecting Eidos Files", async () => {
  await packageVersion("1.0.0", {
    views: [
      { id: "drawing", title: "Drawing", kind: "file", entry: "./csv.ts" },
      { id: "outline", title: "Outline", kind: "file", entry: "./csv.ts" },
    ],
    placements: [
      {
        location: "file/open",
        view: "drawing",
        extensions: [".canvas", ".eidos", ".svg"],
      },
      {
        location: "file/open",
        view: "drawing",
        extensions: [".canvas", ".sketch"],
      },
      { location: "file/open", view: "outline", extensions: [".svg"] },
    ],
  })
  vi.spyOn(PluginRegistry.prototype, "download").mockResolvedValue(
    await fs.readFile(mock.selected)
  )
  mock.checkboxChecked = true
  const store = new PluginStore(path.join(mock.directory, "plugins"))
  await store.associate(".canvas", "builtin", "space-1")
  await store.associate(".canvas", "builtin", "space-2")
  expect(await call("installMarketplace", 1, id)).toBe(true)
  expect(mock.messageOptions.at(-1)).toMatchObject({
    checkboxLabel:
      "Open .canvas, .sketch files with this plugin by default in this Space",
    detail: expect.stringContaining("multiple editors for .svg. Use Open with"),
  })
  expect((await listing(1)).space?.associations).toEqual({
    ".canvas": `${id}/drawing`,
    ".sketch": `${id}/drawing`,
  })
  expect((await listing(1)).associations).toEqual({})
  expect((await listing(2)).space?.associations).toEqual({
    ".canvas": "builtin",
  })
  expect(await store.resolve("diagram.CANVAS", "space-1")).toMatchObject({
    editor: { key: `${id}/drawing` },
  })
  expect(await store.resolve("data.eidos", "space-1")).toEqual({ editor: null })
  expect(await store.resolve("diagram.svg", "space-1")).toEqual({
    editor: null,
  })
  expect(await call("editors", 1, "diagram.svg")).toHaveLength(2)
  await store.associate(".svg", "builtin", "space-1")
  await store.associate(".canvas", "builtin")
  await expect(
    call("resetSpaceEditorDefaults", 2, "space-1", id)
  ).rejects.toThrow("Space changed before resetting file defaults")
  expect(await store.resolve("diagram.canvas", "space-1")).toMatchObject({
    editor: { key: `${id}/drawing` },
  })
  await call("resetSpaceEditorDefaults", 1, "space-1", id)
  expect((await listing(1)).space?.associations).toEqual({ ".svg": "builtin" })
  expect((await listing(1)).associations).toEqual({ ".canvas": "builtin" })
  expect((await listing(2)).space?.associations).toEqual({
    ".canvas": "builtin",
  })
  expect(await store.resolve("diagram.canvas", "space-1")).toEqual({
    editor: null,
  })
})

it("resolves Space defaults like the actual opener and rejects writes after a context change", async () => {
  expect(await call("install", 1)).toBe(true)
  expect(await call("getSpaceFileEditorSettings", 3)).toBeNull()
  expect(() => call("openSpaceFileEditorSettings", 1, ".eidos")).toThrow(
    "Invalid file extension"
  )
  await call("openSpaceFileEditorSettings", 1, ".csv")
  expect(mock.openSpaceFileEditorSettings).toHaveBeenCalledWith(
    events.get(1)?.sender,
    ".csv"
  )

  const store = new PluginStore(path.join(mock.directory, "plugins"))
  const key = `${id}/csv`
  await call("associate", 1, ".csv", key)
  await store.associate(".tsv", "builtin", "space-1")
  settingsContext = {
    contextId: "settings-a",
    spaceName: "Space 1",
    spaceId: "space-1",
    focusExtension: ".csv",
  }
  const focused = async () =>
    (await call("getSpaceFileEditorSettings", 3)) as SpaceFileEditorSettings
  expect(await call("getSpaceFileEditorSettings", 1)).toBeNull()
  expect(await focused()).toMatchObject({
    focusExtension: ".csv",
    spaceName: "Space 1",
    extensions: expect.arrayContaining([
      {
        extension: ".csv",
        override: null,
        deviceEditor: "CSV",
        editors: [{ key, label: "CSV" }],
      },
    ]),
  })
  expect(await store.resolve("table.csv", "space-1")).toMatchObject({
    editor: { key },
  })
  expect(await store.resolve("table.csv", "space-2")).toMatchObject({
    editor: null,
  })
  await expect(
    call("setSpaceFileEditorDefault", 1, "settings-a", ".csv", "builtin")
  ).rejects.toThrow("Space changed before saving file defaults")
  await call("setSpaceFileEditorDefault", 3, "settings-a", ".csv", "builtin")
  expect(
    (await focused()).extensions.find(({ extension }) => extension === ".csv")
  ).toMatchObject({ override: "builtin", deviceEditor: "CSV" })
  expect(await store.resolve("table.csv", "space-1")).toEqual({ editor: null })
  await call("setSpaceFileEditorDefault", 3, "settings-a", ".csv", null)
  expect((await listing(1)).space?.associations).toEqual({ ".tsv": "builtin" })
  expect((await listing(1)).associations).toEqual({ ".csv": key })
  expect((await listing(2)).space?.associations).toEqual({})

  await call("setSpaceFileEditorDefault", 3, "settings-a", ".csv", key)
  await call("enable", 1, id, false)
  expect(
    (await focused()).extensions.find(({ extension }) => extension === ".csv")
  ).toMatchObject({ override: key, deviceEditor: null, editors: [] })
  expect(await store.resolve("table.csv", "space-1")).toMatchObject({
    editor: null,
    warning: expect.stringContaining("unavailable"),
  })
  await expect(
    call("setSpaceFileEditorDefault", 3, "settings-a", ".csv", key)
  ).rejects.toThrow("Editor is unavailable for this extension")

  const writeFile = fs.writeFile
  vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
    await writeFile(...args)
    if (typeof args[0] === "string" && /config-.*\.tmp$/.test(args[0]))
      settingsContext = {
        contextId: "settings-b",
        spaceName: "Space 2",
        spaceId: "space-2",
      }
  })
  await expect(
    call("setSpaceFileEditorDefault", 3, "settings-a", ".csv", null)
  ).rejects.toThrow("Space changed before saving file defaults")
  expect((await listing(1)).space?.associations).toEqual({
    ".csv": key,
    ".tsv": "builtin",
  })
  expect((await listing(1)).associations).toEqual({ ".csv": key })
  expect((await listing(2)).space?.associations).toEqual({})
})

it("preserves the Space's previous default when the install fails after review", async () => {
  await packageVersion(
    "1.0.0",
    {
      background: { entry: "./background.js" },
    },
    { "./background.js": "globalThis.onmessage = () => {}" }
  )
  vi.spyOn(PluginRegistry.prototype, "download").mockResolvedValue(
    await fs.readFile(mock.selected)
  )
  vi.spyOn(PluginStore.prototype, "approveBackground").mockRejectedValueOnce(
    new Error("Grant write failed")
  )
  const store = new PluginStore(path.join(mock.directory, "plugins"))
  await store.associate(".csv", "builtin", "space-1")
  mock.checkboxChecked = true
  await expect(call("installMarketplace", 1, id)).rejects.toThrow(
    "Grant write failed"
  )
  expect((await listing(1)).space?.associations).toEqual({ ".csv": "builtin" })
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

it("opens a GitHub package in the requesting Space and installs the exact reviewed bytes", async () => {
  const url =
    "https://github.com/example/csv/releases/download/v1.0.0/example.eidos-plugin"
  const bytes = new Uint8Array(await fs.readFile(mock.selected))
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(bytes))
  expect(await call("previewGitHubPackage", 1, url)).toBe(true)
  const preview = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  expect(preview).toMatchObject({
    githubRepository: "example/csv",
    filename: "example.eidos-plugin",
    manifest: { id, version: "1.0.0" },
  })
  expect((await listing(1)).plugins).toHaveLength(0)
  expect(mock.messageOptions).toHaveLength(0)
  await expect(call("installPrepared", 2, preview.token)).rejects.toThrow(
    /preview/
  )
  switchTestSpace(1, "space-2")
  await expect(call("installPrepared", 1, preview.token)).rejects.toThrow(
    /Space changed/
  )
  switchTestSpace(1, "space-1")
  mock.response = "cancel"
  expect(await call("installPrepared", 1, preview.token)).toBe(false)
  expect(mock.messageOptions.at(-1)).toMatchObject({
    detail: expect.stringContaining("GitHub release: example/csv"),
  })
  mock.response = "confirm"
  expect(await call("installPrepared", 1, preview.token)).toBe(true)
  expect((await listing(1)).plugins[0]).toMatchObject({
    enabled: true,
    manifest: { version: "1.0.0" },
  })
  expect(network).toHaveBeenCalledTimes(1)
})

it("discards a cancelled GitHub download before opening the main workbench detail", async () => {
  const bytes = new Uint8Array(await fs.readFile(mock.selected))
  let finish!: (response: Response) => void
  const network = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const preview = call(
    "previewGitHubPackage",
    1,
    "https://github.com/example/csv/releases/download/v1.0.0/example.eidos-plugin"
  )
  await call("cancelGitHubPackagePreview", 1)
  expect(network.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  finish(new Response(bytes))
  expect(await preview).toBe(false)
  expect(mock.showPluginInstall).not.toHaveBeenCalled()
  expect(await call("packagePreviews", 1)).toEqual([])
})

it("removes only successfully installed copies of a preview", async () => {
  await call("previewPackage", 1, mock.selected)
  const first = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  await call("previewPackage", 1, mock.selected)
  const duplicate = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  await packageVersion("2.0.0")
  await call("previewPackage", 1, mock.selected)
  const update = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  await call("previewPackage", 2, mock.selected)
  const otherOwner = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  expect(await call("installPrepared", 1, first.token)).toBe(true)
  expect(await call("packagePreviews", 1)).toEqual([update])
  expect(await call("packagePreviews", 2)).toEqual([otherOwner])
  await expect(call("installPrepared", 1, duplicate.token)).rejects.toThrow(
    /preview/
  )
})

it("rejects an excess package without evicting accepted previews and frees capacity after success", async () => {
  for (let index = 0; index < 8; index++) {
    await packageVersion(`${index + 1}.0.0`)
    await call("previewPackage", index < 4 ? 1 : 2, mock.selected)
  }
  const first = (await call("packagePreviews", 1)) as PluginPackagePreview[]
  const second = (await call("packagePreviews", 2)) as PluginPackagePreview[]
  await expect(registered.openPackage(mock.selected)).rejects.toThrow(
    /Finish reviewing an open package/
  )
  expect(await call("packagePreviews", 1)).toEqual(first)
  expect(await call("packagePreviews", 2)).toEqual(second)
  mock.response = "cancel"
  expect(await call("installPrepared", 1, first[0].token)).toBe(false)
  expect(await call("packagePreviews", 1)).toEqual(first)
  await expect(call("previewPackage", 1, mock.selected)).rejects.toThrow(
    /Finish reviewing an open package/
  )
  const failed = call("installPrepared", 1, first[0].token)
  switchTestSpace(1, "changed-space")
  await expect(failed).rejects.toThrow("Space changed before installation")
  switchTestSpace(1, "space-1")
  expect(await call("packagePreviews", 1)).toEqual(first)
  mock.response = "confirm"
  expect(await call("installPrepared", 1, first[0].token)).toBe(true)
  expect(await call("packagePreviews", 1)).toEqual(first.slice(1))
  expect(await call("previewPackage", 1, mock.selected)).toBe(true)
  expect(await call("packagePreviews", 1)).toHaveLength(4)
  expect(await call("packagePreviews", 2)).toEqual(second)
})

it("keeps a failed queued preview available for retry", async () => {
  const bytes = await fs.readFile(mock.selected)
  let finish!: (bytes: Uint8Array) => void
  vi.spyOn(PluginRegistry.prototype, "download").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  await call("previewPackage", 2, mock.selected)
  const preview = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  const first = call("installMarketplace", 1, id)
  await vi.waitFor(() => expect(finish).toBeDefined())
  const second = call("installPrepared", 2, preview.token)
  const results = Promise.allSettled([first, second])
  switchTestSpace(2, "space-three")
  finish(bytes)
  expect((await results)[1]).toMatchObject({ status: "rejected" })
  expect(await call("packagePreviews", 2)).toEqual([preview])
  switchTestSpace(2, "space-2")
  expect(await call("installPrepared", 2, preview.token)).toBe(true)
  expect(await call("packagePreviews", 2)).toEqual([])
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
  const installed = await listing(1)
  expect(installed.space?.plugins[id].backgroundApproval).toBe(
    installed.plugins[0].hash
  )
  expect(mock.messageOptions).toHaveLength(1)
  expect(mock.messageOptions[0]).toMatchObject({
    detail: expect.stringContaining("automatically when this Space opens"),
  })
})

it("reviews background permission when enabling in another Space and preserves cancellation", async () => {
  const start = vi
    .spyOn(PluginService.prototype, "autoStartBackgrounds")
    .mockResolvedValue()
  await fs.writeFile(
    mock.selected,
    encodePackage(
      {
        apiVersion: 1,
        requires: { pluginApi: "3.8.0" },
        id,
        name: "Background",
        version: "1.0.0",
        background: { entry: "./background.js" },
      },
      { "./background.js": "globalThis.onmessage = () => {}" }
    )
  )
  await call("install", 1, false, undefined, mock.selected)
  mock.response = 0
  expect(await call("enable", 2, id, true)).toBe(false)
  expect((await listing(2)).plugins[0].enabled).toBe(false)
  mock.response = 1
  expect(await call("enable", 2, id, true)).toBe(true)
  const second = await listing(2)
  expect(second.space?.plugins[id].backgroundApproval).toBe(
    second.plugins[0].hash
  )
  const count = mock.messageOptions.length
  await call("enable", 2, id, true)
  expect(mock.messageOptions).toHaveLength(count)
  expect(start).toHaveBeenCalled()
})

it("one installation review grants both background and the resolved native program without starting it", async () => {
  await fs.writeFile(
    mock.selected,
    encodePackage(
      {
        apiVersion: 1,
        id,
        name: "Agent",
        version: "1.0.0",
        requires: { pluginApi: "3.8.0" },
        background: { entry: "./background.js" },
        sidecar: { command: "node", args: ["--version"] },
      },
      { "./background.js": "globalThis.onmessage = () => {}" }
    )
  )
  await call("install", 1, false, undefined, mock.selected)
  const installed = await listing(1),
    scope = installed.space!.plugins[id]
  expect(scope.backgroundApproval).toBe(installed.plugins[0].hash)
  expect(scope.sidecarApproval?.hash).toBe(installed.plugins[0].hash)
  expect(scope.sidecarApproval?.identity).toMatch(/^[a-f0-9]{64}$/)
  expect(mock.messageOptions).toHaveLength(1)
  expect(mock.messageOptions[0]).toMatchObject({
    detail: expect.stringContaining("operating system permissions"),
  })
})

it("reinstalling the same revision reviews missing legacy grants once and cancellation preserves the old state", async () => {
  await fs.writeFile(
    mock.selected,
    encodePackage(
      {
        apiVersion: 1,
        id,
        name: "Agent",
        version: "1.0.0",
        requires: { pluginApi: "3.8.0" },
        background: { entry: "./background.js" },
      },
      { "./background.js": "globalThis.onmessage = () => {}" }
    )
  )
  await call("install", 1, false, undefined, mock.selected)
  const configFile = path.join(mock.directory, "plugins/config.json")
  const config = JSON.parse(await fs.readFile(configFile, "utf8"))
  delete config.spaces["space-1"].plugins[id].backgroundApproval
  await fs.writeFile(configFile, JSON.stringify(config))
  await registered.openPackage(mock.selected)
  const preview = mock.showPluginInstall.mock.calls.at(
    -1
  )![1] as PluginPackagePreview
  mock.response = "cancel"
  expect(await call("installPrepared", 1, preview.token)).toBe(false)
  expect(
    (await listing(1)).space?.plugins[id].backgroundApproval
  ).toBeUndefined()
  mock.response = "confirm"
  expect(await call("installPrepared", 1, preview.token)).toBe(true)
  const installed = await listing(1)
  expect(installed.space?.plugins[id].backgroundApproval).toBe(
    installed.plugins[0].hash
  )
  expect(mock.messageOptions).toHaveLength(3)
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
  mock.response = "cancel"
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
