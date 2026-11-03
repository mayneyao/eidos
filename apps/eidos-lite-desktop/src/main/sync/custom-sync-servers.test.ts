import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { SecretEncryption } from "../account/credential-store"
import { CustomSyncServers } from "./custom-sync-servers"

const origin = "https://personal.example"
const token = "synthetic-token-0123456789abcdef0123456789"
function encryption(): SecretEncryption {
  const key = randomBytes(32)
  return {
    isAvailable: () => true,
    encrypt(text) {
      const nonce = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, nonce)
      const body = Buffer.concat([cipher.update(text), cipher.final()])
      return Buffer.concat([nonce, cipher.getAuthTag(), body])
    },
    decrypt(bytes) {
      const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12))
      cipher.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString("utf8")
    },
  }
}
function fetcher(): typeof fetch {
  return async (input) => {
    const url = new URL(String(input))
    if (url.pathname === "/.well-known/graft")
      return Response.json({
        protocol: "graft-remote",
        version: 1,
        remote_url_template: `${url.origin}/personal/{repository}`,
        authentication: { scheme: "bearer", authority: url.origin },
        management: { repositories: `${url.origin}/api/graft/repositories` },
      })
    return Response.json({ namespace: "personal", repositories: [] })
  }
}

describe("CustomSyncServers", () => {
  let directory: string
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-custom-sync-"))
  })
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  it("shares discovery while independently checking identity and membership", async () => {
    const uuid = "00010203-0405-4607-8809-0a0b0c0d0e0f"
    const encryptionInfo = {
      profile: "encrypted-remote-v1",
      version: 1,
      suite: 1,
      uuid,
    }
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls: string[] = []
    let gated = false
    let listed = true
    const network: typeof fetch = async (input, init) => {
      const url = new URL(String(input))
      calls.push(url.pathname)
      if (url.pathname === "/.well-known/graft") return fetcher()(input, init)
      if (gated) await gate
      if (url.pathname === "/personal/notes")
        return Response.json({
          protocol: "graft-remote",
          version: 1,
          encryption: encryptionInfo,
        })
      return Response.json({
        namespace: "personal",
        repositories: listed
          ? [
              {
                name: "notes",
                display_name: "Notes",
                created_at: 1,
                remote_url: `${origin}/personal/notes`,
                encryption: encryptionInfo,
              },
            ]
          : [],
      })
    }
    const servers = new CustomSyncServers(
      path.join(directory, "custom.bin"),
      encryption(),
      {
        requireAccess: async () => undefined,
        fetchImpl: network,
      }
    )
    await servers.save({ name: "Personal", origin, token })
    calls.length = 0
    gated = true
    const access = servers.verifyAccess(`${origin}/personal/notes`, uuid)
    await vi.waitFor(() =>
      expect(calls).toEqual([
        "/.well-known/graft",
        "/personal/notes",
        "/api/graft/repositories",
      ])
    )
    release()
    await expect(access).resolves.toMatchObject({ encryption: { uuid } })
    await expect(
      servers.verifyAccess(
        `${origin}/personal/notes`,
        "10010203-0405-4607-8809-0a0b0c0d0e0f"
      )
    ).rejects.toMatchObject({ code: "invalid-response" })
    listed = false
    await expect(
      servers.verifyAccess(`${origin}/personal/notes`, uuid)
    ).rejects.toMatchObject({ code: "remote-not-found" })
  })

  it("keeps the previous connection when testing replacement credentials fails", async () => {
    let rejectAccess = false
    const network: typeof fetch = async (input, init) => {
      if (
        rejectAccess &&
        new URL(String(input)).pathname === "/api/graft/repositories"
      ) {
        return new Response("Unauthorized", { status: 401 })
      }
      return fetcher()(input, init)
    }
    const servers = new CustomSyncServers(
      path.join(directory, "custom.bin"),
      encryption(),
      {
        requireAccess: async () => undefined,
        fetchImpl: network,
      }
    )
    const profile = await servers.save({ name: "Personal", origin, token })
    const previous = await servers.context(profile.id)
    rejectAccess = true
    await expect(
      servers.save({
        id: profile.id,
        name: "Replacement",
        origin,
        token: `${token}-incorrect`,
      })
    ).rejects.toThrow()
    expect(await servers.list()).toEqual([profile])
    expect((await servers.context(profile.id)).accessToken).toBe(token)
    expect(() => previous.assertCurrent()).not.toThrow()
  })

  it("encrypts credentials, keeps them out of summaries, and retains identity across restart/rotation", async () => {
    const file = path.join(directory, "custom.bin"),
      crypto = encryption()
    const options = {
      requireAccess: async () => undefined,
      fetchImpl: fetcher(),
    }
    const servers = new CustomSyncServers(file, crypto, options)
    const profile = await servers.save({ name: "Personal", origin, token })
    expect(JSON.stringify(profile)).not.toContain(token)
    expect((await fs.readFile(file)).includes(Buffer.from(token))).toBe(false)
    const reloaded = new CustomSyncServers(file, crypto, options)
    expect(await reloaded.list()).toEqual([profile])
    const before = await reloaded.context(profile.id)
    const changed = await reloaded.save({
      id: profile.id,
      name: "Renamed",
      origin,
      token: `${token}-rotated`,
    })
    expect(changed.id).toBe(profile.id)
    expect(() => before.assertCurrent()).toThrow()
    const current = await reloaded.resolve(`${origin}/personal/notes`)
    expect(current).toMatchObject({
      subject: "personal",
      serverId: profile.id,
      accessToken: `${token}-rotated`,
    })
  })

  it("requires Spark before server access while allowing local configuration removal", async () => {
    let active = true
    const network = vi.fn(fetcher())
    const servers = new CustomSyncServers(
      path.join(directory, "custom.bin"),
      encryption(),
      {
        requireAccess: async () => {
          if (!active) throw new Error("Activate Spark")
        },
        fetchImpl: network,
      }
    )
    const profile = await servers.save({ name: "Personal", origin, token })
    const access = await servers.context(profile.id)
    const calls = network.mock.calls.length
    active = false
    await expect(servers.repositories(profile.id)).rejects.toThrow(
      "Activate Spark"
    )
    await expect(
      servers.save({ name: "Blocked", origin: "https://second.example", token })
    ).rejects.toThrow("Activate Spark")
    expect(network).toHaveBeenCalledTimes(calls)
    expect(await servers.list()).toHaveLength(1)
    await servers.remove(profile.id)
    expect(() => access.assertCurrent()).toThrow()
    expect(await servers.list()).toEqual([])
  })

  it("never changes an existing profile's origin, and does not route other servers through it", async () => {
    const servers = new CustomSyncServers(
      path.join(directory, "custom.bin"),
      encryption(),
      { requireAccess: async () => undefined, fetchImpl: fetcher() }
    )
    const profile = await servers.save({ name: "Personal", origin, token })
    await expect(
      servers.save({
        id: profile.id,
        name: "Moved",
        origin: "https://other.example",
        token,
      })
    ).rejects.toMatchObject({ code: "invalid-server" })
    expect(
      await servers.resolve("https://other.example/personal/notes")
    ).toBeNull()
    expect(
      await servers.resolve(`${origin}/personal/notes?token=wrong`)
    ).toBeNull()
    expect(await servers.list()).toEqual([profile])
  })

  it("fails closed when system encryption is unavailable", async () => {
    const crypto = encryption()
    crypto.isAvailable = () => false
    const file = path.join(directory, "custom.bin")
    const servers = new CustomSyncServers(file, crypto, {
      requireAccess: async () => undefined,
      fetchImpl: fetcher(),
    })
    await expect(
      servers.save({ name: "Personal", origin, token })
    ).rejects.toMatchObject({ code: "credential-unavailable" })
    await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" })
  })
})
