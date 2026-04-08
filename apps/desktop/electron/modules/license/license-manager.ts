/**
 * License Manager - Manages license storage and verification
 * DI-compatible version with @Injectable
 */

import { app, safeStorage } from "electron"
import fs from "fs/promises"
import path from "path"
import crypto from "node:crypto"
import os from "node:os"
import { machineId } from "node-machine-id"
import { Injectable } from "../../common/di"

const PUBLIC_KEY =
  "MCowBQYDK2VwAyEAWUPm84Yth9VFvOMNjoGnqjFmO2c20leVkiqM0F5S7U0="

export interface LicensePayload {
  licenseKey: string
  hardwareId: string
  plan: string
  expiresAt: string
  [key: string]: any
}

export interface StoredLicense {
  licenseKey: string
  certificate: string
}

const LICENSE_PATH = "license.bin"

@Injectable()
export class LicenseManager {
  async getLicenseFilePath(): Promise<string> {
    if (!app.isReady()) {
      await app.whenReady()
    }
    return path.join(app.getPath("userData"), LICENSE_PATH)
  }

  async getMachineId(): Promise<string> {
    try {
      return await machineId()
    } catch (e) {
      console.error("Failed to get machine id", e)
      return "unknown-device"
    }
  }

  getDeviceName(): string {
    return os.hostname()
  }

  async saveLicense(licenseKey: string, certificate: string): Promise<void> {
    const filePath = await this.getLicenseFilePath()
    const data = JSON.stringify({ licenseKey, certificate })

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(data)
      await fs.writeFile(filePath, encrypted)
    } else {
      await fs.writeFile(filePath, data)
    }
  }

  async getLicense(): Promise<StoredLicense | null> {
    try {
      const filePath = await this.getLicenseFilePath()
      const raw = await fs.readFile(filePath)
      if (!raw?.length) return null

      const decrypted = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString("utf-8")

      return JSON.parse(decrypted) as StoredLicense
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        console.error("Failed to read license:", error)
      }
      return null
    }
  }

  async clearLicense(): Promise<void> {
    try {
      const filePath = await this.getLicenseFilePath()
      await fs.unlink(filePath)
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        console.warn("Failed to clear license:", error)
      }
    }
  }

  async verifyCertificate(certStr: string): Promise<LicensePayload | null> {
    try {
      const { payload, signature } = JSON.parse(certStr)
      const data = Buffer.from(JSON.stringify(payload))
      const sigBuffer = Buffer.from(signature, "base64")

      const pem = `-----BEGIN PUBLIC KEY-----\n${PUBLIC_KEY}\n-----END PUBLIC KEY-----`

      const isValid = crypto.verify(null, data, pem, sigBuffer)

      if (!isValid) {
        console.error("License signature invalid")
        return null
      }

      // Check machine id
      const currentId = await this.getMachineId()
      if (payload.hardwareId !== currentId) {
        console.error("License hardwareId mismatch", {
          expected: payload.hardwareId,
          actual: currentId,
        })
        return null
      }

      // Check expiry
      if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
        console.error("License expired", payload.expiresAt)
        return null
      }

      return payload as LicensePayload
    } catch (error) {
      console.error("License verification failed", error)
      return null
    }
  }
}

// Backward compatibility: static methods delegate to singleton
let licenseManagerInstance: LicenseManager | null = null

export function getLicenseManager(): LicenseManager {
  if (!licenseManagerInstance) {
    licenseManagerInstance = new LicenseManager()
  }
  return licenseManagerInstance
}
