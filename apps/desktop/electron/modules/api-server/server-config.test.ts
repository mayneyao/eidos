// @vitest-environment node

import { API_SERVER_HOST, createApiServerListenOptions } from "./server-config"

describe("desktop API server binding", () => {
  it("listens only on the IPv4 loopback interface", () => {
    const fetch = vi.fn()

    expect(createApiServerListenOptions(13_127, fetch)).toEqual({
      port: 13_127,
      hostname: "127.0.0.1",
      fetch,
    })
    expect(API_SERVER_HOST).toBe("127.0.0.1")
  })
})
