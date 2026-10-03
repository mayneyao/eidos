import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { PeerObjectStore } from "./object-store"

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
