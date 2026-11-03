import { createHash } from "node:crypto"
import { withObjectProof } from "../src/object-proof"
import { env } from "cloudflare:workers"
import { runDurableObjectAlarm } from "cloudflare:test"
import { openCloudflareRepository } from "@eidos.space/graft-remote-cloudflare"
import { describe, expect, it } from "vitest"
import { createGraftRemoteWorker } from "../src"
import { namespaceForUser, type EidosPrincipal } from "../src/auth"

async function fixture(wrap?: (bucket: R2Bucket) => R2Bucket) {
  const userId = "proof-" + crypto.randomUUID()
  const namespace = await namespaceForUser(userId)
  const principal: EidosPrincipal = {
    userId,
    namespace,
    syncAccess: {
      version: 1,
      revision: 1,
      service: "eidos_sync",
      access: "read_write",
      quotaBytes: 1_000_000_000,
      deviceLimit: 0,
    },
  }
  const worker = createGraftRemoteWorker({
    authenticate: async () => principal,
  })
  const bindings = wrap
    ? { ...env, GRAFT_OBJECTS: wrap(env.GRAFT_OBJECTS) }
    : env
  const request = (path: string, init: RequestInit = {}) =>
    worker.request(
      "https://sync.eidos.space" + path,
      { ...init, headers: { "Graft-Protocol": "1", ...init.headers } },
      bindings
    )
  const creation = await request("/api/graft/repositories/proof", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: "Proof test",
      encryption: "encrypted-remote-v1",
    }),
  })
  expect(creation.status, await creation.clone().text()).toBe(201)
  await creation.text()
  const backend = await openCloudflareRepository(
    { objects: env.GRAFT_OBJECTS, repositories: env.GRAFT_REPOSITORIES },
    namespace + "/proof"
  )
  return {
    backend,
    corrupt: async (bytes: Uint8Array<ArrayBuffer>) => {
      const record = await env.GRAFT_REPOSITORIES.getByName(
        namespace + "/proof"
      ).getEncryptedObject(key)
      await env.GRAFT_OBJECTS.put(record!.key, bytes)
    },
    alarm: () =>
      runDurableObjectAlarm(env.GRAFT_DIRECTORY.getByName(namespace)),
    proof: (path: string, size: number, challenge = new Uint8Array(32)) =>
      request("/" + namespace + "/proof/e2ee/object-proof/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": "32",
          "X-Graft-Object-Bytes": String(size),
        },
        body: challenge,
      }),
    remove: () =>
      request("/api/graft/repositories/proof", { method: "DELETE" }),
  }
}

const key = "e2ee/files/" + "b".repeat(64)

