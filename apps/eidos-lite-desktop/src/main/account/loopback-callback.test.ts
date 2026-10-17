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
    await callback.close()
  })

  it("cancels a pending callback and immediately reuses its port without accepting the previous state", async () => {
    const first = await OAuthLoopbackCallback.listen("first-state", 0)
    const port = Number(new URL(first.redirectUri).port)
    const rejected = expect(first.waitForCode()).rejects.toThrow("cancelled")
    await first.close()
    await rejected
    const second = await OAuthLoopbackCallback.listen("second-state", port)
    try {
      const stale = await fetch(
        `${second.redirectUri}?state=first-state&code=old-code`
      )
      expect(stale.status).toBe(400)
      const accepted = await fetch(
        `${second.redirectUri}?state=second-state&code=new-code`
      )
      expect(accepted.status).toBe(200)
      await expect(second.waitForCode()).resolves.toBe("new-code")
    } finally {
      await second.close()
    }
  })

  it("closes a cancelled callback idempotently without waiting for its timeout", async () => {
    const callback = await OAuthLoopbackCallback.listen("state", 0)
    await Promise.all([callback.close(), callback.close()])
    await expect(callback.waitForCode()).rejects.toThrow("cancelled")
    const replacement = await OAuthLoopbackCallback.listen(
      "replacement",
      Number(new URL(callback.redirectUri).port)
    )
    await replacement.close()
    await expect(replacement.waitForCode()).rejects.toThrow("cancelled")
  })
})
