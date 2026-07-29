import { OAuthLoopbackCallback } from "./loopback-callback"

describe("OAuthLoopbackCallback", () => {
  it("accepts one matching state and authorization code", async () => {
    const callback = await OAuthLoopbackCallback.listen("expected-state", 0)
    const wrong = await fetch(
      `${callback.redirectUri}?state=wrong&code=untrusted`
    )
    expect(wrong.status).toBe(400)
    const accepted = await fetch(
      `${callback.redirectUri}?state=expected-state&code=trusted-code`
    )
    expect(accepted.status).toBe(200)
    await expect(callback.waitForCode()).resolves.toBe("trusted-code")
  })
})
