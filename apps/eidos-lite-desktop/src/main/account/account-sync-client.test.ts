import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"
import { AccountSyncClient } from "./account-sync-client"

const staging = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging
const registration = {
  stableDeviceId: "0f9a8b7c-6d5e-4f32-a109-876543210abc",
  displayName: "Eidos Lite on macOS",
  platform: "macos" as const,
  appVersion: "0.1.0",
}

describe("AccountSyncClient", () => {
  it("registers a device and reads only the narrow Sync access grant", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.endsWith("/devices/register")) {
        return Response.json({
          device: {
            id: "device-1",
            displayName: registration.displayName,
            platform: "macos",
            appVersion: "0.1.0",
            status: "active",
            version: 1,
          },
        })
      }
      return Response.json({
        sub: "user-1",
        sync_access: {
          version: 1,
          revision: 7,
          service: "eidos_sync",
          access: "read_write",
          quotaBytes: 10_737_418_240,
          deviceLimit: 0,
        },
      })
    }) as unknown as typeof fetch
    const client = new AccountSyncClient(staging, fetchImpl)

    await expect(
      client.registerDevice("access-secret", registration)
    ).resolves.toMatchObject({ id: "device-1", status: "active" })
    await expect(client.authorization("access-secret")).resolves.toEqual({
      subject: "user-1",
      availability: { state: "available", joined: false },
      access: {
        version: 1,
        revision: 7,
        service: "eidos_sync",
        access: "read_write",
        quotaBytes: 10_737_418_240,
        deviceLimit: 0,
      },
    })
    expect(
      requests.every(({ url }) => url.startsWith(staging.accountOrigin))
    ).toBe(true)
    expect(requests.some(({ url }) => url.includes("access-secret"))).toBe(
      false
    )
    expect(requests[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer access-secret",
    })
  })

  it("represents a missing entitlement without granting access", async () => {
    const client = new AccountSyncClient(
      staging,
      vi.fn(async () => Response.json({ sub: "user-1" }))
    )
    await expect(client.authorization("token")).resolves.toEqual({
      subject: "user-1",
      availability: { state: "available", joined: false },
      access: null,
    })
  })

  it("reads and joins the staging Sync waitlist", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL, init?: RequestInit) =>
      Response.json({
        sub: "user-1",
        sync_enrollment: {
          state: "waitlist",
          joined: init?.method === "POST",
        },
      })
    ) as unknown as typeof fetch
    const client = new AccountSyncClient(staging, fetchImpl)

    await expect(client.authorization("token")).resolves.toEqual({
      subject: "user-1",
      availability: { state: "waitlist", joined: false },
      access: null,
    })
    await expect(client.joinWaitlist("token")).resolves.toEqual({
      subject: "user-1",
      availability: { state: "waitlist", joined: true },
    })
  })

  it("rejects malformed grants and maps device authorization failures", async () => {
    const malformed = new AccountSyncClient(
      staging,
      vi.fn(async () =>
        Response.json({
          sub: "user-1",
          sync_access: {
            version: 1,
            revision: 1,
            service: "eidos_sync",
            access: "read_write",
            quotaBytes: -1,
            deviceLimit: 0,
          },
        })
      )
    )
    await expect(malformed.authorization("token")).rejects.toMatchObject({
      code: "invalid-response",
    })

    const unauthorized = new AccountSyncClient(
      staging,
      vi.fn(async () => Response.json({}, { status: 401 }))
    )
    await expect(
      unauthorized.registerDevice("expired", registration)
    ).rejects.toMatchObject({
      code: "authentication-required",
      status: 401,
    })
  })
})
