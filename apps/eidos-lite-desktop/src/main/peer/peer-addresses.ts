import type { NetworkInterfaceInfo } from "node:os"
import { isIPv4 } from "node:net"

// Keep invitations compatible with the IPv4 LAN policy of both mobile hosts.
export function isPeerLanAddress(address: string): boolean {
  if (!isIPv4(address)) return false
  const [first, second] = address.split(".").map(Number)
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

export function peerLanAddresses(
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined>
): string[] {
  const candidates = Object.entries(interfaces).flatMap(([name, entries]) =>
    (entries ?? [])
      .filter(
        (entry) =>
          entry.family === "IPv4" &&
          !entry.internal &&
          isPeerLanAddress(entry.address)
      )
      .map((entry) => ({
        address: entry.address,
        virtual:
          /vethernet|virtual|vmware|vbox|docker|bridge|^br[-\d]|^virbr|^veth|^utun|^tun|^tap|tailscale|zerotier|wireguard|^wg\d|vpn|wsl|hyper-v/i.test(
            name
          ),
      }))
  )
  // Interface names are only a preference: a bridge/VPN may be the usable LAN.
  candidates.sort((a, b) => Number(a.virtual) - Number(b.virtual))
  return [...new Set(candidates.map(({ address }) => address))].slice(0, 8)
}
