import path from "node:path"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import { expect, it } from "vitest"
import { compilePlugin } from "@eidos.space/plugin-runtime/compiler"
import { decodePackage } from "@eidos.space/plugin-runtime/package"
import { PluginBackgroundHost } from "./plugin-background"
import { PluginStore } from "./plugin-store"
import { PluginService, type PluginDocumentSession } from "./plugin-service"

const binary = path.resolve(
  "resources/plugin-sandbox",
  process.platform === "win32" ? "plugin-sandbox.exe" : "plugin-sandbox"
)
it.runIf(existsSync(binary))(
  "selects via Lite RPC, connects in real QuickJS with mock BLE, and retains the connection after page close",
  async () => {
    const compiled = await compilePlugin(
      path.resolve("../../packages/plugin-sandbox/examples/lite-bluetooth")
    )
    const pkg = decodePackage(compiled.bytes)
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lite-ble-test-"))
    const store = new PluginStore(directory)
    const backgrounds = new PluginBackgroundHost(binary, async () => true, {
      chooseDevice: async () => ({
        id: "mock-battery",
        name: "Test Battery",
        services: [],
      }),
      bluetoothMock: true,
    })
    const service = new PluginService(store, undefined, undefined, backgrounds)
    const session = { canonical: { id: "space-a" } } as PluginDocumentSession
    let id = 0
    const request = (ticket: string, method: string, params: unknown = null) =>
      service.request(1, session, ticket, {
        protocol: "eidos-plugin",
        apiVersion: 1,
        id: String(++id),
        method,
        params,
      })
    try {
      await store.install(compiled.bytes, "space-a")
      const ticket = (
        await service.openPage(1, session, pkg.manifest.id + "/battery")
      ).instance!.ticket
      expect(
        (await request(ticket, "background.requestDevice")).response
      ).toMatchObject({ result: { id: "mock-battery" } })
      expect(
        (
          await request(ticket, "background.request", {
            data: { command: "status" },
          })
        ).response
      ).toMatchObject({ result: { connected: false } })
      expect(
        (
          await request(ticket, "background.request", {
            data: { command: "connect", id: "forged-id" },
          })
        ).response
      ).toMatchObject({ result: { ok: false } })
      expect(
        (
          await request(ticket, "background.request", {
            data: { command: "connect", id: "mock-battery" },
          })
        ).response
      ).toMatchObject({
        result: { ok: true, connected: true, percent: expect.any(Number) },
      })
      service.close(1, ticket)
      const extension = (
        await service.openExtension(1, session, pkg.manifest.id)
      ).instance!.ticket
      expect(
        (
          await request(extension, "extension.ready", {
            actions: pkg.manifest.actions!.map((action) => action.id),
          })
        ).response
      ).not.toHaveProperty("error")
      let announce!: (value: { invocation: string }) => void
      const announced = new Promise<{ invocation: string }>((resolve) => {
        announce = resolve
      })
      const completion = service.invoke(
        1,
        session,
        extension,
        "connect",
        undefined,
        undefined,
        (event) => {
          if (event.observation === "action.run")
            announce(event.value as { invocation: string })
        }
      )
      const { invocation } = await announced
      expect(
        (
          await request(extension, "background.request", {
            invocation,
            args: { data: { command: "status" } },
          })
        ).response
      ).toMatchObject({ result: { connected: true, id: "mock-battery" } })
      expect(
        (
          await request(extension, "background.requestDevice", {
            invocation,
            args: null,
          })
        ).response
      ).toMatchObject({ result: { id: "mock-battery" } })
      expect(
        (
          await request(extension, "background.request", {
            invocation,
            args: { data: { command: "connect", id: "mock-battery" } },
          })
        ).response
      ).toMatchObject({ result: { ok: true, connected: true } })
      await request(extension, "action.complete", { invocation })
      await completion
      expect(
        (
          await request(extension, "background.requestDevice", {
            invocation,
            args: null,
          })
        ).response
      ).toMatchObject({ error: { code: "PERMISSION_DENIED" } })
      const reopened = (
        await service.openPage(1, session, pkg.manifest.id + "/battery")
      ).instance!.ticket
      await request(reopened, "background.stop")
      // A normal restart has no BLE grants.
      expect(
        (
          await request(reopened, "background.request", {
            data: { command: "connect", id: "mock-battery" },
          })
        ).response
      ).toMatchObject({ result: { ok: false } })
    } finally {
      service.closeOwner(1)
      backgrounds.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  },
  30000
)
