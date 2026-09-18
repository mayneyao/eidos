import { afterEach, describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  ArtifactStore,
  RevisionSession,
  type RevisionEvent,
  type RevisionHost,
} from "./revisions"
import { encodePackage } from "./package"
import type { CompiledPlugin } from "./compiler"

function candidate(revision: string): CompiledPlugin {
  const program = {
    format: 1 as const,
    manifest: {
      apiVersion: 1 as const,
      id: "local.page",
      name: revision,
      version: "1.0.0",
      views: [
        {
          id: "page",
          title: "Page",
          context: "page" as const,
          entry: "./page.ts",
        },
      ],
    },
    modules: { "./page.ts": "export default function mount() {}" },
  }
  return {
    program,
    bytes: encodePackage(program.manifest, program.modules),
    revision,
    dependencies: [],
  }
}
const temporary: string[] = []
afterEach(async () => {
  for (const file of temporary.splice(0))
    await fs.rm(file, { recursive: true, force: true })
})
describe("revision authoring state", () => {
  it("retains working code on compile failure, rolls back mount failure and accepts exact revisions", async () => {
    const mounted: string[] = [],
      disposed: string[] = [],
      events: RevisionEvent[] = [],
      accepted: string[] = []
    const host: RevisionHost = {
      authorize: async () => true,
      activate: async (program) => {
        if (program.manifest.name === "broken") throw Error("mount failed")
        mounted.push(program.manifest.name)
        return {
          dispose: () => {
            disposed.push(program.manifest.name)
          },
        }
      },
      event: (event) => events.push(event),
      persistAccepted: async (revision) => {
        accepted.push(revision)
      },
    }
    const session = new RevisionSession(host)
    await session.update(async () => candidate("one"))
    await expect(
      session.update(async () => {
        throw Error("compile failed")
      })
    ).rejects.toThrow("compile")
    expect(disposed).toEqual([])
    await expect(
      session.update(async () => candidate("broken"))
    ).rejects.toThrow("mount failed")
    expect(session.inspect().active).toBe("one")
    expect(mounted).toEqual(["one", "one"])
    await session.accept("one")
    await expect(session.accept("wrong")).rejects.toMatchObject({
      code: "STALE_REVISION",
    })
    expect(accepted).toEqual(["one"])
    expect(events.some((event) => event.phase === "rolled-back")).toBe(true)
    expect(events.map((event) => event.sequence)).toEqual(
      events.map((_, i) => i + 1)
    )
    session.dispose()
  })
  it("rechecks current authorization during rollback", async () => {
    let revoked = false
    const host: RevisionHost = {
      authorize: async () => !revoked,
      activate: async () => ({ dispose() {} }),
      event() {},
      async persistAccepted() {},
    }
    const session = new RevisionSession(host)
    await session.update(async () => candidate("one"))
    await session.update(async () => candidate("two"))
    revoked = true
    await expect(session.rollback("one")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    })
    expect(session.inspect().active).toBe("two")
    session.dispose()
  })
  it("revokes a pending mount when the session closes", async () => {
    let complete!: () => void
    let signal: AbortSignal | undefined
    let cleaned = false
    const session = new RevisionSession({
      authorize: async () => true,
      event() {},
      async persistAccepted() {},
      async activate(_program, scope) {
        signal = scope.signal
        await new Promise<void>((r) => {
          complete = r
        })
        return {
          dispose() {
            cleaned = true
          },
        }
      },
    })
    const update = session.update(async () => candidate("one"))
    while (!signal) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    session.dispose()
    expect(signal.aborted).toBe(true)
    complete()
    await expect(update).rejects.toMatchObject({ code: "INSTANCE_CLOSED" })
    expect(cleaned).toBe(true)
  })
  it("stores offline artifacts by verified content hash", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-plugin-artifacts-")
    )
    temporary.push(directory)
    const store = new ArtifactStore(directory),
      program = candidate("one")
    const hash = await store.put(program.bytes)
    expect((await new ArtifactStore(directory).read(hash)).manifest.name).toBe(
      "one"
    )
    await fs.writeFile(path.join(directory, `${hash}.eidos-plugin`), "tampered")
    await expect(store.read(hash)).rejects.toThrow("integrity")
    await expect(store.read("../../outside")).rejects.toThrow("hash")
  })
})
