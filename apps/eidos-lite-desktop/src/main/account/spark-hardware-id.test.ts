import { resolveSparkHardwareId } from "./spark-hardware-id"

it("hashes the macOS platform UUID", async () => {
  const run = vi.fn(async () => ({
    stdout: '  "IOPlatformUUID" = "A1B2C3D4-0000-1111-2222-333344445555"',
    stderr: "",
  })) as never
  const value = await resolveSparkHardwareId(
    async () => "fallback",
    "darwin",
    run,
    (async () => "") as never
  )
  expect(value).toMatch(/^[0-9a-f]{64}$/)
  expect(value).not.toContain("A1B2C3D4")
})

it("hashes the Windows MachineGuid", async () => {
  const run = vi.fn(async () => ({
    stdout: "    MachineGuid    REG_SZ    a1b2c3d4-0000-1111-2222-333344445555",
    stderr: "",
  })) as never
  const value = await resolveSparkHardwareId(
    async () => "fallback",
    "win32",
    run,
    (async () => "") as never
  )
  expect(value).toMatch(/^[0-9a-f]{64}$/)
})

it("reads a Linux machine-id and falls back when unavailable", async () => {
  const read = vi.fn(async (file: string) => {
    if (file === "/etc/machine-id") return "linux-machine\n"
    throw new Error("missing")
  }) as never
  expect(
    await resolveSparkHardwareId(
      async () => "fallback",
      "linux",
      (async () => ({ stdout: "", stderr: "" })) as never,
      read
    )
  ).toMatch(/^[0-9a-f]{64}$/)
  expect(
    await resolveSparkHardwareId(
      async () => "fallback",
      "linux",
      (async () => ({ stdout: "", stderr: "" })) as never,
      (async () => {
        throw new Error("missing")
      }) as never
    )
  ).toBe("fallback")
})
