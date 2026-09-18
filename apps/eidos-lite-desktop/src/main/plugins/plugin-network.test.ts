import { expect, it } from "vitest"
import { allowedIPv4, readPluginNetwork } from "./plugin-network"
it("blocks local networks while supporting public DNS and system TUN proxies", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "192.168.1.1",
    "172.31.1.1",
    "100.64.0.1",
    "224.0.0.1",
    "0.0.0.0",
    "::1",
  ])
    expect(allowedIPv4(ip)).toBe(false)
  for (const ip of ["1.1.1.1", "198.18.0.97"])
    expect(allowedIPv4(ip)).toBe(true)
})
it("rejects undeclared origins, credentials and excessive ranges before connecting", async () => {
  const signal = new AbortController().signal
  for (const url of [
    "https://unknown.example/data",
    "http://allowed.example/data",
    "https://user:pass@allowed.example/data",
  ])
    await expect(
      readPluginNetwork({ url }, ["https://allowed.example"], signal)
    ).rejects.toThrow("origin")
  await expect(
    readPluginNetwork(
      {
        url: "https://allowed.example/data",
        range: { offset: 0, length: 5 * 1024 * 1024 },
      },
      ["https://allowed.example"],
      signal
    )
  ).rejects.toThrow("range")
  await expect(
    readPluginNetwork(
      { url: "https://allowed.example/data" },
      ["https://allowed.example"],
      AbortSignal.abort()
    )
  ).rejects.toThrow()
})
