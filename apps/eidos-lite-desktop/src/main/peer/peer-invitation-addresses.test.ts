import { afterEach, expect, it, vi } from "vitest"
import fs from "node:fs/promises"
import os, { type NetworkInterfaceInfo } from "node:os"
import type * as NodeOs from "node:os"
import path from "node:path"
import { PeerService } from "./peer-service"
import { PeerAdvertisement } from "./peer-discovery"

const network = vi.hoisted(() => ({
  interfaces: {} as Record<string, NetworkInterfaceInfo[]>,
}))
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof NodeOs>()),
  networkInterfaces: () => network.interfaces,
}))
afterEach(() => vi.restoreAllMocks())

const entry = (address: string): NetworkInterfaceInfo => ({
  address,
  family: "IPv4",
  internal: false,
  netmask: "255.255.255.0",
  mac: "00:00:00:00:00:00",
  cidr: null,
})
const decode = (code: string) =>
  JSON.parse(
    Buffer.from(code.slice("eidos-peer:".length), "base64url").toString()
  ) as { version: number; url: string; urls: string[]; ticket: string }

it("generates mobile-compatible candidates and refreshes them when a new code is requested", async () => {
  vi.spyOn(PeerAdvertisement.prototype, "start").mockImplementation(() => {})
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "peer-address-test-")
  )
  const service = new PeerService(null, directory)
  try {
    network.interfaces = {
      TUN: [entry("198.18.0.1")],
      "vEthernet (WSL)": [entry("172.28.0.1")],
      "Wi-Fi": [entry("192.168.1.20")],
    }
    const first = decode((await service.start()).invitation!)
    expect(first.version).toBe(1)
    expect(new URL(first.url).hostname).toBe("192.168.1.20")
    expect(first.urls.map((url) => new URL(url).hostname)).toEqual([
      "192.168.1.20",
      "172.28.0.1",
    ])
    network.interfaces = { Ethernet: [entry("10.0.0.20")] }
    const next = decode((await service.invite()).invitation!)
    expect(next.urls).toEqual([`https://10.0.0.20:${new URL(first.url).port}`])
    expect(next.url).toBe(next.urls[0])
    expect(next.ticket).not.toBe(first.ticket)
  } finally {
    await service.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("does not offer an unusable code when only unsupported interfaces exist", async () => {
  network.interfaces = {
    TUN: [entry("198.18.0.1")],
    Ethernet: [entry("169.254.1.1")],
  }
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "peer-no-lan-test-")
  )
  const service = new PeerService(null, directory)
  try {
    await expect(service.start()).rejects.toThrow(
      "Connect this computer to a local network first"
    )
    expect(service.status().running).toBe(false)
  } finally {
    await service.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
