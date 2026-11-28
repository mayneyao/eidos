import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createGraftRemoteHandler } from "@eidos.space/graft-remote"
import { PeerObjectStore } from "./object-store"

it("hydrates reviewed storage history through incoming without sharing branch refs or writes", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-peer-history-")
  )
  const reviewed = new PeerObjectStore(path.join(directory, "reviewed"))
  const incoming = new PeerObjectStore(
    path.join(directory, "incoming"),
    reviewed
  )
  const bytes = (value: string) => new TextEncoder().encode(value)
  try {
    await reviewed.put("segments/old", bytes("abcdef"))
    await reviewed.put("logs/old/commits/1", bytes("commit"))
    await reviewed.put("objects/pack/shared.idx", bytes("idx"))
    await reviewed.put("objects/ab/".concat("c".repeat(62)), bytes("obj"))
    await reviewed.put("refs/heads/main", bytes("reviewed"))
    const payload = "store/files/aa/" + "a".repeat(62)
    await reviewed.put(payload, bytes("attachment"))
    await reviewed.put("store/files/not-a-hash", bytes("private"))
    expect(incoming.head(payload)?.size).toBe(10)
    expect(incoming.head("objects/pack/shared.idx")?.size).toBe(3)
    expect(incoming.list({ prefix: "objects/", limit: 10 }).paths).toEqual([
      "objects/ab/".concat("c".repeat(62)),
      "objects/pack/shared.idx",
    ])
    expect(incoming.list({ prefix: "refs/", limit: 10 }).paths).toEqual([])
    expect(incoming.list({ prefix: "store/files/", limit: 10 }).paths).toEqual([
      payload,
    ])
    expect(await new Response(incoming.get(payload)!.body).text()).toBe(
      "attachment"
    )
    expect(incoming.get("store/files/not-a-hash")).toBeNull()
    await incoming.put(payload, bytes("incoming"))
    expect(await new Response(reviewed.get(payload)!.body).text()).toBe(
      "attachment"
    )
    incoming.delete(payload)
    expect(incoming.head(payload)?.size).toBe(10)
    expect(incoming.head("segments/old")?.size).toBe(6)
    expect(
      await new Response(
        incoming.get("segments/old", { start: 1, end: 3 })!.body
      ).text()
    ).toBe("bcd")
    expect(
      await new Response(incoming.get("logs/old/commits/1")!.body).text()
    ).toBe("commit")
    expect(incoming.get("refs/heads/main")).toBeNull()
    await incoming.put("segments/old", bytes("new"))
    expect(await new Response(reviewed.get("segments/old")!.body).text()).toBe(
      "abcdef"
    )
    incoming.delete("segments/old")
    expect(reviewed.head("segments/old")?.size).toBe(6)
  } finally {
    incoming.close()
    reviewed.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("persists conditional updates, preserves range reads and discards interrupted uploads", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-peer-store-")
  )
  let store = new PeerObjectStore(directory)
  const bytes = (value: string) => new TextEncoder().encode(value)
  try {
    await store.put("refs/main", bytes("a"))
    const results = await Promise.all([
      store.compareAndSwap("refs/main", bytes("a"), bytes("b")),
      store.compareAndSwap("refs/main", bytes("a"), bytes("c")),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    const interrupted = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(bytes("partial"))
        controller.error(new Error("disconnected"))
      },
    })
    await expect(
      store.putIfAbsent("objects/incomplete", interrupted)
    ).rejects.toThrow("disconnected")
    expect(store.head("objects/incomplete")).toBeNull()
    await store.putIfAbsent("objects/data", bytes("abcdef"))
    const object = store.get("objects/data", { start: 1, end: 3 })!
    expect(await new Response(object.body).text()).toBe("bcd")
    store.close()
    store = new PeerObjectStore(directory)
    expect(store.list({ prefix: "objects/", limit: 1 })).toMatchObject({
      paths: ["objects/data"],
      hasMore: false,
    })
    expect(store.compareAndDelete("refs/main", bytes("a"))).toBe(false)
  } finally {
    store.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("short-circuits duplicate putIfAbsent without reading the stream and deduplicates identical blobs", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-peer-dedup-")
  )
  const store = new PeerObjectStore(directory)
  const bytes = (value: string) => new TextEncoder().encode(value)
  try {
    expect(await store.putIfAbsent("segments/one", bytes("same-payload"))).toBe(
      true
    )
    let readAttempted = false
    const unreadStream = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull() {
          readAttempted = true
          return Promise.reject(new Error("Stream should not be read"))
        },
      },
      { highWaterMark: 0 }
    )
    expect(await store.putIfAbsent("segments/one", unreadStream)).toBe(false)
    expect(readAttempted).toBe(false)
    expect(await store.putIfAbsent("segments/two", bytes("same-payload"))).toBe(
      true
    )
    const blobs = await fs.readdir(path.join(directory, "blobs"))
    expect(blobs).toHaveLength(1)
  } finally {
    store.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("reads only private text refs via readText without leaking reviewed refs", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-peer-read-text-")
  )
  const reviewed = new PeerObjectStore(path.join(directory, "reviewed"))
  const incoming = new PeerObjectStore(
    path.join(directory, "incoming"),
    reviewed
  )
  const bytes = (value: string) => new TextEncoder().encode(value)
  try {
    const commitId = "a".repeat(64)
    await reviewed.put("refs/heads/main", bytes(`${commitId}\n`))
    expect(reviewed.readText("refs/heads/main")?.trim()).toBe(commitId)
    expect(incoming.readText("refs/heads/main")).toBeNull()
  } finally {
    incoming.close()
    reviewed.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("lists shared reviewed storage objects under root and parent prefixes across small pages without leaking refs", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-peer-list-root-")
  )
  const reviewed = new PeerObjectStore(path.join(directory, "reviewed"))
  const incoming = new PeerObjectStore(
    path.join(directory, "incoming"),
    reviewed
  )
  const bytes = (value: string) => new TextEncoder().encode(value)
  const attachmentPath = `store/files/bb/${"b".repeat(62)}`
  const objPath = `objects/cd/${"d".repeat(62)}`
  try {
    await reviewed.put("HEAD", bytes("ref: refs/heads/main\n"))
    await reviewed.put("refs/heads/main", bytes("a".repeat(64) + "\n"))
    await reviewed.put("logs/shared/commits/0001", bytes("reviewed-commit"))
    await reviewed.put(objPath, bytes("reviewed-obj"))
    await reviewed.put("segments/shared", bytes("reviewed-seg"))
    await reviewed.put(attachmentPath, bytes("reviewed-attachment"))
    await reviewed.put("store/files/not-a-hash", bytes("private-ignored"))

    await incoming.put("refs/heads/main", bytes("c".repeat(64) + "\n"))
    await incoming.put("logs/local/commits/0001", bytes("local-commit"))
    await incoming.put("segments/shared", bytes("local-override-seg"))

    const expectedRootPaths = [
      "logs/local/commits/0001",
      "logs/shared/commits/0001",
      objPath,
      "refs/heads/main",
      "segments/shared",
      attachmentPath,
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    expect(incoming.list({ prefix: "", limit: 100 }).paths).toEqual(
      expectedRootPaths
    )
    expect(incoming.list({ prefix: "store/", limit: 100 }).paths).toEqual([
      attachmentPath,
    ])

    // Verify small page size (limit=1, limit=2) returns every item once without duplicates or omissions.
    for (const limit of [1, 2]) {
      const collected: string[] = []
      let after: string | undefined
      for (;;) {
        const page = incoming.list({ prefix: "", after, limit })
        expect(page.paths.length).toBeLessThanOrEqual(limit)
        collected.push(...page.paths)
        if (!page.hasMore) break
        expect(page.paths.length).toBeGreaterThan(0)
        after = page.paths[page.paths.length - 1]
      }
      expect(collected).toEqual(expectedRootPaths)
    }

    // Verify Graft Remote upload-bundle endpoint receives the shared attachment from root enumeration.
    const handler = createGraftRemoteHandler<{ backend: PeerObjectStore }>({
      backend: ({ adapterContext }) => adapterContext.backend,
    })
    const bundleRes = await handler({
      request: new Request(
        "https://peer.invalid/peer/incoming/upload-bundle/refs/heads/main",
        {
          method: "POST",
          headers: { "Graft-Protocol": "1" },
        }
      ),
      route: {
        namespace: "peer",
        repository: "incoming",
        operation: "upload-bundle",
        objectPath: "refs/heads/main",
      },
      adapterContext: { backend: incoming },
    })
    expect(bundleRes.status).toBe(200)
    const bundleText = await bundleRes.text()
    expect(bundleText).toContain(attachmentPath)
    expect(bundleText).toContain("reviewed-attachment")
    expect(bundleText).toContain("local-override-seg")
    expect(bundleText).not.toContain("reviewed-seg")
    expect(bundleText).not.toContain("private-ignored")
  } finally {
    incoming.close()
    reviewed.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
