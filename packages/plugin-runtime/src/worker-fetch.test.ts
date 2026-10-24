import { readFileSync } from "node:fs"
import { expect, it, vi } from "vitest"
import { createWorkerFetch } from "./worker-fetch"
import { sandboxCsp } from "./browser-bootstrap"

it("runs the same fetch contract as QuickJS", async () => {
  const readers = new Map<string, ReadableStreamDefaultReader<Uint8Array>>()
  const call = async <T>(method: string, raw: unknown): Promise<T> => {
    const p = raw as {
      id: string
      headers: [string, string][]
      body: string | null
    }
    if (method === "network.fetch") {
      const response = new Response(
        p.body === null ? null : Buffer.from(p.body, "base64"),
        { headers: p.headers }
      )
      if (response.body) readers.set(p.id, response.body.getReader())
      return {
        status: 200,
        statusText: "OK",
        headers: p.headers,
        body: !!response.body,
        url: "https://fixture.example/echo",
        redirected: false,
        type: "basic",
      } as T
    }
    if (method === "network.fetch.cancel") {
      await readers.get(p.id)?.cancel()
      readers.delete(p.id)
      return null as T
    }
    const result = await readers.get(p.id)!.read()
    if (result.done) readers.delete(p.id)
    return {
      body: result.done ? null : Buffer.from(result.value).toString("base64"),
    } as T
  }
  const run = new Function(
    "fetch",
    "postMessage",
    "FETCH_URL",
    `return (async()=>{${readFileSync(new URL("../../plugin-sandbox/tests/fetch-contract.js", import.meta.url), "utf8")}})()`
  )
  const messages: unknown[] = []
  await run(
    createWorkerFetch(call, new AbortController().signal),
    (value: unknown) => messages.push(value),
    "https://fixture.example"
  )
  expect(messages).toEqual([
    ["你好", "sample.bin", [0, 255, 42], true, true, true],
    ["a b", "你好"],
    [[1, 2, 3], true],
    "abc",
    "TypeError",
    [[9, 8], true],
    ["stop", true],
  ])
  expect(readers.size).toBe(0)
})

it("returns headers before pulling a body and cancels on caller abort", async () => {
  const controller = new AbortController()
  const call = vi.fn(async (method: string) =>
    method === "network.fetch"
      ? {
          status: 200,
          statusText: "OK",
          headers: [],
          body: true,
          url: "https://fixture.example/",
          redirected: false,
          type: "basic",
        }
      : null
  )
  const fetch = createWorkerFetch(
    call as <T>(method: string, params: unknown) => Promise<T>,
    controller.signal
  )
  const response = await fetch("https://fixture.example")
  expect(call.mock.calls.map(([method]) => method)).toEqual(["network.fetch"])
  controller.abort()
  await expect(response.text()).rejects.toMatchObject({ name: "AbortError" })
  expect(call.mock.calls.map(([method]) => method)).toContain(
    "network.fetch.cancel"
  )
})

it("settles abort even when the host has not returned headers", async () => {
  const controller = new AbortController()
  const call = <T>(method: string): Promise<T> =>
    method === "network.fetch"
      ? new Promise(() => {})
      : Promise.resolve(null as T)
  const fetch = createWorkerFetch(call, controller.signal)
  const pending = fetch("https://fixture.example")
  controller.abort("stop")
  await expect(pending).rejects.toBe("stop")
})

it("blocks direct connections when the host owns fetch", () => {
  expect(
    sandboxCsp({ networkOrigins: ["https://fixture.example"] }, true)
  ).toContain("connect-src eidos-space-media:;")
})
