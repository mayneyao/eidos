import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { SecretEncryption } from "../account/credential-store"
import { SpaceSession } from "../space/space-session"
import { SpaceOperationGate } from "../space/operation-gate"
import { SpaceOperationJournal } from "../space/operation-journal"
import type { SyncControlPlane } from "./sync-control-plane"
import type { GraftEncryptedInput } from "../../shared/graft-sdk-contracts"
import {
  RememberedSyncUnlockStore,
  RememberedSyncUnlocks,
  canRememberSyncUnlock,
  type RememberedSyncIdentity,
} from "./remembered-sync-unlocks"

function encryption(): SecretEncryption {
  const key = randomBytes(32)
  return {
    isAvailable: () => true,
    encrypt: (value) => {
      const nonce = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", key, nonce)
      const ciphertext = Buffer.concat([cipher.update(value), cipher.final()])
      return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext])
    },
    decrypt: (value) => {
      const cipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12))
      cipher.setAuthTag(value.subarray(12, 28))
      return Buffer.concat([
        cipher.update(value.subarray(28)),
        cipher.final(),
      ]).toString()
    },
  }
}

describe.skipIf(process.platform === "win32")(
  "remembered encrypted Sync",
  () => {
    let root: string
    let crypto: SecretEncryption
    let store: RememberedSyncUnlockStore
    const identity: RememberedSyncIdentity = {
      domain: "https://staging.eidos.space",
      account: "owner-a",
      remote: "https://sync-staging.eidos.space/u-test/one",
      space: "/independent/one",
      encryption: {
        profile: "encrypted-remote-v1",
        version: 1,
        suite: 1,
        uuid: "00010203-0405-4607-8809-0a0b0c0d0e0f",
      },
    }
    beforeEach(async () => {
      root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-remember-unlock-"))
      crypto = encryption()
      store = new RememberedSyncUnlockStore(path.join(root, "private"), crypto)
    })
    afterEach(async () => {
      await fs.rm(root, { recursive: true, force: true })
    })

    it("refuses Linux basic_text, unknown protection and unsupported platforms", () => {
      expect(canRememberSyncUnlock("linux", true, "basic_text")).toBe(false)
      expect(canRememberSyncUnlock("linux", true, "unknown")).toBe(false)
      expect(canRememberSyncUnlock("linux", true, "arbitrary-backend")).toBe(
        false
      )
      expect(canRememberSyncUnlock("linux", true, "gnome_libsecret")).toBe(true)
      expect(canRememberSyncUnlock("darwin", false)).toBe(false)
      expect(canRememberSyncUnlock("win32", true)).toBe(false)
    })

    it("reopens owner-only ciphertext with the same system protector, without plaintext or password JSON", async () => {
      const password = Buffer.from("independent synthetic password")
      await store.write(identity, password)
      const file = path.join(
        root,
        "private",
        (await fs.readdir(path.join(root, "private")))[0]!
      )
      const bytes = await fs.readFile(file)
      expect(bytes.includes(password)).toBe(false)
      expect(bytes.includes(Buffer.from(password.toString("base64")))).toBe(
        false
      )
      expect((await fs.stat(file)).mode & 0o077).toBe(0)
      const recovered = await new RememberedSyncUnlockStore(
        path.join(root, "private"),
        crypto
      ).read(identity)
      expect(recovered).toEqual(password)
      recovered?.fill(0)
      password.fill(0)
    })

    it.each([
      "domain",
      "account",
      "remote",
      "space",
      "uuid",
      "profile",
      "suite",
    ])(
      "rejects ciphertext transplanted to a different %s binding",
      async (field) => {
        await store.write(identity, Buffer.from("first credential"))
        const directory = path.join(root, "private")
        const original = (await fs.readdir(directory))[0]!
        const changed = structuredClone(identity)
        if (field === "uuid")
          changed.encryption.uuid = "10010203-0405-4607-8809-0a0b0c0d0e0f"
        else if (field === "profile")
          Object.assign(changed.encryption, { profile: "other-profile" })
        else if (field === "suite")
          Object.assign(changed.encryption, { suite: 2 })
        else
          Object.assign(changed, {
            [field]: identity[field as "domain"] + "/other",
          })
        await store.write(changed, Buffer.from("other credential"))
        const target = (await fs.readdir(directory)).find(
          (file) => file !== original
        )!
        await fs.copyFile(
          path.join(directory, original),
          path.join(directory, target)
        )
        await expect(store.read(changed)).rejects.toThrow("could not be read")
      }
    )

    it("never writes when system protection is unavailable and retains unreadable entries for explicit recovery", async () => {
      crypto.isAvailable = () => false
      await expect(
        store.write(identity, Buffer.from("synthetic password"))
      ).rejects.toThrow("unavailable")
      expect(
        await fs.stat(path.join(root, "private")).catch(() => null)
      ).toBeNull()
      crypto.isAvailable = () => true
      await store.write(identity, Buffer.from("synthetic password"))
      const lostProtector = new RememberedSyncUnlockStore(
        path.join(root, "private"),
        encryption()
      )
      await expect(lostProtector.read(identity)).rejects.toThrow(
        "could not be read"
      )
      expect(await store.has(identity)).toBe(true)
      crypto.isAvailable = () => false
      await expect(store.read(identity)).rejects.toThrow("unavailable")
    })

    it("rejects permissive files and symlinks, and forgetting one Space leaves another intact", async () => {
      await store.write(identity, Buffer.from("one"))
      const file = path.join(
        root,
        "private",
        (await fs.readdir(path.join(root, "private")))[0]!
      )
      await fs.chmod(file, 0o644)
      await expect(store.read(identity)).rejects.toThrow("permissions")
      await fs.chmod(file, 0o600)
      const other = { ...identity, space: "/independent/two" }
      await store.write(other, Buffer.from("two"))
      await store.forget(identity)
      expect(await store.read(identity)).toBeNull()
      expect((await store.read(other))?.toString()).toBe("two")
      await fs.symlink(path.join(root, "other-secret"), file)
      await expect(store.read(identity)).rejects.toThrow("permissions")
      await store.forget(identity)
      await store.forget(identity)
    })

    it("sanitizes secure-store errors and leaves no partial credential file", async () => {
      crypto.encrypt = () => {
        throw new Error("synthetic password must not be logged")
      }
      await expect(
        store.write(identity, Buffer.from("synthetic password"))
      ).rejects.toThrow("System secure storage could not protect")
      expect(await fs.readdir(path.join(root, "private"))).toEqual([])
    })

    function fixture() {
      let account = identity.account
      let state: "locked" | "unlocked" = "locked"
      const unlock = vi.fn(async (input: GraftEncryptedInput) => {
        expect(Buffer.from(input.password).toString()).toBe(
          "synthetic password"
        )
        input.password.fill(0)
        state = "unlocked"
      })
      const lock = vi.fn(async () => {
        state = "locked"
      })
      const session = {
        canonical: { id: "one", root: identity.space },
        hasEncryptedSync: vi.fn(async () => true),
        encryptedSyncStatus: vi.fn(async () => ({ state })),
        unlockEncryptedSync: unlock,
        lockEncryptedSync: lock,
      } as unknown as SpaceSession
      const control = {
        accountSubject: vi.fn(async () => account),
        repositories: vi.fn(async () => ({
          repositories: [
            { remoteUrl: identity.remote, encryption: identity.encryption },
          ],
        })),
      } as unknown as SyncControlPlane
      const create = () =>
        new RememberedSyncUnlocks(
          control,
          identity.domain,
          path.join(root, "native-private"),
          store
        )
      return {
        control,
        session,
        unlock,
        lock,
        create,
        setAccount: (value: string) => {
          account = value
        },
      }
    }

    it("persists one account default across restarts without exposing it to another account or domain", async () => {
      const model = fixture()
      const password = Buffer.from("synthetic default password")
      await model.create().setDefaultPassword(password)
      expect(await model.create().defaultStatus()).toEqual({
        available: true,
        configured: true,
      })
      const recovered = await model.create().readDefaultPassword()
      expect(recovered).toEqual(password)
      recovered?.fill(0)
      model.setAccount("other-owner")
      expect((await model.create().defaultStatus()).configured).toBe(false)
      expect(await model.create().readDefaultPassword()).toBeUndefined()
      const otherDomain = new RememberedSyncUnlocks(
        model.control,
        "https://eidos.space",
        root,
        store
      )
      expect(await otherDomain.readDefaultPassword()).toBeUndefined()
      await otherDomain.setDefaultPassword(Buffer.from("production password"))
      expect(await otherDomain.readDefaultPassword()).toEqual(
        Buffer.from("production password")
      )
      expect(await model.create().readDefaultPassword()).toBeUndefined()
      model.setAccount("owner")
      password.fill(0)
    })

    it("does not change existing Space credentials when replacing or removing the default", async () => {
      const model = fixture()
      const unlocks = model.create()
      await unlocks.setDefaultPassword(Buffer.from("first default"))
      await unlocks.remember(
        model.session,
        identity.remote,
        Buffer.from("synthetic password")
      )
      await unlocks.setDefaultPassword(Buffer.from("new default"))
      await unlocks.forgetDefaultPassword()
      expect((await model.create().defaultStatus()).configured).toBe(false)
      await model.create().autoUnlock(model.session, identity.remote, "token")
      expect(model.unlock).toHaveBeenCalledOnce()
    })

    it("rejects and clears a default password read interrupted by logout", async () => {
      const model = fixture()
      const host = model.create()
      await host.setDefaultPassword(Buffer.from("default for owner A"))
      let finishRead!: () => void
      const secret = Buffer.from("default for owner A")
      vi.spyOn(store, "read").mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          finishRead = resolve
        })
        return secret
      })
      const reading = host.readDefaultPassword(
        host.captureGeneration(),
        identity.account
      )
      const rejected = expect(reading).rejects.toThrow("interrupted")
      await vi.waitFor(() => expect(store.read).toHaveBeenCalled())
      host.blockAutomatic()
      model.setAccount("owner-b")
      host.reconnect()
      finishRead()
      await rejected
      expect(secret.every((byte) => byte === 0)).toBe(true)
    })

    it("does not read a different account's default for an existing operation", async () => {
      const model = fixture()
      const host = model.create()
      const read = vi.spyOn(store, "read")
      model.setAccount("owner-b")
      await expect(
        host.readDefaultPassword(host.captureGeneration(), identity.account)
      ).rejects.toThrow("account changed")
      expect(read).not.toHaveBeenCalled()
    })

    it("rejects a default password write when the account changes during identity lookup", async () => {
      const model = fixture()
      const host = model.create()
      let finishIdentity!: (subject: string) => void
      vi.mocked(model.control.accountSubject).mockReturnValueOnce(
        new Promise((resolve) => {
          finishIdentity = resolve
        })
      )
      const write = vi.spyOn(store, "write")
      const saving = host.setDefaultPassword(Buffer.from("old-account-secret"))
      const rejected = expect(saving).rejects.toThrow("account changed")
      await vi.waitFor(() =>
        expect(model.control.accountSubject).toHaveBeenCalledOnce()
      )
      model.setAccount("owner-b")
      finishIdentity(identity.account)
      await rejected
      expect(write).not.toHaveBeenCalled()
    })

    it("preserves invocation order when removing a default during delayed setup", async () => {
      const model = fixture()
      const host = model.create()
      let finishIdentity!: (subject: string) => void
      vi.mocked(model.control.accountSubject).mockReturnValueOnce(
        new Promise((resolve) => {
          finishIdentity = resolve
        })
      )
      const saving = host.setDefaultPassword(Buffer.from("default-password"))
      const forgetting = host.forgetDefaultPassword()
      await vi.waitFor(() =>
        expect(model.control.accountSubject).toHaveBeenCalledOnce()
      )
      finishIdentity(identity.account)
      await Promise.all([saving, forgetting])
      expect((await host.defaultStatus()).configured).toBe(false)
    })

    it("provides a pre-publication guard for logout, system lock and forgotten Spaces", async () => {
      const model = fixture()
      const host = model.create()
      const earlier = host.captureGeneration()
      host.suspendAutomatic()
      expect(() => host.assertCurrent(model.session, earlier)).toThrow(
        "interrupted"
      )
      host.resumeAutomatic()
      expect(() => host.assertCurrent(model.session, earlier)).toThrow(
        "interrupted"
      )
      const current = host.captureGeneration()
      expect(() => host.assertCurrent(model.session, current)).not.toThrow()
      await host.forget(model.session, identity.remote)
      expect(() => host.assertCurrent(model.session, current)).toThrow(
        "interrupted"
      )
    })

    it("forgets a Space offline, retaining the default without automatically re-enrolling the forgotten Space", async () => {
      const model = fixture()
      const unlocks = model.create()
      await unlocks.setDefaultPassword(Buffer.from("synthetic password"))
      await unlocks.remember(
        model.session,
        identity.remote,
        Buffer.from("synthetic password")
      )
      vi.mocked(model.control.repositories).mockRejectedValueOnce(
        new Error("offline")
      )
      await unlocks.forget(model.session, identity.remote)
      expect(model.control.repositories).toHaveBeenCalledTimes(1)
      expect((await model.create().defaultStatus()).configured).toBe(true)
      await model.create().autoUnlock(model.session, identity.remote, "token")
      expect(model.unlock).not.toHaveBeenCalled()
    })

    it("never falls back to plaintext default storage when system protection is lost", async () => {
      const model = fixture()
      crypto.isAvailable = () => false
      await expect(
        model.create().setDefaultPassword(Buffer.from("synthetic default"))
      ).rejects.toThrow("unavailable")
      expect(
        await fs.stat(path.join(root, "private")).catch(() => null)
      ).toBeNull()
    })

    it("automatically unlocks after host restart, but never loads another account's credential", async () => {
      const model = fixture()
      await model
        .create()
        .remember(
          model.session,
          identity.remote,
          Buffer.from("synthetic password")
        )
      model.setAccount("other-owner")
      await model
        .create()
        .autoUnlock(model.session, identity.remote, "synthetic-token")
      expect(model.unlock).not.toHaveBeenCalled()
      model.setAccount(identity.account)
      await model
        .create()
        .autoUnlock(model.session, identity.remote, "synthetic-token")
      expect(model.unlock).toHaveBeenCalledOnce()
      expect(
        model.unlock.mock.calls[0]![0].password.every((byte) => byte === 0)
      ).toBe(true)
    })

    it("blocks provider reload after explicit lock or logout until explicit reconnect", async () => {
      const model = fixture()
      const host = model.create()
      await host.remember(
        model.session,
        identity.remote,
        Buffer.from("synthetic password")
      )
      host.blockAutomatic()
      await host.autoUnlock(model.session, identity.remote, "synthetic-token")
      expect(model.unlock).not.toHaveBeenCalled()
      host.reconnect()
      await host.autoUnlock(model.session, identity.remote, "synthetic-token")
      expect(model.unlock).toHaveBeenCalledOnce()
    })

    it("cannot revive a session when locking races the initial status read", async () => {
      const model = fixture()
      const host = model.create()
      await host.remember(
        model.session,
        identity.remote,
        Buffer.from("synthetic password")
      )
      vi.mocked(model.session.hasEncryptedSync).mockImplementation(async () => {
        host.blockAutomatic()
        return true
      })
      await host.autoUnlock(model.session, identity.remote, "synthetic-token")
      expect(model.unlock).not.toHaveBeenCalled()
    })

    it("restores remembered unlock after system sleep without overriding logout", async () => {
      const model = fixture()
      const host = model.create()
      await host.remember(
        model.session,
        identity.remote,
        Buffer.from("synthetic password")
      )
      host.suspendAutomatic()
      await host.autoUnlock(model.session, identity.remote, "synthetic-token")
      expect(model.unlock).not.toHaveBeenCalled()
      host.resumeAutomatic()
      await host.autoUnlock(model.session, identity.remote, "synthetic-token")
      expect(model.unlock).toHaveBeenCalledOnce()
      await model.lock()
      model.unlock.mockClear()
      host.suspendAutomatic()
      host.blockAutomatic()
      host.resumeAutomatic()
      await host.autoUnlock(model.session, identity.remote, "synthetic-token")
      expect(model.unlock).not.toHaveBeenCalled()
    })

    it.each(["logout", "sleep", "forget"] as const)(
      "never creates native authority when %s interrupts an automatic unlock queued behind the real repository gate",
      async (reason) => {
        const model = fixture()
        const host = model.create()
        await host.remember(
          model.session,
          identity.remote,
          Buffer.from("synthetic password")
        )
        const gate = new SpaceOperationGate(
          new SpaceOperationJournal(path.join(root, "gate")),
          {
            closeRuntimes: async () => {},
            validateWorktree: async () => {},
            reopenRuntimes: async () => {},
          }
        )
        const nativeUnlock = vi.fn(async () => {})
        const target = {
          canonical: model.session.canonical,
          gate,
          graft: { encryptedSync: nativeUnlock },
        } as unknown as SpaceSession
        let release!: () => void
        const blocker = gate.withRepositoryOperation(
          "Existing operation",
          () =>
            new Promise<void>((resolve) => {
              release = resolve
            })
        )
        await vi.waitFor(() => expect(release).toBeTypeOf("function"))
        const enter = vi
          .spyOn(model.session, "unlockEncryptedSync")
          .mockImplementation((input, guard, signal) =>
            SpaceSession.prototype.unlockEncryptedSync.call(
              target,
              input,
              guard,
              signal
            )
          )
        const unlocking = host.autoUnlock(
          model.session,
          identity.remote,
          "token"
        )
        await vi.waitFor(() => expect(enter).toHaveBeenCalledOnce())
        const forgetting =
          reason === "forget"
            ? host.forget(model.session, identity.remote)
            : undefined
        if (reason === "logout") host.blockAutomatic()
        if (reason === "sleep") host.suspendAutomatic()
        expect(enter.mock.calls[0]?.[2]?.aborted).toBe(true)
        let drained = false
        const draining = host.drainPendingUnlocks().then(() => {
          drained = true
        })
        await Promise.resolve()
        expect(drained).toBe(false)
        release()
        await Promise.all([blocker, unlocking, draining, forgetting])
        expect(nativeUnlock).not.toHaveBeenCalled()
        expect(
          enter.mock.calls[0]?.[0].password.every((byte) => byte === 0)
        ).toBe(true)
        expect(drained).toBe(true)
        await gate.close()
      }
    )

    it("rejects a remembered-status read invalidated by system locking", async () => {
      const model = fixture()
      const host = model.create()
      let release!: () => void
      vi.spyOn(store, "has").mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return true
      })
      const status = host.status(model.session, identity.remote)
      const rejected = expect(status).rejects.toThrow("interrupted")
      await vi.waitFor(() => expect(store.has).toHaveBeenCalledOnce())
      host.suspendAutomatic()
      release()
      await rejected
    })

    it("drains every automatic unlock before reporting one failed native lock", async () => {
      const model = fixture()
      const host = model.create()
      let finishSecondLock!: () => void
      const secondLock = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishSecondLock = resolve
          })
      )
      const second = {
        ...model.session,
        canonical: { id: "two", root: "/independent/two" },
        lockEncryptedSync: secondLock,
      } as unknown as SpaceSession
      await host.remember(
        model.session,
        identity.remote,
        Buffer.from("synthetic password")
      )
      await host.remember(
        second,
        identity.remote,
        Buffer.from("synthetic password")
      )
      vi.mocked(model.session.unlockEncryptedSync).mockImplementation(
        async (_input, _guard, signal) => {
          await new Promise<void>((_resolve, reject) => {
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            })
          })
        }
      )
      model.lock.mockRejectedValueOnce(new Error("native lock failed"))
      const unlocking = Promise.allSettled([
        host.autoUnlock(model.session, identity.remote, "token"),
        host.autoUnlock(second, identity.remote, "token"),
      ])
      await vi.waitFor(() =>
        expect(model.session.unlockEncryptedSync).toHaveBeenCalledTimes(2)
      )
      host.blockAutomatic()
      let finished = false
      const draining = host.drainPendingUnlocks().finally(() => {
        finished = true
      })
      const rejected = expect(draining).rejects.toThrow("native lock failed")
      await vi.waitFor(() => expect(secondLock).toHaveBeenCalledOnce())
      expect(finished).toBe(false)
      finishSecondLock()
      await Promise.all([unlocking, rejected])
      expect(finished).toBe(true)
    })

    it("rejects a subject change during the final native status read", async () => {
      const model = fixture()
      const host = model.create()
      let finishRead!: () => void
      vi.mocked(model.session.encryptedSyncStatus).mockImplementationOnce(
        async () => {
          await new Promise<void>((resolve) => {
            finishRead = resolve
          })
          return { state: "locked" } as Awaited<
            ReturnType<SpaceSession["encryptedSyncStatus"]>
          >
        }
      )
      const status = host.status(model.session, identity.remote)
      const rejected = expect(status).rejects.toThrow("account changed")
      await vi.waitFor(() =>
        expect(model.session.encryptedSyncStatus).toHaveBeenCalledOnce()
      )
      model.setAccount("another-owner")
      finishRead()
      await rejected
    })

    it("reads native encryption state after the remembered-file check finishes", async () => {
      const model = fixture()
      const host = model.create()
      let state: "unlocked" | "locked" = "unlocked"
      vi.mocked(model.session.encryptedSyncStatus).mockImplementation(
        async () =>
          ({ state }) as Awaited<
            ReturnType<SpaceSession["encryptedSyncStatus"]>
          >
      )
      let release!: () => void
      vi.spyOn(store, "has").mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return true
      })
      const status = host.status(model.session, identity.remote)
      await vi.waitFor(() => expect(store.has).toHaveBeenCalledOnce())
      state = "locked"
      release()
      expect(await status).toMatchObject({ state: "locked", remembered: true })
    })

    it("forgets only after draining the session, and cannot automatically reload it", async () => {
      const model = fixture()
      const host = model.create()
      await host.remember(
        model.session,
        identity.remote,
        Buffer.from("synthetic password")
      )
      await host.autoUnlock(model.session, identity.remote, "synthetic-token")
      await host.forget(model.session, identity.remote)
      expect(model.lock).toHaveBeenCalledOnce()
      expect(await store.has(identity)).toBe(false)
      await host.autoUnlock(model.session, identity.remote, "synthetic-token")
      expect(model.unlock).toHaveBeenCalledOnce()
    })

    it("invalidates an earlier save when forgetting, without blocking another Space's save", async () => {
      const model = fixture()
      const host = model.create()
      const earlier = host.captureGeneration()
      const other = {
        ...model.session,
        canonical: { id: "two", root: "/independent/two" },
      } as unknown as SpaceSession
      const otherTicket = host.captureGeneration()
      await host.forget(model.session, identity.remote)
      await expect(
        host.remember(
          model.session,
          identity.remote,
          Buffer.from("synthetic password"),
          earlier
        )
      ).rejects.toThrow("interrupted")
      await host.remember(
        other,
        identity.remote,
        Buffer.from("other Space password"),
        otherTicket
      )
      expect(
        await store.has({ ...identity, space: other.canonical.root })
      ).toBe(true)
      expect(await store.has(identity)).toBe(false)
    })

    it("serializes forget against an in-flight save so a stale completion cannot delete a later explicit remember", async () => {
      const model = fixture()
      const host = model.create()
      let entered: () => void = () => undefined
      let release: () => void = () => undefined
      const saving = new Promise<void>((resolve) => {
        entered = resolve
      })
      const paused = new Promise<void>((resolve) => {
        release = resolve
      })
      const write = store.write.bind(store)
      vi.spyOn(store, "write").mockImplementationOnce(
        async (binding, password) => {
          entered()
          await paused
          await write(binding, password)
        }
      )
      const stale = host.remember(
        model.session,
        identity.remote,
        Buffer.from("synthetic password")
      )
      const rejected = expect(stale).rejects.toThrow("interrupted")
      await saving
      const forgetting = host.forget(model.session, identity.remote)
      const newer = host.remember(
        model.session,
        identity.remote,
        Buffer.from("synthetic password")
      )
      release()
      await rejected
      await forgetting
      await newer
      expect(await store.has(identity)).toBe(true)
    })
  }
)
