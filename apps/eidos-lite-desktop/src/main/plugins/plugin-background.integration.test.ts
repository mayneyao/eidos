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
  "runs the packaged page/command example through Lite RPC and real QuickJS",
  async () => {
    const compiled = await compilePlugin(
      path.resolve("../../packages/plugin-sandbox/examples/lite-background")
    )
    const pkg = decodePackage(compiled.bytes)
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "lite-background-test-")
    )
    const store = new PluginStore(directory)
    const backgrounds = new PluginBackgroundHost(binary, async () => true)
    const service = new PluginService(store, undefined, undefined, backgrounds)
    const session = { canonical: { id: "space-a" } } as PluginDocumentSession
    let id = 0
    const request = (
      ticket: string,
      method: string,
      params: unknown = null,
      owner = 1
    ) =>
      service.request(owner, session, ticket, {
        protocol: "eidos-plugin",
        apiVersion: 1,
        id: String(++id),
        method,
        params,
      })
    try {
      await store.install(compiled.bytes, "space-a")
      const page = await service.openPage(
        1,
        session,
        pkg.manifest.id + "/counter"
      )
      const ticket = page.instance!.ticket
      expect(
        (
          await request(ticket, "background.request", {
            data: { command: "increment" },
          })
        ).response
      ).toMatchObject({ result: { count: 1 } })
      expect(
        (
          await request(
            ticket,
            "background.request",
            { data: { command: "increment" } },
            2
          )
        ).response
      ).toMatchObject({ error: { code: "INSTANCE_CLOSED" } })
      service.close(1, ticket)
      const extension = (
        await service.openExtension(1, session, pkg.manifest.id)
      ).instance!.ticket
      await request(extension, "extension.ready", {
        actions: ["increment", "stop"],
      })
      let announce!: (value: { invocation: string }) => void
      const announced = new Promise<{ invocation: string }>((resolve) => {
        announce = resolve
      })
      const completion = service.invoke(
        1,
        session,
        extension,
        "increment",
        undefined,
        undefined,
        (event) => {
          if (event.observation === "action.run")
            announce(event.value as { invocation: string })
        }
      )
      const { invocation } = await announced
      const params = { invocation, args: { data: { command: "increment" } } }
      expect(
        (await request(extension, "background.request", params)).response
      ).toMatchObject({ result: { count: 2 } })
      await request(extension, "action.complete", { invocation })
      await completion
      expect(
        (await request(extension, "background.request", params)).response
      ).toMatchObject({ error: { code: "PERMISSION_DENIED" } })
      const reopened = (
        await service.openPage(1, session, pkg.manifest.id + "/counter")
      ).instance!.ticket
      expect(
        (
          await request(reopened, "background.request", {
            data: { command: "read" },
          })
        ).response
      ).toMatchObject({ result: { count: 2 } })
      await store.enable(pkg.manifest.id, false, "space-a")
      service.revoke(pkg.manifest.id, "space-a")
      expect(
        (
          await request(reopened, "background.request", {
            data: { command: "read" },
          })
        ).response
      ).toHaveProperty("error")
    } finally {
      service.closeOwner(1)
      backgrounds.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  },
  30000
)
