import { describe, expect, it } from "vitest"

import { BrowserEidosHostServices } from "./browser-host-services"

const context = (requestId = "request") => ({
  requestId,
  deadlineMilliseconds: 30_000,
})

describe("Browser Eidos Host 1.0 facade", () => {
  it("negotiates truthful bounded capabilities", async () => {
    const host = new BrowserEidosHostServices()
    await expect(
      host.negotiate(
        { protocol: "eidos-host", versions: ["1.0"] },
        context("negotiate")
      )
    ).resolves.toMatchObject({
      version: "1.0",
      serviceCapabilities: {
        canOpenSource: true,
        canCreateSource: false,
        canUseAssets: false,
      },
      limits: {
        sourceBytesMax: "268435456",
        candidateBytesMax: "268435456",
      },
    })
  })

  it("enforces context cancellation and disabled service methods", async () => {
    const host = new BrowserEidosHostServices()
    await expect(
      host.negotiate(
        { protocol: "eidos-host", versions: ["1.0"] },
        {
          requestId: "cancelled",
          signal: { aborted: true, onAbort: () => () => undefined },
        }
      )
    ).rejects.toMatchObject({ code: "cancelled", retryable: false })
    await expect(
      host.negotiate(
        { protocol: "eidos-host", versions: ["1.0"] },
        context("\ud800")
      )
    ).rejects.toMatchObject({ code: "invalid-request" })
    await expect(
      host.releaseAsset(
        { sessionId: "session", leaseId: "lease" },
        context("release-disabled-asset")
      )
    ).rejects.toMatchObject({ code: "unsupported" })
  })
})
