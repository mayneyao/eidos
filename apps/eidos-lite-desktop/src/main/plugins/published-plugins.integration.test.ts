import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { decodePackage, packageHash } from "@eidos.space/plugin-runtime/package"
import {
  checkPluginCompatibility,
  usesWorkerFetch,
} from "@eidos.space/plugin-runtime/compatibility"
import { sandboxCsp } from "@eidos.space/plugin-runtime/sandbox"
import { PluginStore } from "./plugin-store"
import { PluginService, type PluginDocumentSession } from "./plugin-service"

// Supply the pinned catalog and checksum-verified Release assets during release acceptance.
const catalog = process.env.EIDOS_PLUGIN_TEST_CATALOG
const archives = process.env.EIDOS_PLUGIN_TEST_ARCHIVES
it.skipIf(!catalog || !archives)(
  "preserves published plugin packages, state and legacy networking",
  async () => {
    const entries = (
      JSON.parse(await fs.readFile(catalog!, "utf8")) as {
        plugins: {
          id: string
          version: string
          asset: string
          sha256: string
        }[]
      }
    ).plugins
    expect(entries.length).toBeGreaterThan(0)
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "published-plugins-")
    )
    const store = new PluginStore(directory)
    const service = new PluginService(store)
    const session = { canonical: { id: "acceptance" } } as PluginDocumentSession
    try {
      for (const entry of entries) {
        const bytes = await fs.readFile(
          path.join(archives!, path.basename(entry.asset))
        )
        expect(packageHash(bytes), entry.id).toBe(entry.sha256)
        const pkg = decodePackage(bytes)
        expect(pkg.manifest.id).toBe(entry.id)
        expect(pkg.manifest.version).toBe(entry.version)
        expect(
          checkPluginCompatibility(pkg.manifest, "eidos-lite").compatible,
          entry.id
        ).toBe(true)
        expect(usesWorkerFetch(pkg.manifest), entry.id).toBe(false)
        const csp = sandboxCsp(
          pkg.manifest.browser,
          usesWorkerFetch(pkg.manifest)
        )
        for (const origin of pkg.manifest.browser?.networkOrigins ?? [])
          expect(csp).toContain(origin)
        const hash = await store.install(bytes, "acceptance")
        const before = await store.config()
        await store.install(bytes, "another-space")
        expect(await store.config(), entry.id).toEqual(before)
        expect((await new PluginStore(directory).read(hash)).manifest).toEqual(
          pkg.manifest
        )
        if (
          pkg.manifest.extension &&
          (pkg.manifest.actions?.length || pkg.manifest.formatters?.length)
        ) {
          const opened = await service.openExtension(1, session, entry.id)
          expect(opened.instance).toBeDefined()
          service.close(1, opened.instance!.ticket)
        }
        for (const view of pkg.manifest.views ?? []) {
          if (view.kind !== "page") continue
          const opened = await service.openPage(
            1,
            session,
            `${entry.id}/${view.id}`
          )
          expect(opened.instance).toBeDefined()
          service.close(1, opened.instance!.ticket)
        }
        expect(service.instances.size).toBe(0)
      }
    } finally {
      service.closeOwner(1)
      await fs.rm(directory, { recursive: true, force: true })
    }
  },
  60000
)
