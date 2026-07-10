// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { serveFile } from "./serve-file"

describe("serveFile", () => {
  let root: string
  let filePath: string
  let app: Hono

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-serve-file-"))
    filePath = path.join(root, "asset.txt")
    await writeFile(filePath, "0123456789")
    app = new Hono()
    app.get("/asset", (context) => serveFile(filePath, context))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("answers HEAD without reading a response body", async () => {
    const response = await app.request("http://eidos.local/asset", {
      method: "HEAD",
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-length")).toBe("10")
    expect(response.headers.get("accept-ranges")).toBe("bytes")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.text()).toBe("")
  })

  it("streams byte ranges", async () => {
    const response = await app.request("http://eidos.local/asset", {
      headers: { Range: "bytes=2-5" },
    })

    expect(response.status).toBe(206)
    expect(response.headers.get("content-length")).toBe("4")
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10")
    expect(await response.text()).toBe("2345")
  })

  it("rejects unsatisfiable byte ranges", async () => {
    const response = await app.request("http://eidos.local/asset", {
      headers: { Range: "bytes=20-30" },
    })

    expect(response.status).toBe(416)
    expect(response.headers.get("content-range")).toBe("bytes */10")
  })
})
