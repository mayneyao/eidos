import { describe, expect, it } from "vitest"

import { eidosSyncHelpUrl, requiredEidosLiteExternalUrl } from "./external-url"

describe("Eidos Lite external URL policy", () => {
  it("allows absolute HTTP(S) URLs without rewriting them", () => {
    const uri = "https://example.com/image.png?size=large#preview"
    expect(requiredEidosLiteExternalUrl(uri)).toBe(uri)
    expect(requiredEidosLiteExternalUrl("http://example.com")).toBe(
      "http://example.com"
    )
  })

  it.each([
    "",
    " /relative",
    "/relative",
    "javascript:alert(1)",
    "file:///tmp/private",
    "https://user:secret@example.com/private",
  ])("rejects unsafe or non-external URL %s", (uri) => {
    expect(() => requiredEidosLiteExternalUrl(uri)).toThrow()
  })
})

describe("Eidos Lite Sync help URLs", () => {
  it("opens the account Sync tab for Sync access management", () => {
    expect(eidosSyncHelpUrl("sync-access", "https://eidos.space")).toBe(
      "https://eidos.space/account?tab=sync"
    )
    expect(eidosSyncHelpUrl("sync-access", "https://staging.eidos.space")).toBe(
      "https://staging.eidos.space/account?tab=sync"
    )
  })

  it("keeps the account summary and download destinations", () => {
    expect(eidosSyncHelpUrl("account", "https://eidos.space")).toBe(
      "https://eidos.space"
    )
    expect(eidosSyncHelpUrl("download", "https://eidos.space")).toBe(
      "https://eidos.space/download"
    )
  })
})
