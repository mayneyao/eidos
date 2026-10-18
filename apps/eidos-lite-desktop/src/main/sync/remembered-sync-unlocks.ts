import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { SecretEncryption } from "../account/credential-store"
import type { EidosSyncEncryption } from "../../shared/contracts"
import type { GraftEncryptedInput } from "../../shared/graft-sdk-contracts"
import type { SpaceSession } from "../space/space-session"
import type { SyncControlPlane } from "./sync-control-plane"
import {
  assertSyncEncryptionBinding,
  isSyncEncryptionAccountDomain,
} from "../../shared/sync-encryption"

export interface RememberedSyncIdentity {
  domain: string
  account: string
  remote: string
  space: string
  encryption: EidosSyncEncryption
}

interface DefaultSyncIdentity {
  domain: string
  account: string
  kind: "default-password"
}

type StoredSyncIdentity = RememberedSyncIdentity | DefaultSyncIdentity

const scopeDigest = (identity: {
  domain: string
  account: string
  space: string
}) =>
  createHash("sha256")
    .update(JSON.stringify([identity.domain, identity.account, identity.space]))
    .digest("hex")

export function canRememberSyncUnlock(
  platform: NodeJS.Platform,
  available: boolean,
  backend?: string
): boolean {
  return (
    available &&
    (platform === "darwin" ||
      (platform === "linux" &&
        ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(
          backend ?? ""
        )))
  )
}

const identityDigest = (identity: StoredSyncIdentity) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        "space.eidos.lite/remembered-sync/v1",
        identity.domain,
        identity.account,
        ...("kind" in identity
          ? [identity.kind]
          : [
              identity.remote,
              identity.space,
              identity.encryption.profile,
              identity.encryption.version,
              identity.encryption.suite,
              identity.encryption.uuid,
            ]),
      ])
    )
    .digest()

export class RememberedSyncUnlockStore {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly directory: string,
    private readonly encryption: SecretEncryption
  ) {}

  available(): boolean {
    return this.encryption.isAvailable()
  }
  private file(identity: StoredSyncIdentity): string {
    return path.join(
      this.directory,
      ("kind" in identity ? "default" : scopeDigest(identity)) +
        "-" +
        identityDigest(identity).toString("hex") +
        ".bin"
    )
  }
  private serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
    const task = this.queue.then(operation, operation)
    this.queue = task.catch(() => undefined)
    return task
  }
  private async metadata(identity: StoredSyncIdentity) {
    return fs
      .lstat(this.file(identity))
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null
        throw new Error("Could not access this device's remembered Sync unlock")
      })
  }
  async has(identity: StoredSyncIdentity): Promise<boolean> {
    return Boolean(await this.metadata(identity))
  }

  read(identity: StoredSyncIdentity): Promise<Buffer | null> {
    return this.serialize(async () => {
      const metadata = await this.metadata(identity)
      if (!metadata) return null
      const directory = await fs.lstat(this.directory)
      if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        directory.uid !== process.getuid?.() ||
        (directory.mode & 0o077) !== 0
      )
        throw new Error("Remembered Sync unlock directory is not private")
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        (metadata.mode & 0o077) !== 0 ||
        metadata.uid !== process.getuid?.() ||
        metadata.size > 4096
      )
        throw new Error("Remembered Sync unlock has unsafe file permissions")
      if (!this.available())
        throw new Error(
          "System secure storage is unavailable; enter your sync password"
        )
      let decoded: Buffer | undefined
      try {
        decoded = Buffer.from(
          this.encryption.decrypt(await fs.readFile(this.file(identity))),
          "base64"
        )
        if (
          decoded.length < 33 ||
          decoded.length > 1056 ||
          !decoded.subarray(0, 32).equals(identityDigest(identity))
        )
          throw new Error("binding mismatch")
        return Buffer.from(decoded.subarray(32))
      } catch {
        throw new Error(
          "Saved Sync password could not be read; enter your sync password to continue"
        )
      } finally {
        decoded?.fill(0)
      }
    })
  }

  write(identity: StoredSyncIdentity, password: Uint8Array): Promise<void> {
    const secret = Buffer.from(password)
    return this.serialize(async () => {
      const payload = Buffer.concat([identityDigest(identity), secret])
      const temporary = this.file(identity) + `.${randomUUID()}.tmp`
      try {
        if (!this.available())
          throw new Error(
            "System secure storage is unavailable; unlock is session-only"
          )
        if (secret.length < 1 || secret.length > 1024)
          throw new Error("Invalid sync password")
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
        const directory = await fs.lstat(this.directory)
        if (
          !directory.isDirectory() ||
          directory.isSymbolicLink() ||
          directory.uid !== process.getuid?.() ||
          (directory.mode & 0o077) !== 0
        )
          throw new Error("Remembered Sync unlock directory is not private")
        let ciphertext: Buffer
        try {
          ciphertext = this.encryption.encrypt(payload.toString("base64"))
        } catch {
          throw new Error(
            "System secure storage could not protect this Sync unlock"
          )
        }
        const handle = await fs.open(temporary, "wx", 0o600)
        try {
          await handle.writeFile(ciphertext)
          await handle.sync()
        } finally {
          await handle.close()
        }
        await fs.rename(temporary, this.file(identity))
        const parent = await fs.open(this.directory, "r")
        try {
          await parent.sync()
        } finally {
          await parent.close()
        }
      } finally {
        secret.fill(0)
        payload.fill(0)
        await fs.unlink(temporary).catch(() => undefined)
      }
    })
  }

  forget(identity: StoredSyncIdentity): Promise<void> {
    return this.serialize(async () => {
      await fs
        .unlink(this.file(identity))
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT")
            throw new Error("Could not forget this device's Sync unlock")
        })
    })
  }
  forgetSpace(identity: {
    domain: string
    account: string
    space: string
  }): Promise<void> {
    return this.serialize(async () => {
      const directory = await fs
        .lstat(this.directory)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null
          throw error
        })
      if (!directory) return
      if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        directory.uid !== process.getuid?.() ||
        (directory.mode & 0o077) !== 0
      )
        throw new Error("Remembered Sync unlock directory is not private")
      const pattern = new RegExp(
        `^${scopeDigest(identity)}-[a-f0-9]{64}\\.bin$`
      )
      for (const file of await fs.readdir(this.directory))
        if (pattern.test(file)) await fs.unlink(path.join(this.directory, file))
    })
  }
}

