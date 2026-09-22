import { afterEach, expect, it, vi } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import https from "node:https"
import { EventEmitter } from "node:events"
import {
  PluginConnections,
  connectionHttpError,
  connectionClientHeaders,
} from "./plugin-connections"

vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) => ({
    address: host === "127.0.0.1" ? "127.0.0.1" : "1.1.1.1",
    family: 4,
  }),
}))

const temporary: string[] = []
it("identifies Eidos and supplies a stable, scoped session only to OpenCode Go", () => {
  const url = new URL("https://opencode.ai/zen/go/v1/chat/completions")
  const first = connectionClientHeaders(
    url,
    ["space", "plugin"],
    "private-ticket"
  )
  expect(first["User-Agent"]).toContain("EidosLite")
  expect(first["x-opencode-session"]).toMatch(/^[a-f0-9]{64}$/)
  expect(first).toEqual(
    connectionClientHeaders(url, ["space", "plugin"], "private-ticket")
  )
  expect(first).not.toEqual(
    connectionClientHeaders(url, ["space", "plugin"], "another-ticket")
  )
  expect(
    connectionClientHeaders(
      new URL("https://other.example/zen/go/v1"),
      [],
      "private-ticket"
    )["x-opencode-session"]
  ).toBeUndefined()
})
it("preserves useful provider errors without exposing credentials or HTML", () => {
  expect(
    connectionHttpError(
      400,
      JSON.stringify({
        error: { message: "response_format json_object is not supported" },
      }),
      "test-key"
    ).message
  ).toContain("response_format json_object is not supported")
  expect(
    connectionHttpError(
      401,
      JSON.stringify({
        error: {
          message: "Invalid test-key, Authorization: Bearer another-secret",
        },
      }),
      "test-key"
    ).message
  ).not.toMatch(/test-key|another-secret/)
  expect(
    connectionHttpError(500, "<html>private gateway page</html>", "key").message
  ).toBe("Connection HTTP 500")
  expect(
    connectionHttpError(
      400,
      JSON.stringify({ message: "x".repeat(3000) }),
      "key"
    ).message.length
  ).toBeLessThan(1100)
})
it("configurable endpoints keep secrets encrypted and require a new key when changing destinations", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-generation-test-"))
  temporary.push(dir)
  const connections = new PluginConnections(dir, {
    available: () => true,
    encrypt: (text) => Buffer.from(text).reverse(),
    decrypt: (bytes) => Buffer.from(bytes).reverse().toString(),
  })
  const scope = ["space", "plugin", "generator", "default-url"]
  await connections.configure(scope, {
    url: "https://example.com/v1/chat/completions",
    model: "model-a",
    key: "secret",
  })
  expect(await connections.configuration(scope)).toEqual({
    configured: true,
    url: "https://example.com/v1/chat/completions",
    model: "model-a",
  })
  expect(JSON.stringify(await connections.configuration(scope))).not.toContain(
    "secret"
  )
  await connections.configure(scope, {
    url: "https://example.com/v1/chat/completions",
    model: "model-b",
    key: "",
  })
  expect((await connections.configuration(scope)).model).toBe("model-b")
  await expect(
    connections.configure(scope, {
      url: "https://other.example/v1",
      model: "m",
      key: "",
    })
  ).rejects.toThrow(/new endpoint/)
  await expect(
    connections.configure(scope, {
      url: "http://example.com",
      model: "m",
      key: "secret",
    })
  ).rejects.toThrow(/HTTPS/)
  expect((await connections.configuration(scope)).url).toBe(
    "https://example.com/v1/chat/completions"
  )
  await connections.configure(scope, null)
  expect((await connections.configuration(scope)).configured).toBe(false)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporary
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true }))
  )
})

