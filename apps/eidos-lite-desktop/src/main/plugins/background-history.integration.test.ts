import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import {
  PluginBackgroundHost,
  type BackgroundBinding,
} from "./plugin-background"
import { PluginStorage } from "./plugin-storage"
import { compilePlugin } from "@eidos.space/plugin-runtime/compiler"
import { decodePackage } from "@eidos.space/plugin-runtime/package"
import { PluginStore } from "./plugin-store"
import { PluginService } from "./plugin-service"

const binary = process.env.EIDOS_PLUGIN_SANDBOX_BINARY
it.skipIf(!binary || !existsSync(binary))(
  "starts the history plugin without a View, stays stopped on catalog reads, and starts on reopening",
  async () => {
    const compiled = await compilePlugin(
      path.resolve("../../packages/plugin-sandbox/test-fixtures/recent-history")
    )
    const pkg = decodePackage(compiled.bytes)
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "history-autostart-")
    )
    const store = new PluginStore(directory)
    const host = new PluginBackgroundHost(binary!, async () => true)
    const service = new PluginService(store, undefined, undefined, host)
    const hash = await store.install(compiled.bytes, "space")
    await store.enable(pkg.manifest.id, true, "space")
    const binding: BackgroundBinding = {
      owner: 1,
      space: "space",
      hash,
      manifest: pkg.manifest,
      code: pkg.modules[pkg.manifest.background!.entry]!,
      authorize: async () => {},
    }
    const signal = new AbortController().signal
    try {
      await service.autoStartBackgrounds(1, "space")
      expect(service.instances.size).toBe(0)
      expect(
        await host.request(binding, "background.isRunning", null, signal)
      ).toBe(true)
      await host.fileOpened(1, "space", {
        id: "a",
        path: "a.md",
        openedAt: 100,
      })
      const status = await host.request(
        binding,
        "background.request",
        { type: "status" },
        signal
      )
      expect(JSON.stringify(status)).toContain("a.md")
      await host.request(binding, "background.stop", null, signal)
      await store.list("space")
      expect(
        await host.request(binding, "background.isRunning", null, signal)
      ).toBe(false)
      service.closeOwner(1)
      await service.autoStartBackgrounds(1, "space")
      expect(
        await host.request(binding, "background.isRunning", null, signal)
      ).toBe(true)
    } finally {
      host.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
  30000
)
it.skipIf(!binary || !existsSync(binary))(
  "supports top-level storage initialization and 4 MiB binary roundtrips",
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "history-large-"))
    const storage = new PluginStorage(directory)
    const host = new PluginBackgroundHost(binary!, async () => true)
    const binding: BackgroundBinding = {
      owner: 1,
      space: "space",
      hash: "large",
      authorize: async () => {},
      manifest: {
        apiVersion: 1,
        id: "test.large",
        name: "Large",
        version: "1.0.0",
        background: { entry: "./worker.js" },
        storage: { maxBytes: 8388608 },
      },
      storageRequest: (method, params, active) =>
        storage.request(method, params, 8388608, active),
      code: `
      const initial = await ctx.storage.read("absent");
      onmessage = async ({data}) => {
        const bytes = new Uint8Array(4 * 1024 * 1024); bytes[0] = 255; bytes[bytes.length - 1] = 42;
        await ctx.storage.write("large", bytes);
        const restored = await ctx.storage.read("large");
        postMessage({requestId:data.requestId, data:{initial, length:restored.length, first:restored[0], last:restored[restored.length - 1]}});
      };
    `,
    }
    try {
      await host.start(binding)
      expect(
        await host.request(
          binding,
          "background.request",
          null,
          new AbortController().signal
        )
      ).toEqual({ initial: null, length: 4194304, first: 255, last: 42 })
    } finally {
      host.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
  30000
)
it.skipIf(!binary || !existsSync(binary))(
  "runs the shipped example and restores counts after restart",
  async () => {
    const compiled = await compilePlugin(
      path.resolve("../../packages/plugin-sandbox/test-fixtures/recent-history")
    )
    const pkg = decodePackage(compiled.bytes)
    const directory = await mkdtemp(path.join(os.tmpdir(), "history-example-"))
    const storage = new PluginStorage(directory)
    const host = new PluginBackgroundHost(binary!, async () => true)
    const binding: BackgroundBinding = {
      owner: 1,
      space: "space",
      hash: "example",
      authorize: async () => {},
      manifest: pkg.manifest,
      code: pkg.modules[pkg.manifest.background!.entry]!,
      storageRequest: (method, params, active) =>
        storage.request(method, params, 16777216, active),
    }
    const signal = new AbortController().signal
    try {
      await host.start(binding)
      await host.fileOpened(1, "space", {
        id: "a",
        path: "a.md",
        openedAt: 100,
      })
      await host.fileOpened(1, "space", {
        id: "b",
        path: "a.md",
        openedAt: 200,
      })
      await vi.waitFor(
        async () => {
          expect(
            await storage.request(
              "storage.list",
              { prefix: "history/space/" },
              16777216,
              () => {}
            )
          ).toHaveLength(1)
        },
        { timeout: 12000, interval: 500 }
      )
      expect(
        await host.request(
          binding,
          "background.request",
          { command: "status" },
          signal
        )
      ).toMatchObject({
        rows: [{ path: "a.md", count: 2, lastOpenedAt: 200 }],
        pending: 0,
      })
      await host.request(binding, "background.stop", null, signal)
      await host.start(binding)
      await host.fileOpened(1, "space", {
        id: "c",
        path: "b.md",
        openedAt: 300,
      })
      expect(
        await host.request(
          binding,
          "background.request",
          { command: "status" },
          signal
        )
      ).toMatchObject({
        rows: [
          { path: "b.md", count: 1, lastOpenedAt: 300 },
          { path: "a.md", count: 2, lastOpenedAt: 200 },
        ],
        pending: 1,
      })
    } finally {
      host.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
  20000
)
it.skipIf(!binary || !existsSync(binary))(
  "records host opens and persists after the caller disappears in real QuickJS",
  async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "history-integration-")
    )
    const storage = new PluginStorage(directory)
    const host = new PluginBackgroundHost(binary!, async () => true)
    const binding: BackgroundBinding = {
      owner: 1,
      space: "space",
      hash: "revision",
      authorize: async () => {},
      manifest: {
        apiVersion: 1,
        id: "test.history",
        name: "History",
        version: "1.0.0",
        requires: { pluginApi: "3.6.0" },
        background: { entry: "./background.js", fileHistory: true },
        storage: { maxBytes: 4096 },
      },
      storageRequest: (method, params, active) =>
        storage.request(method, params, 4096, active),
      code: `
      let count = 0;
      ctx.events.on("file.opened", () => { count++; });
      onmessage = async ({data}) => {
        if (data.data === "save") await ctx.storage.write("history", new TextEncoder().encode(String(count)));
        const saved = await ctx.storage.read("history");
        postMessage({requestId:data.requestId, data:{count, saved:saved ? new TextDecoder().decode(saved) : null}});
      };
    `,
    }
    try {
      const caller = new AbortController()
      await host.start(binding, caller.signal)
      caller.abort()
      await host.fileOpened(1, "space", { id: "1", path: "a.md", openedAt: 1 })
      await host.fileOpened(2, "space", { id: "2", path: "b.md", openedAt: 2 })
      expect(
        await host.request(
          binding,
          "background.request",
          "save",
          new AbortController().signal
        )
      ).toEqual({ count: 1, saved: "1" })
      await host.request(
        binding,
        "background.stop",
        null,
        new AbortController().signal
      )
      expect(
        await storage.request(
          "storage.read",
          { key: "history" },
          4096,
          () => {}
        )
      ).toBe("MQ==")
    } finally {
      host.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000
)
