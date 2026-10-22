import { generateKeyPairSync, sign } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SparkService, verifySparkCertificate } from "./spark-service"

describe("Spark device grants", () => {
  const keys = generateKeyPairSync("ed25519")
  const publicKey = keys.publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64")
  const issuer = "https://staging.eidos.space"
  const hardwareId = "fixture-device"
  const certificate = (changes: Record<string, unknown> = {}) => {
    const payload = {
      version: 1,
      audience: "eidos-lite-spark",
      issuer,
      subject: "buyer",
      hardwareId,
      licenseId: 1,
      features: ["file-metadata"],
      issuedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      ...changes,
    }
    return JSON.stringify({
      payload,
      signature: sign(
        null,
        Buffer.from(JSON.stringify(payload)),
        keys.privateKey
      ).toString("base64"),
    })
  }
  async function fixture() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-spark-"))
    const cachePath = path.join(dir, "certificate.json")
    const account = vi.fn(
      async (): Promise<{ subject: string; token: string } | null> => ({
        subject: "buyer",
        token: "oauth-secret",
      })
    )
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        certificate: certificate(),
        licenses: [
          {
            id: 1,
            status: "active",
            activation_count: 1,
            max_activations: 1,
          },
        ],
      })
    )
    const options = {
      origin: issuer,
      publicKey,
      cachePath,
      hardwareId: async () => hardwareId,
      account,
      fetch: request,
    }
    return {
      dir,
      cachePath,
      account,
      request,
      options,
      service: new SparkService(options),
      close: () => fs.rm(dir, { recursive: true, force: true }),
    }
  }
  it("verifies issuer, device, signature, audience and validity; rejects corrupt grants", () => {
    expect(
      verifySparkCertificate(certificate(), publicKey, issuer, hardwareId)
        ?.features
    ).toEqual(["file-metadata"])
    for (const changes of [
      { audience: "legacy" },
      { issuer: "https://eidos.space" },
      { hardwareId: "other-device" },
      { expiresAt: "2000-01-01T00:00:00Z" },
      { issuedAt: "2099-01-01T00:00:00Z" },
    ]) {
      expect(
        verifySparkCertificate(
          certificate(changes),
          publicKey,
          issuer,
          hardwareId
        )
      ).toBeNull()
    }
    const corrupted = JSON.parse(certificate())
    corrupted.payload.subject = "attacker"
    expect(
      verifySparkCertificate(
        JSON.stringify(corrupted),
        publicKey,
        issuer,
        hardwareId
      )
    ).toBeNull()
    expect(
      verifySparkCertificate(
        certificate({ features: ["file-metadata", "future-feature"] }),
        publicKey,
        issuer,
        hardwareId
      )?.features
    ).toEqual(["file-metadata"])
    expect(
      verifySparkCertificate(
        certificate({ features: ["sync"] }),
        publicKey,
        issuer,
        hardwareId
      )?.features
    ).toEqual([])
  })
  it("activates with main-process credentials and survives restart, offline and sign-out", async () => {
    const f = await fixture()
    try {
      expect((await f.service.activate(1)).state).toBe("active")
      const [, options] = f.request.mock.calls[0]!
      expect(options?.headers).toMatchObject({
        Authorization: "Bearer oauth-secret",
      })
      f.request.mockRejectedValue(new Error("offline"))
      const restarted = new SparkService(f.options)
      expect((await restarted.status(true)).state).toBe("active")
      await expect(restarted.require("file-metadata")).resolves.toBeUndefined()
      f.account.mockResolvedValue(null)
      expect((await restarted.status(true)).state).toBe("active")
      expect((await fs.stat(f.cachePath)).mode & 0o777).toBe(0o600)
    } finally {
      await f.close()
    }
  })
  it("clears a cached grant when the server confirms revocation", async () => {
    const f = await fixture()
    try {
      await f.service.activate(1)
      f.request.mockResolvedValue(
        Response.json({ certificate: null, licenses: [] })
      )
      expect((await f.service.status(true)).state).toBe("inactive")
      await expect(f.service.require("file-metadata")).rejects.toThrow(
        "Activate Spark"
      )
      await expect(fs.readFile(f.cachePath)).rejects.toMatchObject({
        code: "ENOENT",
      })
    } finally {
      await f.close()
    }
  })
  it("keeps licenses available when the certificate belongs to another device", async () => {
    const f = await fixture()
    try {
      f.request.mockResolvedValue(
        Response.json({
          certificate: certificate({ hardwareId: "other-device" }),
          licenses: [
            {
              id: 1,
              status: "active",
              activation_count: 1,
              max_activations: 2,
            },
          ],
        })
      )
      const status = await f.service.status(true)
      expect(status).toMatchObject({
        state: "inactive",
        error: "spark_device_mismatch",
        licenses: [{ id: 1, activation_count: 1, max_activations: 2 }],
      })
    } finally {
      await f.close()
    }
  })
  it("expired, copied and tampered caches cannot enable the feature", async () => {
    const f = await fixture()
    try {
      f.account.mockResolvedValue(null)
      for (const raw of [
        certificate({ expiresAt: "2000-01-01T00:00:00Z" }),
        certificate({ hardwareId: "copied-device" }),
        "{}",
      ]) {
        await fs.writeFile(f.cachePath, raw)
        await expect(f.service.require("file-metadata")).rejects.toThrow(
          "Activate Spark"
        )
      }
    } finally {
      await f.close()
    }
  })
  it("deactivation removes the local lease and rejects another purchasing account", async () => {
    const f = await fixture()
    try {
      await f.service.activate(1)
      f.account.mockResolvedValue({ subject: "other", token: "other-token" })
      await expect(f.service.deactivate()).rejects.toThrow("owner's account")
      expect((await f.service.status()).state).toBe("active")
      f.account.mockResolvedValue({ subject: "buyer", token: "oauth-secret" })
      f.request.mockResolvedValue(Response.json({ ok: true }))
      expect((await f.service.deactivate()).state).toBe("inactive")
      await expect(f.service.require("file-metadata")).rejects.toThrow(
        "Activate Spark"
      )
    } finally {
      await f.close()
    }
  })
  it("account changes during activation cannot cache another account's grant", async () => {
    const f = await fixture()
    try {
      f.account
        .mockResolvedValueOnce({ subject: "buyer", token: "oauth-secret" })
        .mockResolvedValue({ subject: "other", token: "other" })
      await expect(f.service.activate(1)).rejects.toThrow("account changed")
      expect((await f.service.status()).state).toBe("inactive")
    } finally {
      await f.close()
    }
  })
  it("accepts only explicit signed v2 perpetual grants for long offline use", () => {
    const perpetual = certificate({
      version: 2,
      offlinePolicy: "perpetual",
      expiresAt: null,
    })
    expect(
      verifySparkCertificate(
        perpetual,
        publicKey,
        issuer,
        hardwareId,
        Date.now() + 10 * 365 * 86400000
      )?.expiresAt
    ).toBeNull()
    for (const changes of [
      { expiresAt: null },
      { version: 2, expiresAt: null },
      { version: 2, offlinePolicy: "perpetual", expiresAt: "2099-01-01" },
    ]) {
      expect(
        verifySparkCertificate(
          certificate(changes),
          publicKey,
          issuer,
          hardwareId
        )
      ).toBeNull()
    }
    expect(
      verifySparkCertificate(perpetual, publicKey, issuer, "copied-device")
    ).toBeNull()
  })
  it("automatically activates a new device and keeps its perpetual grant offline", async () => {
    const f = await fixture()
    try {
      f.request
        .mockResolvedValueOnce(
          Response.json({
            certificate: null,
            licenses: [],
            autoActivationLicenseId: 1,
          })
        )
        .mockResolvedValueOnce(
          Response.json({
            certificate: certificate({
              version: 2,
              offlinePolicy: "perpetual",
              expiresAt: null,
            }),
            licenses: [],
          })
        )
      expect((await f.service.status(true)).perpetualOffline).toBe(true)
      expect(JSON.parse(String(f.request.mock.calls[1]![1]?.body))).toEqual({
        licenseId: 1,
        automatic: true,
      })
      expect(String(f.request.mock.calls[1]![0])).toContain(
        "certificateVersion=2"
      )
      f.account.mockResolvedValue(null)
      expect((await new SparkService(f.options).status(true)).state).toBe(
        "active"
      )
    } finally {
      await f.close()
    }
  })
  it("does not reclaim a released seat, or retain a denied grant when another activation fails", async () => {
    const f = await fixture()
    try {
      await f.service.activate(1)
      f.request
        .mockResolvedValueOnce(
          Response.json({
            certificate: null,
            licenses: [],
            autoActivationLicenseId: 2,
          })
        )
        .mockRejectedValueOnce(new Error("spark_device_limit_reached"))
      expect((await f.service.status(true)).state).not.toBe("active")
      await expect(fs.readFile(f.cachePath)).rejects.toMatchObject({
        code: "ENOENT",
      })
      f.request.mockReset().mockResolvedValue(
        Response.json({
          certificate: null,
          licenses: [],
          autoActivationLicenseId: null,
        })
      )
      expect((await f.service.status(true)).state).toBe("inactive")
      expect(f.request).toHaveBeenCalledTimes(1)
    } finally {
      await f.close()
    }
  })
  it("disables an offline cache after a large backward clock change", async () => {
    const f = await fixture()
    try {
      await f.service.activate(1)
      await fs.writeFile(
        `${f.cachePath}.last-seen`,
        String(Date.now() + 24 * 60 * 60_000)
      )
      f.request.mockRejectedValue(new Error("offline"))
      const restarted = new SparkService(f.options)
      expect((await restarted.status()).state).toBe("expired")
      await expect(restarted.require("file-metadata")).rejects.toThrow(
        "Activate Spark"
      )
    } finally {
      await f.close()
    }
  })
  it("preserves another account's device certificate across a sign-in", async () => {
    const f = await fixture()
    try {
      await f.service.activate(1)
      f.account.mockResolvedValue({ subject: "other", token: "other-token" })
      f.request.mockResolvedValue(
        Response.json({ certificate: null, licenses: [] })
      )
      expect((await f.service.status(true)).state).toBe("inactive")
      await expect(fs.stat(f.cachePath)).resolves.toBeDefined()
    } finally {
      await f.close()
    }
  })
  it("allows the owner to release an expired device lease without enabling it", async () => {
    const f = await fixture()
    try {
      await fs.writeFile(
        f.cachePath,
        certificate({
          issuedAt: "2020-01-01T00:00:00Z",
          expiresAt: "2020-01-02T00:00:00Z",
        })
      )
      expect((await f.service.status()).state).toBe("expired")
      f.request.mockResolvedValue(Response.json({ ok: true }))
      expect((await f.service.deactivate()).state).toBe("inactive")
    } finally {
      await f.close()
    }
  })
})
