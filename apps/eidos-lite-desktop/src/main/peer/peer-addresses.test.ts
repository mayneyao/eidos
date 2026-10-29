import { describe, expect, it } from "vitest"
import type { NetworkInterfaceInfo } from "node:os"
import { peerLanAddresses } from "./peer-addresses"

const entry = (address: string): NetworkInterfaceInfo => ({
  address,
  family: "IPv4",
  internal: false,
  netmask: "255.255.255.0",
  mac: "00:00:00:00:00:00",
  cidr: null,
})

describe("mobile-compatible LAN addresses", () => {
  it("ignores unsupported adapters and prefers Wi-Fi over private virtual networks", () => {
    expect(
      peerLanAddresses({
        "Disconnected Ethernet": [entry("169.254.12.34")],
        Tailscale: [entry("100.64.1.2")],
        TUN: [entry("198.18.0.1")],
        "vEthernet (WSL)": [entry("172.28.0.1")],
        "Wi-Fi": [entry("192.168.1.20")],
        Ethernet: [entry("10.0.0.2")],
      })
    ).toEqual(["192.168.1.20", "10.0.0.2", "172.28.0.1"])
  })
  it("rejects public, loopback, IPv6, malformed and out-of-range private addresses", () => {
    expect(
      peerLanAddresses({
        bad: [
          "8.8.8.8",
          "127.0.0.1",
          "172.15.1.1",
          "172.32.1.1",
          "192.169.0.1",
          "192.168.1.999",
          "::1",
        ].map(entry),
      })
    ).toEqual([])
  })
  it("retains a private bridge as a fallback, deduplicates and bounds QR size", () => {
    expect(
      peerLanAddresses({ bridge0: [entry("10.0.0.2"), entry("10.0.0.2")] })
    ).toEqual(["10.0.0.2"])
    expect(
      peerLanAddresses({
        Ethernet: Array.from({ length: 12 }, (_, i) =>
          entry(`10.0.0.${i + 1}`)
        ),
      })
    ).toHaveLength(8)
    expect(
      peerLanAddresses({ loopback: [{ ...entry("10.0.0.1"), internal: true }] })
    ).toEqual([])
  })
})
