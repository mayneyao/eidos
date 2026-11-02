import {
  assertSyncEncryptionBinding,
  isSyncEncryptionAccountDomain,
  supportsEncryptedSync,
  customSyncOrigin,
} from "./sync-encryption"

describe("encrypted Sync admission", () => {
  it("binds a custom personal repository to its own canonical origin", () => {
    const remote = "https://my-sync.example/personal/notes"
    expect(customSyncOrigin(remote)).toBe("https://my-sync.example")
    expect(() =>
      assertSyncEncryptionBinding(remote, "https://my-sync.example")
    ).not.toThrow()
    expect(() =>
      assertSyncEncryptionBinding(remote, "https://other.example")
    ).toThrow()
    expect(customSyncOrigin("http://my-sync.example/personal/notes")).toBeNull()
    expect(
      customSyncOrigin("https://secret@my-sync.example/personal/notes")
    ).toBeNull()
    expect(
      customSyncOrigin("https://my-sync.example/personal/notes?token=secret")
    ).toBeNull()
    expect(customSyncOrigin("https://my-sync.example/other/notes")).toBeNull()
  })
  it.each([
    ["https://sync.eidos.space/u-123/space", "https://eidos.space"],
    [
      "https://sync-staging.eidos.space/u-123/space",
      "https://staging.eidos.space",
    ],
  ])("accepts the official environment pair %s", (remote, account) => {
    expect(() => assertSyncEncryptionBinding(remote, account)).not.toThrow()
    expect(isSyncEncryptionAccountDomain(account)).toBe(true)
  })

  it.each([
    ["https://sync.eidos.space/u-123/space", "https://staging.eidos.space"],
    ["https://sync-staging.eidos.space/u-123/space", "https://eidos.space"],
    ["https://sync.eidos.space.evil.test/u-123/space", "https://eidos.space"],
    ["https://user:secret@sync.eidos.space/u-123/space", "https://eidos.space"],
    [
      "https://sync.eidos.space/u-123/space?token=secret",
      "https://eidos.space",
    ],
    ["https://sync.eidos.space/u-123/space#other", "https://eidos.space"],
    ["https://sync.eidos.space/", "https://eidos.space"],
    ["https://sync.eidos.space/u-123/space", "https://eidos.space/"],
  ])("rejects a mismatched or ambiguous binding %s", (remote, account) => {
    expect(() => assertSyncEncryptionBinding(remote, account)).toThrow()
  })

  it("supports only platforms with the native private-file contract", () => {
    expect(supportsEncryptedSync("darwin")).toBe(true)
    expect(supportsEncryptedSync("linux")).toBe(true)
    expect(supportsEncryptedSync("win32")).toBe(true)
    expect(supportsEncryptedSync("unknown")).toBe(false)
  })
})