it("sends generation to the configured endpoint with host-owned model and Bearer key", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-generation-request-")
  )
  temporary.push(dir)
  const connections = new PluginConnections(dir, {
    available: () => true,
    encrypt: (v) => Buffer.from(v),
    decrypt: (v) => v.toString(),
  })
  const scope = ["space", "plugin", "generator", "default"]
  await connections.configure(scope, {
    url: "https://provider.example/v1/chat/completions",
    model: "configured-model",
    key: "test-only-key",
  })
  const request = new EventEmitter() as EventEmitter & {
    end(body: string): void
    destroy(error?: Error): void
  }
  let sent = ""
  request.destroy = (error) => {
    if (error) request.emit("error", error)
    request.emit("close")
  }
  request.end = (body) => {
    sent = body
  }
  const transport = vi.spyOn(https, "request").mockImplementation(((
    url: URL,
    options: https.RequestOptions,
    callback: (response: EventEmitter) => void
  ) => {
    expect(url.href).toBe("https://provider.example/v1/chat/completions")
    expect(options.headers).toMatchObject({
      Authorization: "Bearer test-only-key",
    })
    queueMicrotask(() => {
      const response = Object.assign(new EventEmitter(), { statusCode: 200 })
      callback(response)
      response.emit("data", Buffer.from('{"choices":[]}'))
      response.emit("end")
      request.emit("close")
    })
    return request
  }) as typeof https.request)
  expect(
    await connections.request(
      scope,
      "https://ignored.example",
      { model: "guest-model", messages: [] },
      new AbortController().signal,
      true
    )
  ).toEqual({ choices: [] })
  expect(JSON.parse(sent)).toEqual({ model: "configured-model", messages: [] })
  expect(transport).toHaveBeenCalledOnce()
})

it("encrypts credentials, scopes them by Space/plugin/endpoint and deletes only that scope", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-connection-test-"))
  temporary.push(dir)
  const encrypt = vi.fn(() => Buffer.from("ciphertext-only"))
  const connections = new PluginConnections(dir, {
    available: () => true,
    encrypt,
    decrypt: () => "unused",
  })
  const scope = ["space", "plugin", "connection", "https://api.example.com/v1"]
  await connections.save(scope, "test-secret")
  expect(encrypt).toHaveBeenCalledWith("test-secret")
  const files = await fs.readdir(dir)
  expect(files).toHaveLength(1)
  expect(await fs.readFile(path.join(dir, files[0]!), "utf8")).toBe(
    "ciphertext-only"
  )
  expect((await fs.stat(path.join(dir, files[0]!))).mode & 0o777).toBe(0o600)
  expect(await connections.configured(scope)).toBe(true)
  expect(await connections.configured(["other", ...scope.slice(1)])).toBe(false)
  expect(
    await connections.configured([
      ...scope.slice(0, 3),
      "https://other.example/v1",
    ])
  ).toBe(false)
  await connections.save(scope, null)
  expect(await connections.configured(scope)).toBe(false)
})

it("fails closed without OS encryption and rejects unsafe destinations and oversized bodies", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-connection-test-"))
  temporary.push(dir)
  const scope = ["space", "plugin", "connection", "https://api.example.com"]
  const cipher = {
    available: () => false,
    encrypt: () => Buffer.from("encrypted"),
    decrypt: () => "test-secret",
  }
  const connections = new PluginConnections(dir, cipher)
  await expect(connections.save(scope, "test-secret")).rejects.toThrow(
    "Secure credential"
  )
  cipher.available = () => true
  await expect(connections.save(scope, "bad\nheader")).rejects.toThrow(
    "Invalid API key"
  )
  await connections.save(scope, "test-secret")
  const signal = new AbortController().signal
  await expect(
    connections.request(scope, "http://api.example.com", {}, signal)
  ).rejects.toThrow("Invalid connection URL")
  await expect(
    connections.request(scope, "https://127.0.0.1", {}, signal)
  ).rejects.toThrow("Private network")
  await expect(
    connections.request(
      scope,
      "https://api.example.com",
      "x".repeat(1024 * 1024),
      signal
    )
  ).rejects.toThrow("1 MiB")
})
