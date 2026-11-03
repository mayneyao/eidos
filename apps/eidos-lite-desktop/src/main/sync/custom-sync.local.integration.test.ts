import {
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  createEidosFile,
  openEidosFile,
} from "@eidos.space/eidos-file/node-sqlite"
import type { EidosSyncAction } from "../../shared/contracts"
import type { GraftEncryptedInput } from "../../shared/graft-sdk-contracts"
import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"
import { AccountSessionService } from "../account/account-session"
import { AccountSyncClient } from "../account/account-sync-client"
import {
  SecureAccountCredentialStore,
  type SecretEncryption,
} from "../account/credential-store"
import { DeviceIdentityStore } from "../account/device-identity"
import { EidosOAuthClient } from "../account/oauth-client"
import { SparkService } from "../account/spark-service"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { SyncSwitchJournal } from "../space/sync-switch"
import { CustomSyncServers } from "./custom-sync-servers"
import { OfficialSyncClient } from "./official-sync-client"
import { SpaceCloneCoordinator } from "./space-clone-coordinator"
import { SyncControlPlane } from "./sync-control-plane"
import { SyncExecutor } from "./sync-executor"

const enabled = process.env.EIDOS_LITE_RUN_CUSTOM_SYNC === "1"
const environment = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging

// Network, Spark signatures, the personal Worker, Graft, and Space mutation gates
// are real. Electron Node has no utilityProcess host: only that process boundary
// is replaced with the same canonical Eidos File structural validation below.
// This does not establish native utility-process or packaged-window coverage.
describe.skipIf(!enabled)("personal custom Graft through Lite main", () => {
  it("initializes, clones, syncs SQLite and attachments, restarts offline, and enforces Spark", async () => {
    const origin =
      process.env.EIDOS_LITE_CUSTOM_SYNC_ORIGIN ?? "http://127.0.0.1:8787"
    const token = process.env.EIDOS_LITE_CUSTOM_SYNC_TOKEN
    if (!token)
      throw new Error(
        "Set EIDOS_LITE_CUSTOM_SYNC_TOKEN for the local personal Worker"
      )
    const targetOrigin = process.env.EIDOS_LITE_SWITCH_TARGET_ORIGIN ?? origin
    const targetToken = process.env.EIDOS_LITE_SWITCH_TARGET_TOKEN ?? token
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "lite-custom-sync-"))
    )
    const sessions: SpaceSession[] = []
    const restoreValidation: Array<() => void> = []
    const officialRequests: string[] = []
    const localRequests: string[] = []
    const key = randomBytes(32)
    const encryption: SecretEncryption = {
      isAvailable: () => true,
      encrypt(value) {
        const iv = randomBytes(12)
        const cipher = createCipheriv("aes-256-gcm", key, iv)
        const ciphertext = Buffer.concat([
          cipher.update(value, "utf8"),
          cipher.final(),
        ])
        return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
      },
      decrypt(value) {
        const cipher = createDecipheriv(
          "aes-256-gcm",
          key,
          value.subarray(0, 12)
        )
        cipher.setAuthTag(value.subarray(12, 28))
        return Buffer.concat([
          cipher.update(value.subarray(28)),
          cipher.final(),
        ]).toString("utf8")
      },
    }
    const fetchLocal: typeof fetch = async (input, init) => {
      const url =
        input instanceof URL
          ? input
          : new URL(typeof input === "string" ? input : input.url)
      if (url.origin !== origin && url.origin !== targetOrigin) {
        officialRequests.push(url.origin)
        throw new Error(
          "Official account and Sync services are blocked by this test"
        )
      }
      localRequests.push(url.pathname)
      return fetch(input, init)
    }
    const keys = generateKeyPairSync("ed25519")
    const publicKey = keys.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64")
    const createGraft = () =>
      new GraftClient({ sdkTransport: new GraftInProcessTransport() })
    const password = randomBytes(24).toString("hex")

    async function device(name: string, withCertificate = true) {
      const directory = path.join(root, name)
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      const cachePath = path.join(directory, "spark-certificate.json")
      if (withCertificate) {
        const payload = {
          version: 2,
          audience: "eidos-lite-spark",
          issuer: environment.accountOrigin,
          subject: "spark-personal-owner",
          hardwareId: name,
          licenseId: 1,
          features: ["file-metadata", "custom-graft-sync"],
          issuedAt: new Date(Date.now() - 1000).toISOString(),
          expiresAt: null,
          offlinePolicy: "perpetual",
        }
        await fs.writeFile(
          cachePath,
          JSON.stringify({
            payload,
            signature: sign(
              null,
              Buffer.from(JSON.stringify(payload)),
              keys.privateKey
            ).toString("base64"),
          }),
          { mode: 0o600 }
        )
      }
      const spark = new SparkService({
        origin: environment.accountOrigin,
        publicKey,
        cachePath,
        hardwareId: async () => name,
        account: async () => null,
        fetch: fetchLocal,
      })
      const registryPath = path.join(directory, "custom-servers.bin")
      const registry = new CustomSyncServers(registryPath, encryption, {
        requireAccess: () => spark.require("custom-graft-sync"),
        fetchImpl: fetchLocal,
        allowLoopbackHttp: true,
      })
      const account = new AccountSessionService(
        new EidosOAuthClient(environment, fetchLocal),
        new SecureAccountCredentialStore(
          path.join(directory, "official-account.bin"),
          encryption
        ),
        new DeviceIdentityStore(path.join(directory, "device.json")),
        new AccountSyncClient(environment, fetchLocal),
        {
          openExternal: async () => {
            throw new Error("Official sign-in must not be needed")
          },
          device: {
            displayName: name,
            platform: "macos",
            appVersion: "integration",
          },
        }
      )
      const control = new SyncControlPlane(
        environment,
        account,
        new OfficialSyncClient(environment, fetchLocal)
      )
      control.setCustomServers(registry)
      return {
        directory,
        registryPath,
        registry,
        spark,
        control,
        account,
        cachePath,
      }
    }

    function validateFile(filePath: string) {
      const runtime = openEidosFile(filePath, { readonly: true })
      try {
        const result = runtime.validate({ level: "structural" })
        expect(result.valid).toBe(true)
      } finally {
        runtime.close()
      }
    }

    async function openSpace(
      spaceRoot: string,
      current: Awaited<ReturnType<typeof device>>
    ) {
      const graft = createGraft()
      const session = await SpaceSession.create(spaceRoot, current.directory, {
        graft,
        requireSparkFeature: (feature) => current.spark.require(feature),
      })
      sessions.push(session)
      const validation = vi
        .spyOn(session.runtimePool, "validatePaths")
        .mockImplementation(async (paths) => {
          for (const relative of paths)
            validateFile(path.join(spaceRoot, relative))
        })
      restoreValidation.push(() => validation.mockRestore())
      return { session, graft }
    }

    try {
      const a = await device("device-a")
      const b = await device("device-b")
      expect((await a.spark.status()).source).toBe("offline")
      expect((await a.control.accountStatus()).state).toBe("signed-out")
      const serverA = await a.registry.save({
        name: "Personal local Worker",
        origin,
        token,
      })
      const serverB = await b.registry.save({
        name: "Personal local Worker",
        origin,
        token,
      })
      // A separate profile exercises CRUD against the deployed authentication
      // endpoint without changing either device's active connection.
      const management = await device("server-management")
      const saved = await management.registry.save({
        name: "Server acceptance",
        origin,
        token,
      })
      const renamed = await management.registry.save({
        id: saved.id,
        name: "Renamed server",
        origin,
      })
      expect(await management.registry.list()).toEqual([renamed])
      await expect(
        management.registry.save({
          id: saved.id,
          name: "Rejected update",
          origin,
          token: "invalid-server-token-for-acceptance-test",
        })
      ).rejects.toThrow()
      expect(await management.registry.list()).toEqual([renamed])
      await management.registry.repositories(saved.id)
      await management.registry.remove(saved.id)
      expect(await management.registry.list()).toEqual([])
      expect(await a.registry.list()).toContainEqual(serverA)
      expect(serverA).not.toHaveProperty("token")
      expect(
        (await fs.readFile(a.registryPath)).includes(Buffer.from(token))
      ).toBe(false)
      const context = await a.control.operationContext(null, serverA.id)
      const provisioned = await a.control.provisionRepository(
        `lite-${randomUUID()}`,
        "Lite main integration",
        true,
        context
      )
      if (!provisioned.encryption)
        throw new Error("Personal server must provision encryption")
      const descriptor = provisioned.encryption
      const remote = provisioned.remoteUrl
      const input = (
        current: typeof a,
        suppliedPassword = password
      ): GraftEncryptedInput => ({
        connection: {
          url: remote,
          uuid: descriptor.uuid,
          authenticationDomain: origin,
          accountSubject: "personal",
          bearerToken: token,
          stateDirectory: path.join(current.directory, "encrypted-sync"),
        },
        password: Buffer.from(suppliedPassword),
      })
      const sourceRoot = path.join(root, "source")
      const peerRoot = path.join(root, "peer")
      await fs.mkdir(sourceRoot)
      const created = createEidosFile(path.join(sourceRoot, "records.eidos"), {
        defaultTable: {
          name: "Records",
          fields: [{ name: "Title", type: "text" }],
        },
      })
      const table = created.listTables()[0]!
      const rowId = String(
        created.insertRow(table.id, { Title: "first device" })._id
      )
      created.close()
      await fs.writeFile(
        path.join(sourceRoot, "notes.txt"),
        "first device note\n"
      )
      await fs.writeFile(
        path.join(sourceRoot, "attachment.bin"),
        Buffer.alloc(8192, 37)
      )
      const source = await openSpace(sourceRoot, a)
      const approval = {
        manifestId: (await source.session.syncPreflight()).manifestId,
      }
      await source.session.prepareHostedSync(approval, true)
      await source.session.enableHostedSync(
        remote,
        provisioned.accessToken,
        approval,
        () => undefined,
        input(a),
        context.assertCurrent
      )
      expect(await source.session.officialSyncRemoteUrl()).toBe(remote)
      console.info("Cloud acceptance: initial encrypted upload complete")
      expect(await source.session.encryptedSyncStatus()).toMatchObject({
        state: "unlocked",
      })
      const clone = new SpaceCloneCoordinator({
        stateDirectory: b.directory,
        remoteOrigin: environment.syncRemoteOrigin,
        createGraftClient: createGraft,
        validateWorktree: async (directory) =>
          validateFile(path.join(directory, "records.eidos")),
      })
      await b.control.repositoryAccess(
        remote,
        await b.control.operationContext(null, serverB.id)
      )
      await expect(
        clone.clone(
          peerRoot,
          remote,
          token,
          () => undefined,
          () => undefined,
          input(b, "incorrect sync password")
        )
      ).rejects.toMatchObject({ code: "GRAFT_SDK_E2EE_UNLOCK_FAILED" })
      await expect(fs.stat(peerRoot)).rejects.toMatchObject({ code: "ENOENT" })
      await clone.clone(
        peerRoot,
        remote,
        token,
        () => undefined,
        () => undefined,
        input(b)
      )
      const peer = await openSpace(peerRoot, b)
      console.info("Cloud acceptance: independent download complete")
      const executor = (current: typeof a) =>
        new SyncExecutor(current.control, [], async (session) => {
          const access = await current.registry.verify(remote, descriptor.uuid)
          await session.unlockEncryptedSync(
            input(current),
            access.assertCurrent
          )
        })
      async function run(
        current: typeof a,
        session: SpaceSession,
        action: EidosSyncAction
      ) {
        const result = await executor(current).run(
          session,
          () => undefined,
          action
        )
        if (!result.ok)
          throw new Error(
            `${action}: ${result.failure.code}: ${result.failure.message}`
          )
        return result.result
      }
      function title(directory: string) {
        const file = openEidosFile(path.join(directory, "records.eidos"), {
          readonly: true,
        })
        try {
          return file.getRow(table.id, rowId)?.Title
        } finally {
          file.close()
        }
      }
      expect(title(peerRoot)).toBe("first device")
      expect(await fs.readFile(path.join(peerRoot, "attachment.bin"))).toEqual(
        Buffer.alloc(8192, 37)
      )
      const changed = openEidosFile(path.join(peerRoot, "records.eidos"))
      changed.updateRow(table.id, rowId, { Title: "second device" })
      changed.close()
      await fs.writeFile(
        path.join(peerRoot, "notes.txt"),
        "second device note\n"
      )
      await fs.writeFile(
        path.join(peerRoot, "attachment.bin"),
        Buffer.alloc(8192, 41)
      )
      await peer.session.createCheckpoint("Second device changes")
      expect((await run(b, peer.session, "sync")).pushed).toBe(true)
      expect((await run(a, source.session, "sync")).pulled).toBe(true)
      expect(title(sourceRoot)).toBe("second device")
      expect(
        await fs.readFile(path.join(sourceRoot, "notes.txt"), "utf8")
      ).toBe("second device note\n")
      expect(
        await fs.readFile(path.join(sourceRoot, "attachment.bin"))
      ).toEqual(Buffer.alloc(8192, 41))
      await a.control.signOut(remote)
      await fs.writeFile(
        path.join(sourceRoot, "from-source.txt"),
        "after official sign-out\n"
      )
      await source.session.createCheckpoint(
        "Custom sync after official sign-out"
      )
      expect((await run(a, source.session, "push")).pushed).toBe(true)
      expect((await run(b, peer.session, "pull")).pulled).toBe(true)
      expect(
        await fs.readFile(path.join(peerRoot, "from-source.txt"), "utf8")
      ).toBe("after official sign-out\n")
      const head = (await source.graft.history(sourceRoot)).currentHead
      console.info("Cloud acceptance: bidirectional edits complete")
      await source.session.close()
      const restarted = await device("device-a", false)
      expect((await restarted.registry.list())[0]?.id).toBe(serverA.id)
      expect((await restarted.spark.status()).features).toContain(
        "custom-graft-sync"
      )
      const reopened = await openSpace(sourceRoot, restarted)
      expect(await reopened.session.officialSyncRemoteUrl()).toBe(remote)
      await run(restarted, reopened.session, "fetch")
      console.info("Cloud acceptance: restart complete")
      expect((await reopened.graft.history(sourceRoot)).currentHead).toBe(head)
      // A real rejected encrypted initialization must restore the old origin,
      // its verified binding, history and files without reconnecting the Space.
      const targetServer =
        targetOrigin === origin
          ? serverA
          : await restarted.registry.save({
              name: "Switch target",
              origin: targetOrigin,
              token: targetToken,
            })
      const target = await restarted.control.provisionRepository(
        `switch-${randomUUID()}`,
        "Safe switch acceptance",
        true,
        await restarted.control.operationContext(null, targetServer.id)
      )
      if (!target.encryption) throw new Error("Missing target encryption")
      const targetInput = (bearerToken = targetToken): GraftEncryptedInput => ({
        connection: {
          ...input(restarted).connection,
          url: target.remoteUrl,
          uuid: target.encryption!.uuid,
          authenticationDomain: targetOrigin,
          bearerToken,
        },
        password: Buffer.from(password),
      })
      const switchApproval = {
        manifestId: (await reopened.session.syncPreflight()).manifestId,
      }
      await expect(
        reopened.session.enableHostedSync(
          target.remoteUrl,
          token,
          switchApproval,
          () => undefined,
          targetInput("deliberately-invalid-token"),
          () => undefined,
          undefined,
          { remoteUrl: remote, encryptionUuid: descriptor.uuid }
        )
      ).rejects.toThrow()
      expect(await reopened.session.officialSyncRemoteUrl()).toBe(remote)
      expect((await reopened.graft.history(sourceRoot)).currentHead).toBe(head)
      await run(restarted, reopened.session, "fetch")
      console.info(
        "Cloud acceptance: rejected target restored previous connection"
      )
      // Simulate a process exit after detaching the old origin; opening must recover it.
      await new SyncSwitchJournal(
        path.join(restarted.directory, "spaces", reopened.session.canonical.id)
      ).begin({
        previous: remote,
        target: target.remoteUrl,
        encryptionUuid: descriptor.uuid,
      })
      await reopened.graft.removeRemote(sourceRoot)
      await reopened.session.close()
      const recovered = await openSpace(sourceRoot, restarted)
      expect(await recovered.session.officialSyncRemoteUrl()).toBe(remote)
      await run(restarted, recovered.session, "fetch")
      console.info("Cloud acceptance: interrupted switch recovered on reopen")
      await recovered.session.enableHostedSync(
        target.remoteUrl,
        targetToken,
        switchApproval,
        () => undefined,
        targetInput(),
        () => undefined,
        undefined,
        { remoteUrl: remote, encryptionUuid: descriptor.uuid }
      )
      expect(await recovered.session.officialSyncRemoteUrl()).toBe(
        target.remoteUrl
      )
      console.info("Cloud acceptance: switch upload complete")
      expect((await recovered.graft.history(sourceRoot)).currentHead).toBe(head)
      const switchedClone = path.join(root, "switched-clone")
      await clone.clone(
        switchedClone,
        target.remoteUrl,
        targetToken,
        () => undefined,
        () => undefined,
        {
          ...targetInput(),
          connection: {
            ...targetInput().connection,
            stateDirectory: path.join(b.directory, "switched-encryption"),
          },
        }
      )
      for (const file of [
        "records.eidos",
        "notes.txt",
        "attachment.bin",
        "from-source.txt",
      ])
        expect(await fs.readFile(path.join(switchedClone, file))).toEqual(
          await fs.readFile(path.join(sourceRoot, file))
        )
      await fs.unlink(restarted.cachePath)
      const missingSpark = new SparkService({
        origin: environment.accountOrigin,
        publicKey,
        cachePath: restarted.cachePath,
        hardwareId: async () => "device-a",
        account: async () => null,
        fetch: fetchLocal,
      })
      const unlicensed = new CustomSyncServers(
        restarted.registryPath,
        encryption,
        {
          requireAccess: () => missingSpark.require("custom-graft-sync"),
          fetchImpl: fetchLocal,
          allowLoopbackHttp: true,
        }
      )
      restarted.control.setCustomServers(unlicensed)
      const callsBeforeDenied = localRequests.length
      const denied = await executor(restarted).run(
        recovered.session,
        () => undefined,
        "fetch"
      )
      expect(denied.ok).toBe(false)
      expect(localRequests).toHaveLength(callsBeforeDenied)
      expect(title(sourceRoot)).toBe("second device")
      await expect(
        recovered.session.disconnectHostedSync()
      ).resolves.toBeDefined()
      expect(await recovered.session.officialSyncRemoteUrl()).toBeNull()
      expect((await recovered.graft.history(sourceRoot)).currentHead).toBe(head)
      expect(officialRequests).toEqual([])
    } finally {
      await Promise.allSettled(sessions.map((session) => session.close()))
      for (const restore of restoreValidation) restore()
      key.fill(0)
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 360_000)
})
