// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ServerContext } from "../server"
import { setupFileRoutes } from "./files"

const { getSpaceFileFromPathMock } = vi.hoisted(() => ({
  getSpaceFileFromPathMock: vi.fn(),
}))

vi.mock("@/apps/desktop/electron/utils/paths", () => ({
  getSpaceFileFromPath: getSpaceFileFromPathMock,
}))

interface SpaceFixture {
  projectRoot: string
  mountRoot: string
}

const surfaceCases = [
  { path: "/files/secret.txt", bodySuffix: "stored" },
  { path: "/~/secret.txt", bodySuffix: "project" },
  { path: "/@/documents/secret.txt", bodySuffix: "mounted" },
] as const

describe("Space-bound file route authorization", () => {
  let tempRoot: string
  let app: Hono
  let spaces: Map<string, SpaceFixture>

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "eidos-file-auth-"))
    spaces = new Map()

    for (const spaceId of ["space-a", "space-b"]) {
      const projectRoot = path.join(tempRoot, spaceId, "project")
      const mountRoot = path.join(tempRoot, spaceId, "mount")
      await mkdir(projectRoot, { recursive: true })
      await mkdir(mountRoot, { recursive: true })
      await writeFile(
        path.join(projectRoot, "secret.txt"),
        `${spaceId}:project`
      )
      await writeFile(path.join(mountRoot, "secret.txt"), `${spaceId}:mounted`)
      spaces.set(spaceId, { projectRoot, mountRoot })
    }

    getSpaceFileFromPathMock.mockImplementation((spaceId: string) => {
      return new Blob([`${spaceId}:stored`], { type: "text/plain" })
    })

    const ctx = {
      spaceRegistry: {
        getSpace: (spaceId: string) => {
          const fixture = spaces.get(spaceId)
          return fixture
            ? { id: spaceId, mode: "file", path: fixture.projectRoot }
            : undefined
        },
      },
      dataSpaceManager: {
        getOrSetDataSpace: async (spaceId: string) => {
          const fixture = spaces.get(spaceId)
          return fixture
            ? {
                kv: {
                  get: async () => fixture.mountRoot,
                },
              }
            : null
        },
      },
    } as unknown as ServerContext

    app = new Hono()
    setupFileRoutes(app, ctx)
  })

  afterEach(async () => {
    getSpaceFileFromPathMock.mockReset()
    await rm(tempRoot, { recursive: true, force: true })
  })

  for (const surface of surfaceCases) {
    it(`rejects a cross-Space block origin on ${surface.path}`, async () => {
      const response = await app.request(
        `http://space-b.eidos.localhost:13127${surface.path}`,
        {
          headers: {
            Origin: "http://extension.block.space-a.eidos.localhost:13127",
          },
        }
      )

      expect(response.status).toBe(403)
      expect(await response.text()).not.toContain("space-b")
    })

    it(`allows a same-Space sandbox origin on ${surface.path}`, async () => {
      const response = await app.request(
        `http://space-a.eidos.localhost:13127${surface.path}`,
        {
          headers: {
            Origin: "http://sandbox.space-a.eidos.localhost:13127",
          },
        }
      )

      expect(response.status).toBe(200)
      expect(await response.text()).toBe(`space-a:${surface.bodySuffix}`)
    })
  }

  it("rejects a browser-supplied forwarded host for another Space", async () => {
    const response = await app.request("http://127.0.0.1:13127/~/secret.txt", {
      headers: {
        Host: "127.0.0.1:13127",
        Origin: "http://sandbox.space-a.eidos.localhost:13127",
        "X-Forwarded-Host": "space-b.eidos.localhost:13127",
      },
    })

    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain("space-b")
  })

  it("allows same-Space loopback forwarding used by smart clients", async () => {
    const response = await app.request("http://127.0.0.1:13127/~/secret.txt", {
      headers: {
        Host: "127.0.0.1:13127",
        Origin: "http://extension.block.space-a.eidos.localhost:13127",
        "X-Forwarded-Host": "space-a.eidos.localhost:13127",
      },
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("space-a:project")
  })

  it("uses the original Space Host preserved by a smart client proxy", async () => {
    const response = await app.request("http://127.0.0.1:13127/~/secret.txt", {
      headers: {
        Host: "space-a.eidos.localhost:13127",
        "X-Forwarded-Host": "space-a.eidos.localhost:13127",
      },
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("space-a:project")
  })

  it("ignores a forwarded host when the request Host is not loopback", async () => {
    const response = await app.request(
      "http://space-a.eidos.localhost:13127/~/secret.txt",
      {
        headers: {
          Host: "space-a.eidos.localhost:13127",
          Origin: "http://space-a.eidos.localhost:13127",
          "X-Forwarded-Host": "space-b.eidos.localhost:13127",
        },
      }
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("space-a:project")
  })

  it("allows direct renderer navigation without browser source headers", async () => {
    const response = await app.request(
      "http://space-a.eidos.localhost:13127/~/secret.txt"
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("space-a:project")
  })

  it("allows a normal same-Space renderer origin", async () => {
    const response = await app.request(
      "http://space-a.eidos.localhost:13127/~/secret.txt",
      {
        headers: {
          Origin: "http://space-a.eidos.localhost:5173",
        },
      }
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("space-a:project")
  })

  it.each(["https://example.com", "null"])(
    "rejects unknown web origin %s",
    async (origin) => {
      const response = await app.request(
        "http://space-a.eidos.localhost:13127/~/secret.txt",
        { headers: { Origin: origin } }
      )

      expect(response.status).toBe(403)
    }
  )

  it("allows an opaque same-Space sandbox request with a verified Referer", async () => {
    const response = await app.request(
      "http://sandbox.space-a.eidos.localhost:13127/~/secret.txt",
      {
        headers: {
          Origin: "null",
          Referer: "http://sandbox.space-a.eidos.localhost:13127/",
        },
      }
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("space-a:project")
  })

  it("rejects an opaque sandbox request whose Referer belongs to another Space", async () => {
    const response = await app.request(
      "http://sandbox.space-b.eidos.localhost:13127/~/secret.txt",
      {
        headers: {
          Origin: "null",
          Referer: "http://sandbox.space-a.eidos.localhost:13127/",
        },
      }
    )

    expect(response.status).toBe(403)
  })

  it("uses Referer when Electron clears Origin", async () => {
    const response = await app.request(
      "http://space-b.eidos.localhost:13127/~/secret.txt",
      {
        headers: {
          Origin: "",
          Referer: "http://space-a.eidos.localhost:13127/page",
          "Sec-Fetch-Site": "same-site",
        },
      }
    )

    expect(response.status).toBe(403)
  })

  it("allows browser top-level navigation without an Origin", async () => {
    const response = await app.request(
      "http://space-a.eidos.localhost:13127/~/secret.txt",
      { headers: { "Sec-Fetch-Site": "none" } }
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("space-a:project")
  })

  it("allows a same-origin browser subresource without an Origin", async () => {
    const response = await app.request(
      "http://space-a.eidos.localhost:13127/~/secret.txt",
      { headers: { "Sec-Fetch-Site": "same-origin" } }
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("space-a:project")
  })

  it("rejects a cross-site browser request without source headers", async () => {
    const response = await app.request(
      "http://space-a.eidos.localhost:13127/~/secret.txt",
      { headers: { "Sec-Fetch-Site": "cross-site" } }
    )

    expect(response.status).toBe(403)
  })
})
