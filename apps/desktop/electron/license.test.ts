import { describe, it, expect, vi } from "vitest"
import crypto from "node:crypto"
import { LicenseManager } from "./license"

// Mock machine-id
vi.mock("node-machine-id", () => ({
  machineId: vi.fn().mockResolvedValue("test-machine-id"),
}))

// Mock electron
vi.mock("electron", () => ({
  app: {
    isReady: () => true,
    getPath: () => "/tmp",
    getName: () => "Eidos",
    getVersion: () => "0.28.0",
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

describe("LicenseManager", () => {
  const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIBj5VHVJOW4PKE4vFwSF8LYbQDYK5fwXFq7OWdlxvDO+
-----END PRIVATE KEY-----`

  it("should verify a valid certificate", async () => {
    const payload = {
      licenseKey: "TEST-KEY",
      hardwareId: "test-machine-id",
      plan: "spark",
      expiresAt: "2099-12-31T23:59:59Z",
    }

    const data = Buffer.from(JSON.stringify(payload))
    const signature = crypto
      .sign(null, data, PRIVATE_KEY_PEM)
      .toString("base64")
    const certificate = JSON.stringify({ payload, signature })

    const result = await LicenseManager.verifyCertificate(certificate)
    expect(result).not.toBeNull()
    expect(result?.plan).toBe("spark")
  })

  it("should fail for mismatched machine id", async () => {
    const payload = {
      licenseKey: "TEST-KEY",
      hardwareId: "wrong-machine-id",
      plan: "spark",
      expiresAt: "2099-12-31T23:59:59Z",
    }

    const data = Buffer.from(JSON.stringify(payload))
    const signature = crypto
      .sign(null, data, PRIVATE_KEY_PEM)
      .toString("base64")
    const certificate = JSON.stringify({ payload, signature })

    const result = await LicenseManager.verifyCertificate(certificate)
    expect(result).toBeNull()
  })

  it("should fail for expired license", async () => {
    const payload = {
      licenseKey: "TEST-KEY",
      hardwareId: "test-machine-id",
      plan: "spark",
      expiresAt: "2020-01-01T23:59:59Z",
    }

    const data = Buffer.from(JSON.stringify(payload))
    const signature = crypto
      .sign(null, data, PRIVATE_KEY_PEM)
      .toString("base64")
    const certificate = JSON.stringify({ payload, signature })

    const result = await LicenseManager.verifyCertificate(certificate)
    expect(result).toBeNull()
  })
})
