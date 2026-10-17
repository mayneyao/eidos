import { env, exports } from "cloudflare:workers"
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test"
import { openCloudflareRepository } from "@eidos.space/graft-remote-cloudflare"
import { describe, expect, it } from "vitest"
import { createGraftRemoteWorker } from "../src"
import { namespaceForUser, type EidosPrincipal } from "../src/auth"
import type { RepositoryDirectoryDurableObject } from "../src/directory"

const ORIGIN = "https://sync.eidos.space"

async function fixture() {
  const userId = "management-" + crypto.randomUUID()
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
  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set("Graft-Protocol", "1")
    return worker.request(ORIGIN + path, { ...init, headers }, env)
  }
  const create = async (name: string, encrypted = false) => {
    const result = await request("/api/graft/repositories/" + name, {
      method: "PUT",
      body: JSON.stringify({
        display_name: name,
        ...(encrypted ? { encryption: "encrypted-remote-v1" } : {}),
      }),
    })
    expect(result.status).toBe(201)
    await result.text()
    return namespace + "/" + name
  }
  return {
    userId,
    namespace,
    principal,
    worker,
    request,
    create,
    directory: env.GRAFT_DIRECTORY.getByName(namespace),
  }
}

function account(userId: string, action: "list" | "delete", name?: string) {
  return exports.SyncAccountEntrypoint.fetch(
    new Request("https://sync-account.internal/v1/repositories/" + action, {
      method: "POST",
      body: JSON.stringify({ userId, name }),
    })
  )
}

async function completeDeletion(
  directory: DurableObjectStub<RepositoryDirectoryDurableObject>,
  userId: string,
  name: string
) {
  for (let attempt = 0; attempt < 12; attempt++) {
    await runDurableObjectAlarm(directory)
    if (
      !(await directory.listManagedRepositories(userId)).some(
        (row) => row.name === name
      )
    )
      return
  }
  throw new Error("Deletion did not complete")
}

