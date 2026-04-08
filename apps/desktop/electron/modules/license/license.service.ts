/**
 * License Service - IPC service for license management
 */

import { app } from "electron"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject } from "../../common/di"
import { LicenseManager, type LicensePayload } from "./license-manager"

/**
 * License Service - Manages license activation and validation via IPC
 *
 * IPC Channels:
 * - license:getMachineId: Get hardware ID
 * - license:activateLicense: Activate with license key
 * - license:getLicenseInfo: Get current license info
 * - license:clearLicense: Clear stored license
 */
@IpcInjectable("license")
export class LicenseService extends IpcServiceBase {
  constructor(@Inject(LicenseManager) private licenseManager: LicenseManager) {
    super()
  }

  /**
   * Get the machine's unique hardware ID
   * IPC: license:getMachineId
   */
  async getMachineId(): Promise<string> {
    return this.licenseManager.getMachineId()
  }

  /**
   * Activate a license with the provided key
   * IPC: license:activateLicense
   */
  async activateLicense(
    licenseKey: string,
    token?: string
  ): Promise<{ success: boolean; payload?: LicensePayload; error?: string }> {
    try {
      const hwId = await this.licenseManager.getMachineId()
      const deviceName = this.licenseManager.getDeviceName()
      const baseUrl = app.isPackaged
        ? "https://eidos.space"
        : "https://local-dev.eidos.space"

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }

      const response = await fetch(`${baseUrl}/api/license/activate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          licenseKey,
          hardwareId: hwId,
          deviceName,
          deviceInfo: {
            os: process.platform,
            arch: process.arch,
            version: app.getVersion(),
          },
        }),
      })

      const result = await response.json()
      if (result.success) {
        await this.licenseManager.saveLicense(licenseKey, result.certificate)
        const payload = await this.licenseManager.verifyCertificate(
          result.certificate
        )
        return { success: true, payload: payload || undefined }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error("Activation error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Get current license information
   * IPC: license:getLicenseInfo
   */
  async getLicenseInfo(): Promise<{
    licenseKey: string
    plan: string
    expiresAt: string
  } | null> {
    const stored = await this.licenseManager.getLicense()
    if (!stored) return null

    const payload = await this.licenseManager.verifyCertificate(
      stored.certificate
    )
    if (!payload) return null

    return {
      licenseKey: stored.licenseKey,
      plan: payload.plan,
      expiresAt: payload.expiresAt,
    }
  }

  /**
   * Clear the stored license
   * IPC: license:clearLicense
   */
  async clearLicense(): Promise<{ success: true }> {
    await this.licenseManager.clearLicense()
    return { success: true }
  }
}
