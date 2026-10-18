import fs from "node:fs/promises"
import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { EncryptedGraftHost } from "./encrypted-graft-host"
import type {
  GraftEncryptedInput,
  GraftTransferProgress,
} from "../../shared/graft-sdk-contracts"

const native = vi.hoisted(() => ({
  construct: Object.assign(vi.fn(), { createPrivateDirectory: vi.fn() }),
  open: vi.fn(),
}))
vi.mock("./graft-sdk-module", () => ({
  loadEidosGraftSdk: () => ({
    EncryptedRemoteSession: native.construct,
    RepositorySession: { open: native.open },
  }),
}))

describe("trusted encrypted host admission", () => {
  let root: string
  beforeEach(async () => {
    native.construct.mockReset()
    native.construct.createPrivateDirectory.mockReset()
    native.construct.createPrivateDirectory.mockImplementation(
      (directory: string) => mkdirSync(directory, { mode: 0o700 })
    )
    native.open.mockReset()
    root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "eidos-encrypted-host-"))
    )
    await fs.mkdir(path.join(root, "source"))
    await fs.mkdir(path.join(root, "source/.graft"))
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(root, { recursive: true, force: true })
  })
  const input = (root: string): GraftEncryptedInput => ({
    connection: {
      url: "https://sync-staging.eidos.space/u-test/space",
      uuid: "00010203-0405-4607-8809-0a0b0c0d0e0f",
      authenticationDomain: "https://staging.eidos.space",
      accountSubject: "synthetic-user",
      bearerToken: "synthetic-account-token",
      stateDirectory: path.join(root, "private"),
    },
    password: Buffer.from("synthetic sync password"),
  })

  it("rejects cross-environment bindings before constructing a native authority and consumes the password", async () => {
    const supplied = input(root)
    supplied.connection.url = "https://sync.eidos.space/u-test/space"
    await expect(
      new EncryptedGraftHost().connect(
        path.join(root, "source"),
        supplied,
        "unlock"
      )
    ).rejects.toThrow("same official environment")
    expect(supplied.password.every((byte) => byte === 0)).toBe(true)
    expect(native.construct).not.toHaveBeenCalled()
  })

  it("consumes a cancelled request without starting native unlock", async () => {
    const supplied = input(root)
    const abort = new AbortController()
    abort.abort()
    await expect(
      new EncryptedGraftHost().connect(
        path.join(root, "source"),
        supplied,
        "unlock",
        { signal: abort.signal }
      )
    ).rejects.toMatchObject({ code: "GRAFT_SDK_E2EE_LOCKED" })
    expect(native.construct).not.toHaveBeenCalled()
    expect(supplied.password.every((byte) => byte === 0)).toBe(true)
  })

  it("does not return from an aborted unlock until native key revocation has drained", async () => {
    const supplied = input(root)
    const abort = new AbortController()
    let finishUnlock!: () => void
    let finishLock!: () => void
    const authority = {
      state: "locked",
      unlock: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishUnlock = resolve
          })
      ),
      lock: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishLock = resolve
          })
      ),
      disconnect: vi.fn(async () => {}),
    }
    native.construct.mockImplementation(function () {
      return authority
    })
    const host = new EncryptedGraftHost()
    let settled = false
    const operation = host.connect(
      path.join(root, "source"),
      supplied,
      "unlock",
      { signal: abort.signal }
    )
    const rejected = expect(operation).rejects.toMatchObject({
      code: "GRAFT_SDK_E2EE_LOCKED",
    })
    void operation.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await vi.waitFor(() => expect(authority.unlock).toHaveBeenCalledOnce())
    abort.abort()
    expect(authority.lock).toHaveBeenCalledOnce()
    finishUnlock()
    await vi.waitFor(() => expect(authority.disconnect).toHaveBeenCalledOnce())
    expect(native.open).not.toHaveBeenCalled()
    expect(settled).toBe(false)
    finishLock()
    await rejected
    expect(supplied.password.every((byte) => byte === 0)).toBe(true)
  })

  it("passes cancellation to native clone and disconnects even if lock acknowledgement fails", async () => {
    const supplied = input(root)
    const abort = new AbortController()
    const onProgress = vi.fn()
    const transfer: GraftTransferProgress = {
      direction: "download",
      transferredBytes: 1024,
      totalIsFinal: false,
    }
    let nativeProgress: ((event: GraftTransferProgress) => void) | undefined
    const authority = {
      state: "unlocked",
      unlock: vi.fn(async () => {}),
      lock: vi.fn(async () => {
        throw new Error("native lock failed")
      }),
      disconnect: vi.fn(async () => {}),
    }
    const repository = {
      cloneEncryptedRemote: vi.fn(
        async (options: {
          signal: AbortSignal
          onProgress?: (event: GraftTransferProgress) => void
        }) => {
          expect(options.signal).toBe(abort.signal)
          nativeProgress = options.onProgress
          nativeProgress?.(transfer)
          await new Promise<void>((_resolve, reject) =>
            options.signal.addEventListener(
              "abort",
              () => reject(new Error("native clone aborted")),
              { once: true }
            )
          )
        }
      ),
      close: vi.fn(async () => {}),
    }
    native.construct.mockImplementation(function () {
      return authority
    })
    native.open.mockResolvedValue(repository)
    const operation = new EncryptedGraftHost().connect(
      path.join(root, "source"),
      supplied,
      "clone",
      { signal: abort.signal, onProgress }
    )
    const rejected = expect(operation).rejects.toThrow("native lock failed")
    await vi.waitFor(() =>
      expect(repository.cloneEncryptedRemote).toHaveBeenCalledOnce()
    )
    abort.abort()
    nativeProgress?.({ ...transfer, transferredBytes: 2048 })
    await rejected
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(transfer)
    expect(repository.close).toHaveBeenCalledOnce()
    expect(authority.disconnect).toHaveBeenCalledOnce()
    expect(supplied.password.every((byte) => byte === 0)).toBe(true)
  })

  it("rejects an existing ordinary origin before publishing encryption config or touching its binding", async () => {
    const supplied = input(root)
    const initializeConfig = vi.fn().mockResolvedValue("config_published")
    const repository = {
      listRemotes: vi.fn().mockResolvedValue({
        remotes: [
          {
            name: "origin",
            kind: "http",
            url: "https://sync-staging.eidos.space/u-test/previous-space",
          },
        ],
      }),
      addEncryptedRemote: vi.fn(),
      pushInitialBranch: vi
        .fn()
        .mockRejectedValue(new Error("initialization remote binding changed")),
      close: vi.fn().mockResolvedValue(undefined),
    }
    native.construct.mockImplementation(function () {
      return {
        initializeConfig,
        disconnect: vi.fn().mockResolvedValue(undefined),
      }
    })
    native.open.mockResolvedValue(repository)
    await expect(
      new EncryptedGraftHost().connect(
        path.join(root, "source"),
        supplied,
        "initialize"
      )
    ).rejects.toMatchObject({ code: "GRAFT_SDK_E2EE_ORIGIN_CONFLICT" })
    expect(initializeConfig).not.toHaveBeenCalled()
    expect(repository.addEncryptedRemote).not.toHaveBeenCalled()
    expect(repository.pushInitialBranch).not.toHaveBeenCalled()
    expect(supplied.password.every((byte) => byte === 0)).toBe(true)
  })

  it("can add encrypted origin when a different named remote exists", async () => {
    const supplied = input(root)
    const backup = {
      name: "backup",
      kind: "http",
      url: "https://sync-staging.eidos.space/u-test/backup",
    }
    let added = false
    const source = { branch: "main", commit: "11".repeat(32) }
    const initializeConfig = vi.fn().mockResolvedValue("config_published")
    const repository = {
      repositoryMetadata: vi.fn().mockResolvedValue({
        current_branch: source.branch,
        current_head: source.commit,
      }),
      listRemotes: vi.fn(async () => ({
        remotes: added
          ? [
              backup,
              {
                name: "origin",
                kind: "encrypted_http",
                url: supplied.connection.url,
              },
            ]
          : [backup],
      })),
      addEncryptedRemote: vi.fn(async () => {
        added = true
      }),
      pushInitialBranch: vi.fn().mockResolvedValue({ state: "connected" }),
      configureRemote: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }
    native.construct.mockImplementation(function () {
      return {
        state: "unlocked",
        initializeConfig,
        disconnect: vi.fn().mockResolvedValue(undefined),
      }
    })
    native.open.mockResolvedValue(repository)
    const host = new EncryptedGraftHost()
    const onProgress = vi.fn()
    await expect(
      host.connect(path.join(root, "source"), supplied, "initialize", {
        onProgress,
      })
    ).resolves.toBe(repository)
    const transfer: GraftTransferProgress = {
      direction: "upload",
      transferredBytes: 1024,
      totalIsFinal: false,
    }
    repository.pushInitialBranch.mock.calls[0][0].onProgress(transfer)
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(transfer)
    expect(repository.addEncryptedRemote).toHaveBeenCalledOnce()
    expect(initializeConfig).toHaveBeenCalledWith(expect.any(Buffer), source)
    expect(native.construct.createPrivateDirectory).toHaveBeenCalledTimes(4)
    expect((await repository.listRemotes()).remotes).toContain(backup)
    await host.disconnect()
  })

  it("rejects missing initial source before publishing config and wipes the password", async () => {
    const supplied = input(root)
    const repository = {
      listRemotes: vi.fn().mockResolvedValue({ remotes: [] }),
      repositoryMetadata: vi.fn().mockResolvedValue({
        current_branch: "main",
        current_head: null,
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }
    native.open.mockResolvedValue(repository)
    await expect(
      new EncryptedGraftHost().connect(
        path.join(root, "source"),
        supplied,
        "initialize"
      )
    ).rejects.toMatchObject({ code: "GRAFT_SDK_E2EE_STALE_OBSERVATION" })
    expect(native.construct).not.toHaveBeenCalled()
    expect(native.construct.createPrivateDirectory).not.toHaveBeenCalled()
    expect(repository.close).toHaveBeenCalledOnce()
    expect(supplied.password.every((byte) => byte === 0)).toBe(true)
  })

  it("resumes retained initialization without replacing intent from a changed HEAD", async () => {
    const supplied = input(root)
    const initializeConfig = vi.fn().mockResolvedValue("unconfirmed")
    const resumeInitialConfig = vi.fn().mockResolvedValue("config_published")
    const repository = {
      listRemotes: vi.fn().mockResolvedValue({
        remotes: [
          {
            name: "origin",
            kind: "encrypted_http",
            url: supplied.connection.url,
          },
        ],
      }),
      repositoryMetadata: vi
        .fn()
        .mockResolvedValueOnce({
          current_branch: "main",
          current_head: "11".repeat(32),
        })
        .mockResolvedValue({
          current_branch: "main",
          current_head: "22".repeat(32),
        }),
      pushInitialBranch: vi.fn().mockRejectedValue(
        Object.assign(new Error("retained source changed"), {
          code: "GRAFT_SDK_E2EE_STALE_OBSERVATION",
        })
      ),
      close: vi.fn().mockResolvedValue(undefined),
    }
    native.open.mockResolvedValue(repository)
    const authority = {
      state: "unlocked",
      initializeConfig,
      resumeInitialConfig,
      disconnect: vi.fn().mockResolvedValue(undefined),
    }
    native.construct.mockImplementation(function () {
      return authority
    })
    const host = new EncryptedGraftHost()
    // First attempt retains the native configuration; publication fails safely.
    await expect(
      host.connect(path.join(root, "source"), supplied, "initialize")
    ).rejects.toMatchObject({
      code: "GRAFT_SDK_REMOTE_PUBLICATION_UNCONFIRMED",
    })
    expect(initializeConfig).toHaveBeenCalledWith(expect.any(Buffer), {
      branch: "main",
      commit: "11".repeat(32),
    })
    initializeConfig.mockClear()
    await expect(
      host.connect(path.join(root, "source"), input(root), "initialize")
    ).rejects.toMatchObject({ code: "GRAFT_SDK_E2EE_STALE_OBSERVATION" })
    expect(initializeConfig).not.toHaveBeenCalled()
    expect(resumeInitialConfig).toHaveBeenCalledOnce()
    expect(native.construct.createPrivateDirectory).toHaveBeenCalledTimes(4)
  })

  it("cannot start native unlock after an explicit lock during private directory preparation", async () => {
    const supplied = input(root)
    const mkdir = fs.mkdir.bind(fs)
    let entered: () => void = () => undefined
    let release: () => void = () => undefined
    const preparing = new Promise<void>((resolve) => {
      entered = resolve
    })
    const paused = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(fs, "mkdir").mockImplementationOnce(async () => {
      entered()
      await paused
      await mkdir(supplied.connection.stateDirectory, {
        recursive: true,
        mode: 0o700,
      })
      return undefined
    })
    const host = new EncryptedGraftHost()
    const unlocking = host.connect(
      path.join(root, "source"),
      supplied,
      "unlock"
    )
    await preparing
    await host.lock()
    release()
    await expect(unlocking).rejects.toMatchObject({
      code: "GRAFT_SDK_E2EE_LOCKED",
    })
    expect(host.state).toBe("locked")
    expect(native.construct).not.toHaveBeenCalled()
    expect(supplied.password.every((byte) => byte === 0)).toBe(true)
  })

  it.each(["staging", "production"])(
    "establishes %s origin/main tracking without replacing the encrypted origin or passing a plain HTTP credential",
    async (environment) => {
      const supplied = input(root)
      if (environment === "production") {
        supplied.connection.url = "https://sync.eidos.space/u-test/space"
        supplied.connection.authenticationDomain = "https://eidos.space"
      }
      const authority = {
        state: "unlocked",
        unlock: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
      }
      const repository = {
        listRemotes: vi.fn().mockResolvedValue({
          remotes: [
            {
              name: "origin",
              kind: "encrypted_http",
              url: supplied.connection.url,
            },
          ],
        }),
        configureRemote: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }
      native.construct.mockImplementation(function () {
        return authority
      })
      native.open.mockResolvedValue(repository)
      const host = new EncryptedGraftHost()
      await expect(
        host.connect(path.join(root, "source"), supplied, "unlock")
      ).resolves.toBe(repository)
      expect(repository.configureRemote).toHaveBeenCalledWith({
        name: "origin",
        url: `graft+e2ee:${supplied.connection.url}#${supplied.connection.uuid}`,
        upstreamBranch: "main",
      })
      await host.disconnect()
      expect(authority.disconnect).toHaveBeenCalledOnce()
    }
  )
})
