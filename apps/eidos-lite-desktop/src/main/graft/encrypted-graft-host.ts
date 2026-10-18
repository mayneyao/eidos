import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { EncryptedRemoteSession } from "@eidos.space/graft"
import type { GraftEncryptedInput } from "../../shared/graft-sdk-contracts"
import {
  loadEidosGraftSdk,
  type EidosGraftRepositorySession,
} from "./graft-sdk-module"
import { assertSpaceRepositoryBoundary } from "./space-repository-boundary"
import { assertSyncEncryptionBinding } from "../../shared/sync-encryption"

export class EncryptedGraftHost {
  get state(): "locked" | "unlocked" {
    return this.authority?.state === "unlocked" ? "unlocked" : "locked"
  }
  private authority: EncryptedRemoteSession | null = null
  private binding: GraftEncryptedInput["connection"] | null = null
  private generation = 0
  private connecting = false

  async connect(
    root: string,
    input: GraftEncryptedInput,
    mode: "initialize" | "unlock" | "clone",
    options: { signal?: AbortSignal } = {}
  ): Promise<EidosGraftRepositorySession> {
    const password = Buffer.from(input.password)
    input.password.fill(0)
    let repository: EidosGraftRepositorySession | null = null
    if (this.connecting) {
      password.fill(0)
      throw new Error("Encrypted Sync is already unlocking")
    }
    this.connecting = true
    const generation = ++this.generation
    const active = () => {
      if (options.signal?.aborted || generation !== this.generation)
        throw Object.assign(new Error("Encrypted Sync was locked"), {
          code: "GRAFT_SDK_E2EE_LOCKED",
        })
    }
    let revocation: Promise<void> | undefined
    const abort = () => {
      revocation ??= this.lock()
      void revocation.catch(() => undefined)
    }
    options.signal?.addEventListener("abort", abort, { once: true })
    try {
      active()
      await assertSpaceRepositoryBoundary(root)
      active()
      if (password.length < 1 || password.length > 1024)
        throw new Error("Sync password must contain 1–1024 UTF-8 bytes")
      const { connection } = input
      assertSyncEncryptionBinding(
        connection.url,
        connection.authenticationDomain
      )
      await this.releaseAuthority()
      active()
      const sdk = loadEidosGraftSdk()
      let initialSource: { branch: string; commit: string } | undefined
      if (mode === "initialize") {
        const inspector = await sdk.RepositorySession.open(root)
        try {
          const origin = (await inspector.listRemotes()).remotes.find(
            (remote) => remote.name === "origin"
          )
          if (
            origin &&
            (origin.kind !== "encrypted_http" || origin.url !== connection.url)
          )
            throw Object.assign(
              new Error(
                "This Space already has another origin. Disconnect its cloud connection before enabling encrypted Sync again."
              ),
              { code: "GRAFT_SDK_E2EE_ORIGIN_CONFLICT" }
            )
          const metadata = await inspector.repositoryMetadata()
          if (!metadata.current_branch || !metadata.current_head)
            throw Object.assign(
              new Error("Save a local version before enabling encrypted Sync"),
              { code: "GRAFT_SDK_E2EE_STALE_OBSERVATION" }
            )
          initialSource = {
            branch: metadata.current_branch,
            commit: metadata.current_head,
          }
        } finally {
          await inspector.close()
        }
        active()
      }
      const slot = createHash("sha256")
        .update(
          JSON.stringify([
            connection.authenticationDomain,
            connection.accountSubject,
            connection.uuid,
            connection.url,
            input.stateIdentity ?? root,
          ])
        )
        .digest("hex")
      await fs.mkdir(connection.stateDirectory, {
        recursive: true,
        mode: 0o700,
      })
      const directory = path.join(connection.stateDirectory, slot)
      const existing = await fs.lstat(directory).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      })
      const created = existing === null
      const stagingDirectory = path.join(directory, "staging")
      if (created) {
        sdk.EncryptedRemoteSession.createPrivateDirectory(directory)
        for (const child of ["staging", "checkpoint", "recovery"])
          sdk.EncryptedRemoteSession.createPrivateDirectory(
            path.join(directory, child)
          )
      }
      active()
      const authority = new sdk.EncryptedRemoteSession({
        remoteName: "origin",
        url: connection.url,
        uuid: connection.uuid,
        authenticationDomain: connection.authenticationDomain,
        accountSubject: connection.accountSubject,
        bearerToken: connection.bearerToken,
        checkpointDirectory: path.join(directory, "checkpoint"),
        recoveryDirectory: path.join(directory, "recovery"),
        stagingDirectory,
        createCheckpoint: created,
      })
      this.authority = authority
      this.binding = connection
      if (mode === "initialize") {
        const result = created
          ? await authority.initializeConfig(password, initialSource)
          : await authority.resumeInitialConfig(password)
        if (result !== "config_published")
          throw Object.assign(
            new Error(
              "Encrypted initialization is pending; retry with the same Space and password"
            ),
            { code: "GRAFT_SDK_REMOTE_PUBLICATION_UNCONFIRMED" }
          )
      } else {
        await authority.unlock(password)
      }
      active()
      repository = await sdk.RepositorySession.open(root, {
        encryptedRemote: authority,
      })
      active()
      if (mode === "initialize") {
        const remotes = await repository.listRemotes()
        if (!remotes.remotes.some((remote) => remote.name === "origin"))
          await repository.addEncryptedRemote()
        const verificationDirectory = path.join(
          directory,
          `verification-${crypto.randomUUID()}`
        )
        const result = await repository.pushInitialBranch({
          verificationDirectory,
          signal: options.signal,
        })
        active()
        if (result.state !== "connected")
          throw new Error(
            "Encrypted initial publication was not independently confirmed"
          )
        await fs.rm(verificationDirectory, { recursive: true, force: true })
      } else if (mode === "clone") {
        await repository.cloneEncryptedRemote({
          branch: "main",
          signal: options.signal,
        })
        active()
      }
      const origin = (await repository.listRemotes()).remotes.find(
        (remote) => remote.name === "origin"
      )
      active()
      if (origin?.kind !== "encrypted_http" || origin.url !== connection.url)
        throw new Error(
          "Encrypted Sync origin does not match its bound identity"
        )
      await repository.configureRemote({
        name: "origin",
        url: `graft+e2ee:${origin.url}#${connection.uuid}`,
        upstreamBranch: "main",
        ...(options.signal ? { signal: options.signal } : {}),
      })
      active()
      return repository
    } catch (error) {
      await repository?.close().catch(() => undefined)
      await this.releaseAuthority()
      throw error
    } finally {
      options.signal?.removeEventListener("abort", abort)
      try {
        await revocation
      } finally {
        password.fill(0)
        this.connecting = false
      }
    }
  }

  refresh(token: string): boolean {
    if (!this.authority || !this.binding) return false
    if (this.authority.state === "disconnected")
      throw Object.assign(new Error("Unlock encrypted Sync for this session"), {
        code: "GRAFT_SDK_E2EE_LOCKED",
      })
    this.authority.refreshBearerToken(
      this.binding.authenticationDomain,
      this.binding.accountSubject,
      token
    )
    return true
  }

  async disconnect(): Promise<void> {
    this.generation += 1
    await this.releaseAuthority()
  }

  private async releaseAuthority(): Promise<void> {
    const authority = this.authority
    await authority?.disconnect()
    this.authority = null
    this.binding = null
  }

  async lock(): Promise<void> {
    this.generation += 1
    await this.authority?.lock()
  }
}