export class RememberedSyncUnlocks {
  private generation = 0
  private invalidatedAt = 0
  private readonly forgottenAt = new Map<string, number>()
  private readonly operations = new Map<string, Promise<void>>()
  private automaticBlocked = false
  private powerSuspended = false
  private readonly blockedSpaces = new Set<string>()
  private readonly pending = new Map<string, Promise<void>>()
  private readonly automaticOperations = new Map<string, AbortController>()
  private readonly errors = new Map<string, string>()
  private defaultOperations: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly control: Pick<
      SyncControlPlane,
      "accountSubject" | "repositories"
    >,
    private readonly domain: string,
    private readonly stateDirectory: string,
    private readonly store: RememberedSyncUnlockStore
  ) {}

  available(): boolean {
    return isSyncEncryptionAccountDomain(this.domain) && this.store.available()
  }
  private async defaultIdentity(): Promise<DefaultSyncIdentity> {
    if (!isSyncEncryptionAccountDomain(this.domain))
      throw new Error("Encrypted Sync requires an official account environment")
    return {
      domain: this.domain,
      account: await this.control.accountSubject(),
      kind: "default-password",
    }
  }
  async defaultStatus() {
    if (!this.available()) return { available: false, configured: false }
    const generation = this.captureGeneration()
    try {
      const identity = await this.defaultIdentity()
      this.assertCurrent(undefined, generation)
      const configured = await this.store.has(identity)
      await this.assertDefaultCurrent(identity, generation)
      return {
        available: true,
        configured,
      }
    } catch {
      return { available: true, configured: false }
    }
  }
  async setDefaultPassword(password: Uint8Array): Promise<void> {
    const generation = this.captureGeneration()
    const secret = Buffer.from(password)
    return this.serializeDefault(async () => {
      try {
        this.assertCurrent(undefined, generation)
        const identity = await this.defaultIdentity()
        if (!this.available())
          throw new Error("System secure storage is unavailable")
        await this.assertDefaultCurrent(identity, generation)
        await this.store.write(identity, secret)
        try {
          await this.assertDefaultCurrent(identity, generation)
        } catch (error) {
          await this.store.forget(identity)
          throw error
        }
      } finally {
        secret.fill(0)
      }
    })
  }
  private async assertDefaultCurrent(
    identity: DefaultSyncIdentity,
    generation: number
  ): Promise<void> {
    this.assertCurrent(undefined, generation)
    if ((await this.control.accountSubject()) !== identity.account)
      throw new Error("The Sync account changed while reading its password")
    this.assertCurrent(undefined, generation)
  }
  private serializeDefault<Result>(
    operation: () => Promise<Result>
  ): Promise<Result> {
    const task = this.defaultOperations.then(operation, operation)
    this.defaultOperations = task.catch(() => undefined)
    return task
  }
  async readDefaultPassword(
    generation = this.captureGeneration(),
    expectedSubject?: string
  ): Promise<Buffer | undefined> {
    this.assertCurrent(undefined, generation)
    const identity = await this.defaultIdentity()
    this.assertCurrent(undefined, generation)
    if (expectedSubject !== undefined && identity.account !== expectedSubject)
      throw new Error("The Sync account changed while reading its password")
    let password: Buffer | null = null
    try {
      password = await this.store.read(identity)
      await this.assertDefaultCurrent(identity, generation)
      return password ?? undefined
    } catch (error) {
      password?.fill(0)
      throw error
    }
  }
  async forgetDefaultPassword(): Promise<void> {
    const generation = this.captureGeneration()
    await this.serializeDefault(async () => {
      this.assertCurrent(undefined, generation)
      const identity = await this.defaultIdentity()
      await this.assertDefaultCurrent(identity, generation)
      await this.store.forget(identity)
      await this.assertDefaultCurrent(identity, generation)
    })
  }
  captureGeneration(): number {
    return ++this.generation
  }
  assertCurrent(session: SpaceSession | undefined, generation: number): void {
    if (
      this.powerSuspended ||
      generation <= this.invalidatedAt ||
      (session &&
        generation <= (this.forgottenAt.get(session.canonical.id) ?? 0))
    ) {
      throw new Error("Sync unlock was interrupted")
    }
  }
  blockAutomatic(): void {
    this.invalidatedAt = ++this.generation
    this.automaticBlocked = true
    this.cancelAutomaticOperations()
  }
  reconnect(): void {
    this.invalidatedAt = ++this.generation
    this.automaticBlocked = false
    this.cancelAutomaticOperations()
  }
  suspendAutomatic(): void {
    this.invalidatedAt = ++this.generation
    this.powerSuspended = true
    this.cancelAutomaticOperations()
  }
  resumeAutomatic(): void {
    this.invalidatedAt = ++this.generation
    this.powerSuspended = false
    this.cancelAutomaticOperations()
  }
  private cancelAutomaticOperations(): void {
    for (const operation of this.automaticOperations.values()) operation.abort()
  }
  async drainPendingUnlocks(): Promise<void> {
    const results = await Promise.allSettled([...this.pending.values()])
    const failed = results.find((result) => result.status === "rejected")
    if (failed?.status === "rejected") throw failed.reason
  }
  private current(session: SpaceSession, generation: number): boolean {
    return (
      !this.powerSuspended &&
      generation > this.invalidatedAt &&
      generation > (this.forgottenAt.get(session.canonical.id) ?? 0)
    )
  }
  private async serialize(
    session: SpaceSession,
    operation: () => Promise<void>
  ): Promise<void> {
    const task = (
      this.operations.get(session.canonical.id) ?? Promise.resolve()
    ).then(operation, operation)
    this.operations.set(session.canonical.id, task)
    try {
      await task
    } finally {
      if (this.operations.get(session.canonical.id) === task)
        this.operations.delete(session.canonical.id)
    }
  }
  private async identity(
    session: SpaceSession,
    remote: string
  ): Promise<RememberedSyncIdentity> {
    assertSyncEncryptionBinding(remote, this.domain)
    const account = await this.control.accountSubject()
    const repository = (await this.control.repositories()).repositories.find(
      (entry) => entry.remoteUrl === remote
    )
    if (!repository?.encryption)
      throw new Error("This Space has no verified encrypted identity")
    return {
      domain: this.domain,
      account,
      remote,
      space: session.canonical.root,
      encryption: repository.encryption,
    }
  }
  private input(
    identity: RememberedSyncIdentity,
    token: string,
    password: Buffer
  ): GraftEncryptedInput {
    return {
      connection: {
        url: identity.remote,
        uuid: identity.encryption.uuid,
        authenticationDomain: identity.domain,
        accountSubject: identity.account,
        bearerToken: token,
        stateDirectory: this.stateDirectory,
      },
      password,
    }
  }

  remember(
    session: SpaceSession,
    remote: string,
    password: Uint8Array,
    generation = this.captureGeneration()
  ): Promise<void> {
    return this.serialize(session, () =>
      this.save(session, remote, password, generation)
    )
  }
  private async save(
    session: SpaceSession,
    remote: string,
    password: Uint8Array,
    generation: number
  ): Promise<void> {
    const identity = await this.identity(session, remote)
    if (!this.current(session, generation))
      throw new Error("Sync unlock was interrupted")
    await this.store.write(identity, password)
    if (!this.current(session, generation)) {
      await this.store.forget(identity)
      throw new Error("Sync unlock was interrupted")
    }
    this.errors.delete(session.canonical.id)
    this.blockedSpaces.delete(session.canonical.id)
  }

  finishManual(
    session: SpaceSession,
    remote: string,
    password: Uint8Array,
    remember: boolean,
    generation: number
  ): Promise<void> {
    return this.serialize(session, async () => {
      if (!this.current(session, generation)) {
        await session.lockEncryptedSync()
        throw new Error("Sync unlock was interrupted")
      }
      try {
        if (remember) await this.save(session, remote, password, generation)
        else {
          await this.store.forget(await this.identity(session, remote))
          this.errors.delete(session.canonical.id)
        }
      } catch {
        this.errors.set(
          session.canonical.id,
          "Could not update remembered unlock. Check this device's secure storage before restarting."
        )
      }
      if (!this.current(session, generation)) {
        await session.lockEncryptedSync()
        throw new Error("Sync unlock was interrupted")
      }
    })
  }

  async autoUnlock(
    session: SpaceSession,
    remote: string,
    token: string
  ): Promise<void> {
    if (
      !isSyncEncryptionAccountDomain(this.domain) ||
      this.automaticBlocked ||
      this.powerSuspended ||
      this.blockedSpaces.has(session.canonical.id)
    )
      return
    const existing = this.pending.get(session.canonical.id)
    if (existing) return existing
    const generation = this.captureGeneration()
    const operation = new AbortController()
    this.automaticOperations.set(session.canonical.id, operation)
    const assertCurrent = () => {
      operation.signal.throwIfAborted()
      this.assertCurrent(session, generation)
      if (this.automaticBlocked || this.blockedSpaces.has(session.canonical.id))
        throw new Error("Sync unlock was interrupted")
    }
    const task = (async () => {
      let password: Buffer | null = null
      let unlockStarted = false
      try {
        if (!(await session.hasEncryptedSync())) return
        assertCurrent()
        if ((await session.encryptedSyncStatus())?.state === "unlocked") return
        assertCurrent()
        const identity = await this.identity(session, remote)
        assertCurrent()
        password = await this.store.read(identity)
        assertCurrent()
        if (!password) return
        unlockStarted = true
        await session.unlockEncryptedSync(
          this.input(identity, token, password),
          assertCurrent,
          operation.signal
        )
        assertCurrent()
        this.errors.delete(session.canonical.id)
      } catch {
        if (operation.signal.aborted || !this.current(session, generation)) {
          if (unlockStarted) await session.lockEncryptedSync()
        } else {
          this.errors.set(
            session.canonical.id,
            "Saved sync password is unavailable. Enter your sync password to continue."
          )
        }
      } finally {
        password?.fill(0)
      }
    })()
    this.pending.set(session.canonical.id, task)
    try {
      await task
    } finally {
      if (this.pending.get(session.canonical.id) === task)
        this.pending.delete(session.canonical.id)
      if (this.automaticOperations.get(session.canonical.id) === operation)
        this.automaticOperations.delete(session.canonical.id)
    }
  }

  async status(session: SpaceSession, remote: string) {
    const generation = this.captureGeneration()
    const subject = await this.control.accountSubject()
    this.assertCurrent(session, generation)
    let remembered = false
    try {
      const identity = await this.identity(session, remote)
      if (identity.account !== subject)
        throw new Error("The Sync account changed while reading its password")
      remembered = await this.store.has(identity)
    } catch {}
    this.assertCurrent(session, generation)
    const state = await session.encryptedSyncStatus()
    if ((await this.control.accountSubject()) !== subject)
      throw new Error("The Sync account changed while reading its password")
    this.assertCurrent(session, generation)
    if (!state) return undefined
    return {
      ...state,
      remembered,
      rememberError: this.errors.get(session.canonical.id),
    }
  }
  async forget(session: SpaceSession, remote: string): Promise<void> {
    this.blockedSpaces.add(session.canonical.id)
    this.forgottenAt.set(session.canonical.id, ++this.generation)
    this.automaticOperations.get(session.canonical.id)?.abort()
    await this.serialize(session, async () => {
      await this.pending.get(session.canonical.id)
      await session.lockEncryptedSync()
      await this.store.forgetSpace({
        domain: this.domain,
        account: await this.control.accountSubject(),
        space: session.canonical.root,
      })
      this.errors.delete(session.canonical.id)
    })
  }

  /** Local revocation must also work offline and after signing out. */
  async disconnect(session: SpaceSession): Promise<void> {
    this.blockedSpaces.add(session.canonical.id)
    this.forgottenAt.set(session.canonical.id, ++this.generation)
    this.automaticOperations.get(session.canonical.id)?.abort()
    await this.serialize(session, async () => {
      await this.pending.get(session.canonical.id)?.catch(() => undefined)
      await session.clearHostedSyncCredentials()
      const account = await this.control.accountSubject().catch(() => null)
      if (account)
        await this.store.forgetSpace({
          domain: this.domain,
          account,
          space: session.canonical.root,
        })
      this.errors.delete(session.canonical.id)
    })
  }
}
