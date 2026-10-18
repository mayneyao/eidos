import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { EncryptedGraftHost } from "./encrypted-graft-host"
import {
  loadEidosGraftSdk,
  type EidosGraftRepositorySession,
} from "./graft-sdk-module"
import { startEncryptedSyncTestServer } from "./encrypted-sync-test-server"
import type { GraftEncryptedInput } from "../../shared/graft-sdk-contracts"
import type * as SyncEncryption from "../../shared/sync-encryption"

// Only the official-origin allowlist is replaced for this loopback fixture.
// Filesystem permissions, SDK, encryption, HTTP and repository operations are real.
vi.mock("../../shared/sync-encryption", async (importOriginal) => {
  const actual = await importOriginal<typeof SyncEncryption>()
  return {
    ...actual,
    assertSyncEncryptionBinding(remote: string, domain: string) {
      const url = new URL(remote)
      if (
        url.protocol === "http:" &&
        url.hostname === "127.0.0.1" &&
        domain === "https://staging.eidos.space"
      )
        return
      actual.assertSyncEncryptionBinding(remote, domain)
    },
  }
})

it("runs native encrypted enrollment, wrong password, two-way sync, restart and same-folder reconnection", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-native-e2ee-"))
  )
  const remote = await startEncryptedSyncTestServer()
  const first = remote.createRepository("first")
  const second = remote.createRepository("second")
  const sdk = loadEidosGraftSdk()
  const hosts: EncryptedGraftHost[] = []
  const sessions: EidosGraftRepositorySession[] = []
  const spaceA = path.join(root, "A")
  const spaceB = path.join(root, "B")
  const password = "synthetic integration password"
  const credentials = (
    device: string,
    connection = first,
    supplied = password
  ): GraftEncryptedInput => ({
    connection: {
      url: connection.url,
      uuid: connection.uuid,
      authenticationDomain: "https://staging.eidos.space",
      accountSubject: "synthetic-account",
      bearerToken: "synthetic-test-token",
      stateDirectory: path.join(root, device),
    },
    password: Buffer.from(supplied),
  })
  const host = () => {
    const result = new EncryptedGraftHost()
    hosts.push(result)
    return result
  }
  const open = async (directory: string) => {
    const result = await sdk.RepositorySession.open(directory)
    sessions.push(result)
    return result
  }
  try {
    expect(sdk.sdkVersion()).toBe("0.3.32")
    await fs.mkdir(spaceA)
    await fs.mkdir(spaceB)
    const fixture = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../eidos-file-web/fixtures/project-tracker.eidos"
    )
    await fs.copyFile(fixture, path.join(spaceA, "records.eidos"))
    await fs.writeFile(path.join(spaceA, "notes.txt"), "original local note\n")
    const initial = await open(spaceA)
    await initial.init()
    await initial.addAll()
    await initial.commit("Initial local history")
    await fs.writeFile(
      path.join(spaceA, "attachment.bin"),
      Buffer.alloc(4096, 37)
    )
    await initial.addAll()
    await initial.commit("Second local history")
    const originalHistory = (await initial.historySummaries()).commits.map(
      (commit) => commit.id
    )
    const inode = (await fs.stat(spaceA)).ino
    await initial.close()
    const aHost = host()
    const aInput = credentials("device-A")
    const a = await aHost.connect(spaceA, aInput, "initialize")
    sessions.push(a)
    expect(aInput.password.every((byte) => byte === 0)).toBe(true)
    const bHost = host()
    const wrong = credentials("device-B", first, "wrong sync password")
    await expect(bHost.connect(spaceB, wrong, "clone")).rejects.toMatchObject({
      code: "GRAFT_SDK_E2EE_UNLOCK_FAILED",
    })
    expect(wrong.password.every((byte) => byte === 0)).toBe(true)
    expect(await fs.readdir(spaceB)).toEqual([])
    const b = await bHost.connect(spaceB, credentials("device-B"), "clone")
    sessions.push(b)
    for (const name of ["records.eidos", "notes.txt", "attachment.bin"])
      expect(await fs.readFile(path.join(spaceB, name))).toEqual(
        await fs.readFile(path.join(spaceA, name))
      )
    expect(
      (await b.historySummaries()).commits.map((commit) => commit.id)
    ).toEqual(originalHistory)
    await fs.writeFile(
      path.join(spaceA, "notes.txt"),
      "source-only encrypted change\n"
    )
    await a.addAll()
    await a.commit("Edit on A")
    await a.push({ remote: "origin", branch: "main" })
    await b.fetch({ remote: "origin", branch: "main" })
    await b.pull({ remote: "origin", branch: "main" })
    expect(await fs.readFile(path.join(spaceB, "notes.txt"), "utf8")).toBe(
      "source-only encrypted change\n"
    )
    await fs.writeFile(
      path.join(spaceB, "from-B.txt"),
      "peer-only encrypted change\n"
    )
    await b.addAll()
    await b.commit("Edit on B")
    await b.push({ remote: "origin", branch: "main" })
    await a.fetch({ remote: "origin", branch: "main" })
    await a.pull({ remote: "origin", branch: "main" })
    expect(await fs.readFile(path.join(spaceA, "from-B.txt"), "utf8")).toBe(
      "peer-only encrypted change\n"
    )
    const head = (await a.repositoryMetadata()).current_head
    await a.close()
    await aHost.disconnect()
    const restartedHost = host()
    const restarted = await restartedHost.connect(
      spaceA,
      credentials("device-A"),
      "unlock"
    )
    sessions.push(restarted)
    expect((await restarted.repositoryMetadata()).current_head).toBe(head)
    const history = (await restarted.historySummaries()).commits.map(
      (commit) => commit.id
    )
    await fs.writeFile(path.join(spaceA, "notes.txt"), "unsaved local edit\n")
    await restartedHost.lock()
    await expect(restarted.removeRemote("origin")).rejects.toMatchObject({
      code: "GRAFT_SDK_INVALID_ARGUMENT",
    })
    expect((await restarted.listRemotes()).remotes[0]?.kind).toBe(
      "encrypted_http"
    )
    await restartedHost.disconnect()
    expect(await restarted.removeRemote("origin")).toEqual({ removed: true })
    expect(await fs.readFile(path.join(spaceA, "notes.txt"), "utf8")).toBe(
      "unsaved local edit\n"
    )
    expect(
      (await restarted.historySummaries()).commits.map((commit) => commit.id)
    ).toEqual(history)
    expect((await fs.stat(spaceA)).ino).toBe(inode)
    await restarted.close()
    await restartedHost.disconnect()
    const local = await open(spaceA)
    await local.addAll()
    await local.commit("Save preserved local edit")
    const reconnectHistory = (await local.historySummaries()).commits.map(
      (commit) => commit.id
    )
    await local.close()
    const reconnected = await host().connect(
      spaceA,
      credentials("device-A", second),
      "initialize"
    )
    sessions.push(reconnected)
    expect((await fs.stat(spaceA)).ino).toBe(inode)
    expect((await reconnected.listRemotes()).remotes).toEqual([
      expect.objectContaining({
        name: "origin",
        kind: "encrypted_http",
        url: second.url,
      }),
    ])
    expect(
      (await reconnected.historySummaries()).commits.map((commit) => commit.id)
    ).toEqual(reconnectHistory)
    expect(reconnectHistory.slice(-2)).toEqual(originalHistory)
    for (const connection of [first, second]) {
      expect(connection.objects.size).toBeGreaterThan(0)
      for (const [key, bytes] of connection.objects) {
        expect(key.startsWith("e2ee/")).toBe(true)
        expect(
          Buffer.from(bytes).includes(
            Buffer.from("source-only encrypted change")
          )
        ).toBe(false)
        expect(
          Buffer.from(bytes).includes(Buffer.from("peer-only encrypted change"))
        ).toBe(false)
      }
    }
  } finally {
    await Promise.allSettled(sessions.map((session) => session.close()))
    await Promise.allSettled(hosts.map((entry) => entry.disconnect()))
    await remote.close()
    await fs.rm(root, { recursive: true, force: true })
  }
}, 120_000)
