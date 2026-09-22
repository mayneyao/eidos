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
import { PluginService } from "./plugin-service"
import { PluginConnections } from "./plugin-connections"
const id = "example.csv"
let registered: ReturnType<typeof registerPluginIpc>
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
  registered = registerPluginIpc({
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