describe("proof stream failure and cancellation", () => {
  it("rejects a truncated snapshot and cancels the reader", async () => {
    const f = await fixture()
    let cancelled = false
    f.backend.get = async () => ({
      size: 1024,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(100))
          controller.close()
        },
        cancel() {
          cancelled = true
        },
      }),
    })
    const proof = withObjectProof(f.backend).encryptedObjectProof!
    await expect(proof(key, new Uint8Array(1))).rejects.toMatchObject({
      code: "object_length_mismatch",
    })
    // The source has already closed, so there is nothing left to cancel.
    expect(cancelled).toBe(false)
  })
  it("cancels a stalled snapshot on caller abort and bounded timeout", async () => {
    for (const abort of [false, true]) {
      const f = await fixture()
      let cancelled = false
      f.backend.get = async () => ({
        size: 1024,
        body: new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true
          },
        }),
      })
      const controller = new AbortController()
      const proof = withObjectProof(f.backend, controller.signal, 20)
        .encryptedObjectProof!(key, new Uint8Array(1))
      if (abort) setTimeout(() => controller.abort(), 1)
      await expect(proof).rejects.toMatchObject({
        code: "object_proof_interrupted",
      })
      expect(cancelled).toBe(true)
    }
  })
})
function expected(
  uuid: string,
  challenge: Uint8Array,
  size: number,
  chunk: Uint8Array
): string {
  const keyBytes = new TextEncoder().encode(key)
  const lengths = new Uint8Array(12)
  new DataView(lengths.buffer).setUint32(0, keyBytes.length)
  new DataView(lengths.buffer).setBigUint64(4, BigInt(size))
  const hash = createHash("sha256")
    .update("GRAFT-E2EE-OBJECT-PROOF-V1\0")
    .update(Buffer.from(uuid.replaceAll("-", ""), "hex"))
    .update(lengths.subarray(0, 4))
    .update(keyBytes)
    .update(lengths.subarray(4))
    .update(challenge)
  for (let n = 0; n < size; n += chunk.length)
    hash.update(chunk.subarray(0, Math.min(chunk.length, size - n)))
  return hash.digest("hex")
}
describe("persisted ciphertext object proof", () => {
  it("hashes changed persisted bytes instead of an upload-time receipt", async () => {
    const f = await fixture()
    const bytes = new Uint8Array(1024).fill(5)
    await f.backend.putIfAbsent(key, bytes, "immutable")
    const challenge = new Uint8Array(32).fill(11)
    const before = await f.proof(key, bytes.length, challenge)
    expect(before.status).toBe(200)
    const original = (await before.json()) as { sha256: string }
    bytes[31] = 66
    await f.corrupt(bytes)
    const after = await f.proof(key, bytes.length, challenge)
    expect(after.status).toBe(200)
    const changed = (await after.json()) as { sha256: string }
    expect(changed.sha256).not.toBe(original.sha256)
    expect(changed.sha256).toBe(
      expected(f.backend.encryption!.uuid, challenge, bytes.length, bytes)
    )
    await f.corrupt(bytes.subarray(0, 100))
    const truncated = await f.proof(key, bytes.length, challenge)
    expect(truncated.status).toBeGreaterThanOrEqual(400)
    await truncated.text()
  })
  it("matches the frozen cross-language byte vector against persisted R2 bytes", async () => {
    const f = await fixture()
    const vectorKey = "e2ee/files/" + "a".repeat(64)
    await f.backend.putIfAbsent(
      vectorKey,
      new Uint8Array([0, 1, 2, 254, 255]),
      "immutable"
    )
    const prefix = new Uint8Array(
      Buffer.from(
        "47524146542d453245452d4f424a4543542d50524f4f462d563100000102030405460788090a0b0c0d0e0f0000004b653265652f66696c65732f616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161610000000000000005000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        "hex"
      )
    )
    const result = await withObjectProof(f.backend).encryptedObjectProof!(
      vectorKey,
      prefix
    )
    expect(result).toEqual({
      size: 5,
      sha256:
        "4f904ed57dc3ecc8393ec4494eaa74bc6682a63a067043e3a689490d45e0532a",
    })
  })

  it("holds deletion admission through both reads and rejects a third concurrent proof", async () => {
    let startedCount = 0
    let started!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const proceed = new Promise<void>((resolve) => {
      release = resolve
    })
    const f = await fixture(
      (bucket) =>
        new Proxy(bucket, {
          get(target, property) {
            if (property === "get")
              return async (...args: Parameters<R2Bucket["get"]>) => {
                const snapshot = await target.get(...args)
                if (++startedCount === 2) started()
                await proceed
                return snapshot
              }
            const value: unknown = Reflect.get(target, property, target)
            return typeof value === "function" ? value.bind(target) : value
          },
        })
    )
    await f.backend.putIfAbsent(key, new Uint8Array(1024), "immutable")
    const pending = [f.proof(key, 1024), f.proof(key, 1024)]
    await entered
    try {
      const busy = await f.proof(key, 1024)
      expect(busy.status, await busy.text()).toBe(429)
      const deletion = await f.remove()
      expect(deletion.status, await deletion.text()).toBe(202)
      await f.alarm()
      const denied = await f.proof(key, 1024)
      expect(denied.status, await denied.text()).toBe(404)
    } finally {
      release()
    }
    for (const response of await Promise.all(pending))
      expect(response.status, await response.text()).toBe(200)
    await f.alarm()
    expect((await f.proof(key, 1024)).status).toBe(404)
  })
  it("streams 80 MiB from R2, binds fresh challenges, and rejects encoded separators", async () => {
    const f = await fixture()
    const size = 80 * 1024 * 1024
    const chunk = new Uint8Array(1024 * 1024).fill(123)
    let written = 0
    await f.backend.putIfAbsent(
      key,
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (written === size) controller.close()
          else {
            controller.enqueue(chunk)
            written += chunk.length
          }
        },
      }),
      "immutable",
      { contentLength: size }
    )
    for (const encoded of [false, true]) {
      const challenge = new Uint8Array(32).fill(encoded ? 29 : 17)
      const result = await f.proof(key, size, challenge)
      expect(result.status, await result.clone().text()).toBe(200)
      expect(result.headers.get("cache-control")).toBe("no-store")
      const text = await result.text()
      expect(text.length).toBeLessThan(4096)
      expect(JSON.parse(text)).toMatchObject({
        version: 1,
        uuid: f.backend.encryption!.uuid,
        key,
        ciphertext_bytes: size,
        challenge: Buffer.from(challenge).toString("hex"),
        sha256: expected(f.backend.encryption!.uuid, challenge, size, chunk),
      })
    }
    expect((await f.proof(encodeURIComponent(key), size)).status).toBe(400)
    expect((await f.proof(key, size - 1)).status).toBe(409)
    expect((await f.proof("e2ee/files/" + "c".repeat(64), size)).status).toBe(
      404
    )
    expect((await f.proof("e2ee/config", size)).status).toBe(400)
    expect((await f.proof(key, size, new Uint8Array(31))).status).toBe(400)
    await f.remove()
    expect((await f.proof(key, size)).status).toBe(404)
  }, 60_000)
})
