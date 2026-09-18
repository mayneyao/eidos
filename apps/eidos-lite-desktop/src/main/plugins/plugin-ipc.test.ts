import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodePackage } from "@eidos.space/plugin-runtime/package"
import type { PluginListing, PluginOpenResult } from "../../shared/plugins"
import { PLUGIN_CHANNELS } from "../../shared/plugins"
import type { WindowController } from "../window-controller"
import { readTextFilePreview, saveTextFile } from "../space/text-file-preview"

const mock = vi.hoisted(() => ({
  directory: "",
  selected: "",
  response: 1,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  windows: [] as {
    webContents: {
      id: number
      send: ReturnType<typeof vi.fn>
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
    showMessageBox: async () => ({ response: mock.response }),
  },
}))
import { registerPluginIpc } from "./plugin-ipc"
import { PluginRegistry } from "./plugin-registry"
const id = "example.csv"
let dispose: () => void
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
        id,
        name: "CSV",
        version,
        views: [
          { id: "csv", title: "CSV", context: "document", entry: "./csv.ts" },
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
  mock.windows = [1, 2, 3].map((id) => ({
    webContents: { id, send: vi.fn(), isDestroyed: () => false },
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
        canonical: { id: `space-${id}` },
        previewTextFile: (file: string) =>
          readTextFilePreview(mock.directory, file),
        saveTextFile: (request: Parameters<typeof saveTextFile>[1]) =>
          saveTextFile(mock.directory, request),
      },
    ])
  )
  dispose = registerPluginIpc({
    requireSession: (sender: { id: number }) => {
      const session = sessions.get(sender.id)
      if (!session) throw new Error("No active Space")
      return session
    },
  } as unknown as WindowController)
})
afterEach(async () => {
  vi.restoreAllMocks()
  dispose?.()
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

it("global settings updates reload active instances without enabling other Spaces", async () => {
  await call("install", 1)
  const opened = (await call(
    "open",
    1,
    "data.csv",
    `${id}/csv`
  )) as PluginOpenResult
  await packageVersion("2.0.0")
  await call("install", 3)
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
