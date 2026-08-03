// @vitest-environment node

import net from "node:net"

import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({ dialog: { showMessageBox: vi.fn() } }))

import { isPortInUse } from "./port-checker"

function listen(
  port: number,
  host: string,
  ipv6Only = false
): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen({ port, host, ipv6Only }, () => resolve(server))
  })
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

async function getFreePort(): Promise<number> {
  const server = await listen(0, "127.0.0.1")
  const port = (server.address() as net.AddressInfo).port
  await close(server)
  return port
}

describe("isPortInUse", () => {
  it("reports a free port as free", async () => {
    const port = await getFreePort()
    expect(await isPortInUse(port)).toBe(false)
  })

  it("reports an occupied port as occupied", async () => {
    const port = await getFreePort()
    const server = await listen(port, "0.0.0.0")
    try {
      expect(await isPortInUse(port)).toBe(true)
    } finally {
      await close(server)
    }
  })

  it("reports an IPv6-only occupied port as occupied", async (ctx) => {
    const port = await getFreePort()
    let server: net.Server
    try {
      server = await listen(port, "::", true)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      // Hosts without IPv6 (some containers) cannot bind :: at all
      if (
        code === "EADDRNOTAVAIL" ||
        code === "EAFNOSUPPORT" ||
        code === "EPROTONOSUPPORT"
      ) {
        ctx.skip(`IPv6 loopback unavailable (${code})`)
      }
      throw err
    }
    try {
      expect(await isPortInUse(port)).toBe(true)
    } finally {
      await close(server)
    }
  })
})
