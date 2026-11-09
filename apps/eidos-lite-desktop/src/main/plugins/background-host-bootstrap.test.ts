import { runInNewContext } from "node:vm"
import { expect, it, vi } from "vitest"
import { backgroundHostBootstrap } from "./background-host-bootstrap"
import type { BackgroundHost } from "@eidos.space/plugin-sdk"

it("awaits versioned binary decoding and preserves opaque CAS versions", async () => {
  const sent: Record<string, unknown>[] = []
  const context = {
    postMessage: (value: Record<string, unknown>) => sent.push(value),
    setTimeout,
    clearTimeout,
    Uint8Array,
    console,
    ctx: undefined as BackgroundHost | undefined,
    onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
  }
  runInNewContext(
    backgroundHostBootstrap("token", "space", "run", false, true, true),
    context
  )
  for (const data of [null, "", "AP8B"]) {
    const reading = context.ctx!.storage!.readVersioned!("index")
    context.onmessage!({
      data: {
        __eidosHost: "token",
        id: sent.at(-1)!.id,
        value: { data, version: data === null ? null : "opaque-token" },
      },
    })
    const result = await reading
    expect(result.version).toBe(data === null ? null : "opaque-token")
    if (data === null) expect(result.data).toBeNull()
    else {
      expect(result.data).toBeInstanceOf(Uint8Array)
      expect(result.data).toEqual(Uint8Array.from(Buffer.from(data, "base64")))
    }
  }
  const writing = context.ctx!.storage!.compareAndWrite!(
    "index",
    "opaque-token",
    new Uint8Array([0, 255, 1])
  )
  await vi.waitFor(() =>
    expect(sent.at(-1)!.method).toBe("storage.compareAndWrite")
  )
  const request = sent.at(-1)!
  expect(JSON.parse(request.chunk as string)).toEqual({
    key: "index",
    expectedVersion: "opaque-token",
    data: "AP8B",
  })
  context.onmessage!({
    data: {
      __eidosHost: "token",
      id: request.id,
      value: { applied: false, version: "new-token" },
    },
  })
  expect(await writing).toEqual({ applied: false, version: "new-token" })
})

it("routes private frames separately, disposes observers and roundtrips binary storage", async () => {
  const sent: Record<string, unknown>[] = []
  const context = {
    postMessage: (value: Record<string, unknown>) => sent.push(value),
    setTimeout,
    clearTimeout,
    Uint8Array,
    console,
    ctx: undefined as BackgroundHost | undefined,
    onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
  }
  runInNewContext(
    backgroundHostBootstrap("secret", "space", "run", true, true),
    context
  )
  const application: unknown[] = []
  context.onmessage = (event) => application.push(event.data)
  const events: unknown[] = []
  const subscription = context.ctx!.events.on("file.opened", (event) =>
    events.push(event)
  )
  context.onmessage!({
    data: {
      __eidosHost: "secret",
      event: "file.opened",
      value: { path: "a.md" },
    },
  })
  expect(events).toEqual([{ path: "a.md" }])
  expect(application).toEqual([])
  subscription.dispose()
  context.onmessage!({
    data: {
      __eidosHost: "secret",
      event: "file.opened",
      value: { path: "b.md" },
    },
  })
  expect(events).toHaveLength(1)
  context.onmessage!({ data: { command: "status" } })
  expect(application).toEqual([{ command: "status" }])
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array([0]),
    new Uint8Array([0, 255]),
    new Uint8Array([0, 255, 128, 42]),
  ]) {
    const writing = context.ctx!.storage!.write("key", bytes)
    await Promise.resolve()
    const request = sent.at(-1)!
    expect((JSON.parse(request.chunk as string) as { data: string }).data).toBe(
      Buffer.from(bytes).toString("base64")
    )
    context.onmessage!({
      data: { __eidosHost: "secret", id: request.id, value: null },
    })
    await writing
    const reading = context.ctx!.storage!.read("key")
    context.onmessage!({
      data: {
        __eidosHost: "secret",
        id: sent.at(-1)!.id,
        value: Buffer.from(bytes).toString("base64"),
      },
    })
    expect(await reading).toEqual(bytes)
  }
})

it("does not expose undeclared capabilities", () => {
  const context = {
    postMessage() {},
    setTimeout,
    clearTimeout,
    ctx: undefined as BackgroundHost | undefined,
  }
  runInNewContext(
    backgroundHostBootstrap("secret", "space", "run", false, false),
    context
  )
  expect(context.ctx).toMatchObject({ spaceId: "space", instanceId: "run" })
  expect(() => context.ctx!.events.on("file.opened", () => {})).toThrow(
    "permission"
  )
  expect(Object.hasOwn(context.ctx!, "files")).toBe(false)
  expect(Object.hasOwn(context, "eidos")).toBe(false)
  expect(Object.getOwnPropertyDescriptor(context, "ctx")).toMatchObject({
    writable: false,
    configurable: false,
  })
})

it("isolates listener failures, preserves order and disposes subscriptions independently", () => {
  const errors = vi.fn()
  const context = {
    postMessage() {},
    setTimeout,
    clearTimeout,
    console: { error: errors },
    ctx: undefined as BackgroundHost | undefined,
    onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
  }
  runInNewContext(
    backgroundHostBootstrap("secret", "space", "run", true, false),
    context
  )
  const events = context.ctx!.events
  expect(() => events.on("unknown" as "file.opened", () => {})).toThrow(
    "Unknown"
  )
  expect(() => events.on("file.opened", null as never)).toThrow("listener")
  events.on("file.opened", () => {
    throw new Error("broken listener")
  })
  const received: number[] = []
  const listener = (event: { timestamp: number }) =>
    received.push(event.timestamp)
  const first = events.on("file.opened", listener)
  const second = events.on("file.opened", listener)
  first.dispose()
  first.dispose()
  for (const timestamp of [1, 2])
    context.onmessage!({
      data: {
        __eidosHost: "secret",
        event: "file.opened",
        value: { id: String(timestamp), path: "a.md", timestamp },
      },
    })
  expect(received).toEqual([1, 2])
  expect(errors).toHaveBeenCalledTimes(2)
  second.dispose()
  context.onmessage!({
    data: {
      __eidosHost: "secret",
      event: "file.opened",
      value: { timestamp: 3 },
    },
  })
  expect(received).toEqual([1, 2])
})
