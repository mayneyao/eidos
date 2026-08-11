// @vitest-environment node

import { describe, expect, it } from "vitest"

import { eidosFileUrlIsActivatable } from "./eidos-file-url-activation"

describe("Eidos File URL activation policy", () => {
  it.each([
    "https://example.com/path?q=1#result",
    "http://127.0.0.1:3000/local",
  ])("allows an explicit HTTP(S) link %s", (uri) => {
    expect(eidosFileUrlIsActivatable(uri)).toBe(true)
  })

  it.each([
    "",
    "/relative",
    "www.example.com",
    "javascript:alert(1)",
    "file:///tmp/private",
    "https://user:secret@example.com/private",
    " https://example.com",
  ])("keeps an unsafe or unsupported value inert: %s", (uri) => {
    expect(eidosFileUrlIsActivatable(uri)).toBe(false)
  })
})
