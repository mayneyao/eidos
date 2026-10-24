import { afterEach, expect, it, vi } from "vitest"
import https from "node:https"
import { PassThrough } from "node:stream"
import { EventEmitter } from "node:events"
import type { ClientRequest, IncomingMessage } from "node:http"
import { PluginFetch, publicIPv4, publicAddress } from "./plugin-fetch"
import { lookup } from "node:dns/promises"

afterEach(() => vi.restoreAllMocks())
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "1.1.1.1", family: 4 }]),
}))

function transport(
  responses: Array<{
    status: number
    headers?: Record<string, string>
    text?: string
  }>
) {
  const opened: {
    url: string
    options: https.RequestOptions
    body: unknown
    response: IncomingMessage
  }[] = []
  vi.spyOn(https, "request").mockImplementation(((
    url: URL,
    options: https.RequestOptions,
    callback: (response: IncomingMessage) => void
  ) => {
    const fixture = responses.shift()!
    const response = Object.assign(new PassThrough(), {
      statusCode: fixture.status,
      statusMessage: "OK",
      headers: fixture.headers ?? {},
    }) as unknown as IncomingMessage
    const request = new EventEmitter() as ClientRequest
    request.end = ((body: unknown) => {
      opened.push({ url: url.href, options, body, response })
      queueMicrotask(() => callback(response))
      // IncomingMessage is readable; the test transport supplies bytes through PassThrough.
      if (fixture.text !== undefined)
        queueMicrotask(() =>
          (response as unknown as PassThrough).end(fixture.text)
        )
      return request
    }) as ClientRequest["end"]
    options.signal?.addEventListener(
      "abort",
      () => {
        response.destroy(new Error("aborted"))
        request.emit("error", new Error("aborted"))
      },
      { once: true }
    )
    return request
  }) as typeof https.request)
  return opened
}

it("allows public redirects with a broad grant but still rejects private and insecure destinations", async () => {
  const opened = transport([
    { status: 302, headers: { location: "https://second.example/" } },
    { status: 204 },
  ])
  const host = new PluginFetch(),
    scope = new AbortController()
  const request = {
    id: "broad",
    url: "https://first.example/",
    method: "GET",
    headers: [],
    body: null,
    redirect: "follow",
  }
  await host.request("network.fetch", request, ["*"], scope.signal)
  expect(opened.map((entry) => entry.url)).toEqual([
    "https://first.example/",
    "https://second.example/",
  ])
  await expect(
    host.request(
      "network.fetch",
      { ...request, id: "http", url: "http://first.example/" },
      ["*"],
      scope.signal
    )
  ).rejects.toThrow()
  vi.mocked(lookup).mockResolvedValueOnce([
    { address: "127.0.0.1", family: 4 },
  ] as never)
  await expect(
    host.request(
      "network.fetch",
      { ...request, id: "private" },
      ["*"],
      scope.signal
    )
  ).rejects.toThrow()
  expect(opened).toHaveLength(2)
  scope.abort()
})

it("returns headers without buffering and releases the stream with its scope", async () => {
  const opened = transport([{ status: 200 }])
  const host = new PluginFetch(),
    scope = new AbortController()
  const request = {
    id: "stream",
    url: "https://allowed.example/",
    method: "GET",
    headers: [["Cookie", "secret"]],
    body: null,
    redirect: "follow",
  }
  await expect(
    host.request(
      "network.fetch",
      request,
      ["https://allowed.example"],
      scope.signal
    )
  ).resolves.toMatchObject({ status: 200, body: true })
  expect(opened[0]!.options.headers).not.toHaveProperty("cookie")
  const next = host.request(
    "network.fetch.read",
    { id: "stream" },
    [],
    scope.signal
  )
  ;(opened[0]!.response as unknown as PassThrough).write("first")
  await expect(next).resolves.toEqual({
    body: Buffer.from("first").toString("base64"),
  })
  scope.abort()
  expect(opened[0]!.response.destroyed).toBe(true)
})

it("checks redirect grants before the second connection", async () => {
  const opened = transport([
    { status: 302, headers: { location: "https://other.example/" } },
  ])
  await expect(
    new PluginFetch().request(
      "network.fetch",
      {
        id: "redirect",
        url: "https://allowed.example/",
        method: "GET",
        headers: [],
        body: null,
        redirect: "follow",
      },
      ["https://allowed.example"],
      new AbortController().signal
    )
  ).rejects.toThrow("origin")
  expect(opened).toHaveLength(1)
  expect(opened[0]!.response.destroyed).toBe(true)
})

it("strips authorization across an allowed redirect and hides response cookies", async () => {
  const opened = transport([
    { status: 302, headers: { location: "https://other.example/" } },
    { status: 204, headers: { "set-cookie": "private=value" } },
  ])
  const result = await new PluginFetch().request(
    "network.fetch",
    {
      id: "redirect",
      url: "https://allowed.example/",
      method: "POST",
      headers: [
        ["Authorization", "secret"],
        ["Content-Type", "text/plain"],
      ],
      body: "eA==",
      redirect: "follow",
    },
    ["https://allowed.example", "https://other.example"],
    new AbortController().signal
  )
  expect(result).toMatchObject({
    status: 204,
    headers: [],
    body: false,
    redirected: true,
  })
  expect(opened[1]!.options.method).toBe("GET")
  expect(opened[1]!.options.headers).not.toHaveProperty("authorization")
  expect(opened[1]!.body).toBeNull()
})

it("rejects ungranted origins and prohibited methods without opening a connection", async () => {
  const host = new PluginFetch()
  const signal = new AbortController().signal
  const p = {
    id: "test",
    url: "https://forbidden.example",
    method: "GET",
    headers: [],
    body: null,
    redirect: "follow",
  }
  await expect(host.request("network.fetch", p, [], signal)).rejects.toThrow(
    "origin"
  )
  await expect(
    host.request(
      "network.fetch",
      { ...p, method: "TRACE" },
      ["https://forbidden.example"],
      signal
    )
  ).rejects.toThrow("Invalid")
  await expect(
    host.request("network.fetch.read", { id: "test" }, [], signal)
  ).rejects.toThrow("closed")
})

it("uses a fail-closed public-address policy for host fetch", () => {
  for (const value of [
    "127.0.0.1",
    "198.18.0.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "10.0.0.1",
    "169.254.169.254",
  ])
    expect(publicIPv4(value)).toBe(false)
  expect(publicIPv4("1.1.1.1")).toBe(true)
  for (const value of [
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
    "2002::1",
    "3fff::1",
    "invalid",
  ])
    expect(publicAddress(value)).toBe(false)
  expect(publicAddress("2606:4700:4700::1111")).toBe(true)
})

it("does not let another caller read or cancel an owned request", async () => {
  const host = new PluginFetch()
  const other = new AbortController().signal
  await expect(
    host.request("network.fetch.read", { id: "guess" }, [], other)
  ).rejects.toThrow("closed")
  await expect(
    host.request("network.fetch.cancel", { id: "guess" }, [], other)
  ).resolves.toBeNull()
  await expect(
    host.request("network.fetch", {}, [], AbortSignal.abort())
  ).rejects.toThrow()
})
