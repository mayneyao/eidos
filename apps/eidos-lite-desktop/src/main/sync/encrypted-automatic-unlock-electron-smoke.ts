import assert from "node:assert/strict"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { utilityProcess, type UtilityProcess } from "electron"
import type { GraftClient } from "../graft/graft-client"
import { startEncryptedSyncTestServer } from "../graft/encrypted-sync-test-server"
import type { SpaceSession } from "../space/space-session"
import type { SyncControlPlane } from "./sync-control-plane"
import type { SecretEncryption } from "../account/credential-store"
import {
  RememberedSyncUnlocks,
  RememberedSyncUnlockStore,
} from "./remembered-sync-unlocks"
import { SyncExecutor } from "./sync-executor"
import { AutomaticSync, AUTOMATIC_SYNC_INTERVAL_MS } from "./automatic-sync"

async function bounded<T>(
  promise: Promise<T>,
  label: string,
  ms = 10_000
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

/** Explicit non-UI host test only. Production factory, worker, native encryption and HTTP. */
export async function runEncryptedAutomaticUnlockElectronSmoke(
  evidenceRoot: string,
  createSession: (root: string) => Promise<{
    session: SpaceSession
    graft: GraftClient
    close(): Promise<void>
  }>
): Promise<void> {
  const root = path.join(evidenceRoot, "Encrypted Space")
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, "note.txt"), "Encrypted local content\n")
  const server = await startEncryptedSyncTestServer()
  const remote = server.createRepository("automatic-unlock", "personal")
  const domain = new URL(remote.url).origin
  const encryption = {
    profile: "encrypted-remote-v1" as const,
    version: 1 as const,
    suite: 1 as const,
    uuid: remote.uuid,
  }
  const cryptoKey = randomBytes(32)
  const secretEncryption: SecretEncryption = {
    isAvailable: () => true,
    encrypt(value) {
      const nonce = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", cryptoKey, nonce)
      const ciphertext = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ])
      return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext])
    },
    decrypt(value) {
      const cipher = createDecipheriv(
        "aes-256-gcm",
        cryptoKey,
        value.subarray(0, 12)
      )
      cipher.setAuthTag(value.subarray(12, 28))
      return Buffer.concat([
        cipher.update(value.subarray(28)),
        cipher.final(),
      ]).toString("utf8")
    },
  }
  const control = {
    syncIdentity: async () => ({ domain, subject: "personal" }),
    operationContext: async () => undefined,
    accountSubject: async () => {
      throw new Error("Custom Sync must not ask for an account")
    },
    repositories: async () => ({
      repositories: [{ remoteUrl: remote.url, encryption }],
    }),
    repositoryAccess: async () => ({
      accessToken: "synthetic-test-token",
      access: "read_write",
    }),
    isCustomRemote: () => true,
  } as unknown as SyncControlPlane
  const password = Buffer.from("synthetic-local-test-password")
  const stateDirectory = path.join(evidenceRoot, "encrypted-unlock-state")
  const store = new RememberedSyncUnlockStore(
    path.join(evidenceRoot, "encrypted-credentials"),
    secretEncryption
  )
  const remembered = new RememberedSyncUnlocks(
    control,
    domain,
    stateDirectory,
    store
  )
  let probe = await createSession(root)
  const originalFork = utilityProcess.fork
  const children = new Set<UtilityProcess>()
  const utilities: {
    pid?: number
    spawnedAtMs?: number
    exitedAtMs?: number
  }[] = []
  let held: ReturnType<typeof server.holdRequests> | undefined
  let automatic: AutomaticSync | undefined
  utilityProcess.fork = (modulePath, args, options) => {
    const child = originalFork(modulePath, args, options)
    if (options?.serviceName !== "Graft · Encrypted Space") return child
    children.add(child)
    const observed: (typeof utilities)[number] = {}
    utilities.push(observed)
    child.once("spawn", () => {
      observed.pid = child.pid
      observed.spawnedAtMs = performance.now()
    })
    child.once("exit", () => {
      observed.exitedAtMs = performance.now()
      children.delete(child)
    })
    return child
  }
  try {
    await probe.session.enableVersioning()
    const preflight = await probe.session.syncPreflight()
    await probe.session.enableHostedSync(
      remote.url,
      "synthetic-test-token",
      { manifestId: preflight.manifestId },
      undefined,
      {
        connection: {
          url: remote.url,
          uuid: remote.uuid,
          authenticationDomain: domain,
          accountSubject: "personal",
          bearerToken: "synthetic-test-token",
          stateDirectory,
        },
        password: Buffer.from(password),
      }
    )
    await remembered.remember(probe.session, remote.url, password)
    await probe.close()
    probe = await createSession(root)
    assert.equal((await probe.session.encryptedSyncStatus())?.state, "locked")
    const executor = new SyncExecutor(
      control,
      [],
      (session, url, token, context) =>
        remembered.autoUnlock(session, url, token, context)
    )
    let now = 0
    automatic = new AutomaticSync({ focused: () => false, now: () => now })
    automatic.configure("interval")
    automatic.attach({
      spaceId: probe.session.canonical.id,
      revision: "encrypted-host",
      current: () => true,
      available: () => true,
      execute: (signal) =>
        executor.run(probe.session, () => undefined, "sync", { signal }),
      emit() {},
    })
    const cancellationCases = []
    for (const trigger of ["activity", "foreground-history"] as const) {
      if (trigger === "foreground-history")
        await probe.session.lockEncryptedSync()
      held = server.holdRequests()
      now += AUTOMATIC_SYNC_INTERVAL_MS
      const run = automatic.tick()
      const nativeRequestPath = await bounded(
        held.requestStarted,
        "native encrypted unlock request"
      )
      const activityAtMs = performance.now()
      if (trigger === "activity") automatic.activity()
      const foreground = probe.session.getVersionHistory()
      await bounded(
        Promise.all([run, foreground]),
        "encrypted automatic unlock foreground handoff",
        2_000
      )
      const foregroundReadyAtMs = performance.now()
      assert(foregroundReadyAtMs - activityAtMs < 2_000)
      assert.equal(automatic.status(probe.session.canonical.id)?.state, "idle")
      assert.equal(
        (await remembered.status(probe.session, remote.url))?.rememberError,
        undefined
      )
      cancellationCases.push({
        trigger,
        nativeRequestPath,
        activityAtMs,
        foregroundReadyAtMs,
        handoffMs: foregroundReadyAtMs - activityAtMs,
        rememberError: false,
        paused: false,
      })
      held.release()
      held = undefined
      await remembered.autoUnlock(
        probe.session,
        remote.url,
        "synthetic-test-token",
        { signal: new AbortController().signal }
      )
    }
    assert.equal((await probe.session.encryptedSyncStatus())?.state, "unlocked")
    const beforeCrash = utilities.at(-1)?.pid
    const child = [...children].find((entry) => entry.pid === beforeCrash)
    assert(child && beforeCrash)
    const exited = new Promise<void>((resolve) =>
      child.once("exit", () => resolve())
    )
    child.kill()
    await bounded(exited, "encrypted utility actual exit")
    assert.equal((await probe.session.encryptedSyncStatus())?.state, "locked")
    await remembered.autoUnlock(
      probe.session,
      remote.url,
      "synthetic-test-token",
      { signal: new AbortController().signal }
    )
    assert.equal((await probe.session.encryptedSyncStatus())?.state, "unlocked")
    assert.notEqual(utilities.at(-1)?.pid, beforeCrash)
    await probe.session.getVersionHistory()
    await probe.session.createTextFile(
      null,
      "Foreground after encrypted reopen.txt"
    )
    assert.equal(
      await fs.readFile(path.join(root, "note.txt"), "utf8"),
      "Encrypted local content\n"
    )
    await fs.writeFile(
      path.join(evidenceRoot, "encrypted-result.json"),
      JSON.stringify(
        {
          status: "passed",
          cancellationCases,
          accountRequested: false,
          savedPasswordRestoredAfterColdStart: true,
          savedPasswordRestoredAfterActualUtilityExit: true,
          foregroundHistoryReadable: true,
          foregroundMutationSucceeded: true,
          localContentPreserved: true,
          utilities,
        },
        null,
        2
      )
    )
  } finally {
    held?.release()
    await automatic?.close()
    await probe.close()
    for (const child of children) child.kill()
    utilityProcess.fork = originalFork
    await server.close()
    password.fill(0)
    cryptoKey.fill(0)
  }
}
