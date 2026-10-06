import { describe, it, expect, vi } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import https from "node:https"
import { PeerService, type PeerPairingRequest } from "./peer-service"

describe("pairing authorization lifecycle", () => {
  it("emits once, distinguishes rejection, authenticates cancellation and rejects stale decisions", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-pairing-"))
    const changed = vi.fn<(request: PeerPairingRequest | null) => void>()
    const gateway = new PeerService(null, directory, changed)
    try {
      let status = await gateway.start()
      const identity = JSON.parse(
        await fs.readFile(
          path.join(directory, "peer-sync/device/identity.json"),
          "utf8"
        )
      ) as { cert: string }
      const invitation = () =>
        JSON.parse(
          Buffer.from(
            status.invitation!.slice("eidos-peer:".length),
            "base64url"
          ).toString()
        ) as { url: string; ticket: string }
      const call = (route = "/pair", ticket = invitation().ticket) =>
        new Promise<{ status: number; state?: string; token?: string }>(
          (resolve, reject) => {
            const request = https.request(
              new URL(route, invitation().url),
              {
                method: "POST",
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: {
                  Authorization: `Bearer ${ticket}`,
                  "Content-Type": "application/json",
                },
              },
              (response) => {
                let body = ""
                response.on("data", (chunk) => (body += chunk))
                response.on("end", () =>
                  resolve({ status: response.statusCode!, ...JSON.parse(body) })
                )
              }
            )
            request.on("error", reject)
            request.end(JSON.stringify({ name: "Test Phone" }))
          }
        )
      changed.mockClear()
      expect((await call()).state).toBe("pending")
      const first = changed.mock.calls[0][0]!
      expect(first.name).toBe("Test Phone")
      expect((await call()).state).toBe("pending")
      expect(changed).toHaveBeenCalledTimes(1)
      await gateway.approve(false, first.id)
      expect((await call()).state).toBe("rejected")
      expect(gateway.status().pending).toBeUndefined()
      expect(gateway.status().devices).toHaveLength(0)
      status = await gateway.invite()
      await call()
      await expect(gateway.approve(true, first.id)).rejects.toThrow("expired")
      expect((await call("/pair/cancel", "wrong-ticket")).status).toBe(403)
      expect(gateway.status().pending).toBe("Test Phone")
      expect((await call("/pair/cancel")).state).toBe("cancelled")
      expect(changed.mock.calls.at(-1)?.[0]).toBeNull()
      expect((await call()).status).toBe(403)
      status = await gateway.invite()
      await call()
      const accepted = changed.mock.calls.at(-1)![0]!
      await gateway.approve(true, accepted.id)
      expect(gateway.status().devices).toHaveLength(1)
      // Cleanup arriving after approval cannot revoke a trusted device.
      await call("/pair/cancel")
      expect((await call()).state).toBe("approved")
      status = await gateway.invite()
      await call()
      const expired = changed.mock.calls.at(-1)![0]!
      const clock = vi.spyOn(Date, "now").mockReturnValue(expired.expires + 1)
      try {
        await expect(gateway.approve(true, expired.id)).rejects.toThrow(
          "expired"
        )
        expect((await call()).status).toBe(403)
      } finally {
        clock.mockRestore()
      }
    } finally {
      await gateway.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
