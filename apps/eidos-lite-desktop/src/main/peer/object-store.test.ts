import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
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
    await reviewed.put("refs/heads/main", bytes("reviewed"))
    const payload = "store/files/aa/" + "a".repeat(62)
    await reviewed.put(payload, bytes("attachment"))
    await reviewed.put("store/files/not-a-hash", bytes("private"))
    expect(incoming.head(payload)?.size).toBe(10)
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