describe("account-owned repository deletion", () => {
  it("pages the owner's repository list without skipping or exposing another owner's rows", async () => {
    const f = await fixture()
    for (let index = 0; index < 103; index++) {
      const name = "page-" + String(index).padStart(3, "0")
      await f.directory.createRepository(f.namespace, name, name, f.userId)
    }
    const first = await (
      await account(f.userId, "list")
    ).json<{ repositories: { name: string }[]; nextCursor: string }>()
    expect(first.repositories).toHaveLength(100)
    expect(first.nextCursor).toBe("page-099")
    const second = await exports.SyncAccountEntrypoint.fetch(
      new Request("https://sync-account.internal/v1/repositories/list", {
        method: "POST",
        body: JSON.stringify({ userId: f.userId, after: first.nextCursor }),
      })
    )
    expect(await second.json()).toMatchObject({
      repositories: [
        { name: "page-100" },
        { name: "page-101" },
        { name: "page-102" },
      ],
      nextCursor: null,
    })
  })

  it("refuses metadata cleanup when the supplied identity belongs to another object", async () => {
    const f = await fixture()
    const id = await f.create("identity")
    const message = await runInDurableObject(
      env.GRAFT_REPOSITORIES.getByName(id),
      async (instance) => {
        try {
          await instance.purgeForDeletion(f.namespace + "/other")
          return "not rejected"
        } catch (cause) {
          return cause instanceof Error ? cause.message : "unknown error"
        }
      }
    )
    expect(message).toContain("identity does not match")
  })

  it("removes all object pages, metadata and exact tracked usage while preserving a neighboring repository", async () => {
    const f = await fixture()
    const id = await f.create("remove")
    const neighbor = await f.create("remove-other")
    for (const [repository, value] of [
      [id, "abc"],
      [neighbor, "keep"],
    ]) {
      const uploaded = await f.request(
        "/" + repository + "/raw-if-not-exists/objects/pack/data",
        { method: "PUT", body: value }
      )
      expect(uploaded.status).toBe(204)
      await uploaded.text()
    }
    // More than one R2 cleanup page, including unpublished encrypted-staging bytes.
    await Promise.all(
      Array.from({ length: 260 }, (_, index) =>
        env.GRAFT_OBJECTS.put(
          "repositories/" + id + "/encrypted-staging/" + index,
          "x"
        )
      )
    )
    await env.GRAFT_REPOSITORIES.getByName(id).putMetadata(
      "refs/heads/main",
      new TextEncoder().encode("saved version")
    )
    const warmed = await f.request("/" + id + "/raw/objects/pack/data")
    expect(await warmed.text()).toBe("abc")
    expect(
      (await env.GRAFT_USAGE.getByName(f.namespace).summary(1_000)).usedBytes
    ).toBe(7)
    const removed = await account(f.userId, "delete", "remove")
    expect([200, 202]).toContain(removed.status)
    await removed.text()
    // A cached repository lookup must not admit a request after the tombstone.
    expect((await f.request("/" + id + "/raw/objects/pack/data")).status).toBe(
      404
    )
    await completeDeletion(f.directory, f.userId, "remove")
    expect(
      (await env.GRAFT_OBJECTS.list({ prefix: "repositories/" + id + "/" }))
        .objects
    ).toHaveLength(0)
    expect(
      await (await f.request("/" + neighbor + "/raw/objects/pack/data")).text()
    ).toBe("keep")
    expect(
      (await env.GRAFT_USAGE.getByName(f.namespace).summary(1_000)).usedBytes
    ).toBe(4)
    const metadata = await runInDurableObject(
      env.GRAFT_REPOSITORIES.getByName(id),
      async (_instance, state) =>
        state.storage.sql
          .exec(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'"
          )
          .toArray().length
    )
    expect(metadata).toBe(0)
    await evictDurableObject(f.directory)
    expect((await account(f.userId, "delete", "remove")).status).toBe(200)
    const recreated = await f.request("/api/graft/repositories/remove", {
      method: "PUT",
    })
    expect(recreated.status).toBe(410)
  })

  it("drains a real admitted upload before deleting its newly written bytes", async () => {
    const f = await fixture()
    const id = await f.create("inflight")
    let entered!: () => void
    let proceed!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const allowed = new Promise<void>((resolve) => {
      proceed = resolve
    })
    const worker = createGraftRemoteWorker({
      authenticate: async () => f.principal,
      async createBackend() {
        const backend = await openCloudflareRepository(
          { objects: env.GRAFT_OBJECTS, repositories: env.GRAFT_REPOSITORIES },
          id
        )
        const put = backend.putIfAbsent.bind(backend)
        backend.putIfAbsent = async (...args: Parameters<typeof put>) => {
          entered()
          await allowed
          return put(...args)
        }
        return backend
      },
    })
    const upload = worker.request(
      ORIGIN + "/" + id + "/raw-if-not-exists/objects/pack/late",
      { method: "PUT", headers: { "Graft-Protocol": "1" }, body: "late bytes" },
      env
    )
    await started
    await account(f.userId, "delete", "inflight")
    await runDurableObjectAlarm(f.directory)
    expect(await f.directory.listManagedRepositories(f.userId)).toMatchObject([
      { name: "inflight", status: "deleting" },
    ])
    expect((await f.request("/" + id + "/raw/objects/pack/late")).status).toBe(
      404
    )
    proceed()
    const uploaded = await upload
    expect(uploaded.status).toBe(204)
    await uploaded.text()
    await completeDeletion(f.directory, f.userId, "inflight")
    expect(
      (await env.GRAFT_OBJECTS.list({ prefix: "repositories/" + id + "/" }))
        .objects
    ).toHaveLength(0)
  })

  it("survives an abandoned request and directory eviction before cleanup", async () => {
    const f = await fixture()
    const id = await f.create("abandoned")
    await env.GRAFT_OBJECTS.put(
      "repositories/" + id + "/objects/retain",
      "retain until drained"
    )
    expect(
      await f.directory.acquireRequest("abandoned", f.userId, "lost-request")
    ).toBe(true)
    await account(f.userId, "delete", "abandoned")
    await runInDurableObject(f.directory, async (_instance, state) => {
      state.storage.sql.exec("UPDATE repository_requests SET expires_at = 0")
    })
    await runDurableObjectAlarm(f.directory)
    expect(
      await env.GRAFT_OBJECTS.head("repositories/" + id + "/objects/retain")
    ).not.toBeNull()
    await runInDurableObject(f.directory, async (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE repositories SET cleanup_ready_at = 0 WHERE name = 'abandoned'"
      )
    })
    await evictDurableObject(f.directory)
    await completeDeletion(f.directory, f.userId, "abandoned")
    expect(
      (await env.GRAFT_OBJECTS.list({ prefix: "repositories/" + id + "/" }))
        .objects
    ).toHaveLength(0)
  })

  it("aborts an unfinished R2 multipart upload and releases its reservation", async () => {
    const f = await fixture()
    const id = await f.create("multipart")
    const objectPath = "segments/unfinished"
    const started = await f.request(
      "/" + id + "/multipart-start/" + objectPath,
      {
        method: "POST",
        headers: {
          "x-graft-object-bytes": String(17 * 1024 * 1024),
          "content-length": "0",
        },
      }
    )
    expect(started.status).toBe(200)
    const session = await started.json<{ upload_id: string }>()
    await account(f.userId, "delete", "multipart")
    await completeDeletion(f.directory, f.userId, "multipart")
    await expect(
      env.GRAFT_OBJECTS.resumeMultipartUpload(
        "repositories/" + id + "/objects/" + objectPath,
        session.upload_id
      ).uploadPart(1, new Uint8Array([1]))
    ).rejects.toThrow()
    expect(
      (await env.GRAFT_USAGE.getByName(f.namespace).summary(1_000_000_000))
        .reservedBytes
    ).toBe(0)
  })

  it("retries deletion after a previously aborted multipart upload", async () => {
    const f = await fixture()
    const id = await f.create("already-aborted")
    const key = "repositories/" + id + "/objects/segments/stale"
    const upload = await env.GRAFT_OBJECTS.createMultipartUpload(key)
    await env.GRAFT_REPOSITORIES.getByName(id).createMultipartUpload(
      "segments/stale",
      upload.uploadId,
      10,
      10
    )
    await upload.abort()
    await account(f.userId, "delete", "already-aborted")
    await completeDeletion(f.directory, f.userId, "already-aborted")
  })

  it("cleans encrypted profiles and staging objects without allowing plaintext recreation", async () => {
    const f = await fixture()
    const id = await f.create("encrypted", true)
    await env.GRAFT_OBJECTS.put(
      "repositories/" + id + "/encrypted-staging/part",
      "opaque ciphertext"
    )
    await account(f.userId, "delete", "encrypted")
    await completeDeletion(f.directory, f.userId, "encrypted")
    expect(
      (await env.GRAFT_OBJECTS.list({ prefix: "repositories/" + id + "/" }))
        .objects
    ).toHaveLength(0)
    expect(
      (await f.request("/api/graft/repositories/encrypted", { method: "PUT" }))
        .status
    ).toBe(410)
  })

  it("isolates account owners, validates requests, and exposes no public management endpoint", async () => {
    const f = await fixture()
    const id = await f.create("private")
    expect(await (await account(f.userId, "list")).json()).toMatchObject({
      version: 1,
      repositories: [{ name: "private", status: "active" }],
    })
    expect(await (await account("other-owner", "list")).json()).toMatchObject({
      repositories: [],
    })
    expect((await account("other-owner", "delete", "private")).status).toBe(404)
    expect(
      (
        await f.worker.request(
          ORIGIN + "/v1/repositories/delete",
          {
            method: "POST",
            headers: { "Graft-Protocol": "1" },
            body: JSON.stringify({ userId: f.userId, name: "private" }),
          },
          env
        )
      ).status
    ).toBe(404)
    const invalid = await exports.SyncAccountEntrypoint.fetch(
      new Request("https://internal/v1/repositories/delete", {
        method: "POST",
        body: JSON.stringify({
          userId: f.userId,
          name: "private",
          namespace: f.namespace,
        }),
      })
    )
    expect(invalid.status).toBe(400)
    const tooLarge = await exports.SyncAccountEntrypoint.fetch(
      new Request("https://internal/v1/repositories/delete", {
        method: "POST",
        body: "x".repeat(2_049),
      })
    )
    expect(tooLarge.status).toBe(400)
    expect(await f.directory.findRepository("private", f.userId)).toMatchObject(
      { id }
    )
  })
})
