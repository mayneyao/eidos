import { describe, expect, it } from "vitest"

import {
  isProxySyntheticUrlImageAddress,
  isPublicUrlImageAddress,
} from "./eidos-file-url-images"

describe("Eidos Lite network image policy", () => {
  it("accepts public addresses", () => {
    expect(isPublicUrlImageAddress("8.8.8.8")).toBe(true)
    expect(isPublicUrlImageAddress("2606:4700:4700::1111")).toBe(true)
  })

  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "198.18.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "fc00::1",
    "fe80::1",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicUrlImageAddress(address)).toBe(false)
  })

  it("recognizes only the RFC 2544 range used by synthetic proxy DNS", () => {
    expect(isProxySyntheticUrlImageAddress("198.18.0.1")).toBe(true)
    expect(isProxySyntheticUrlImageAddress("198.19.255.254")).toBe(true)
    expect(isProxySyntheticUrlImageAddress("198.20.0.1")).toBe(false)
    expect(isProxySyntheticUrlImageAddress("192.168.1.1")).toBe(false)
    expect(isProxySyntheticUrlImageAddress("2606:4700:4700::1111")).toBe(false)
  })
})
