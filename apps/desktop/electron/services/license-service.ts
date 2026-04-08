import { app } from "electron"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import { LicenseManager, type LicensePayload } from "./license"

/**
 * License Service - Manages license activation and validation
 */
@IpcService("license")
export class LicenseService extends IpcServiceBase {
  /**
   * Get the machine's unique hardware ID
   */
  async getMachineId(): Promise<string> {
    return LicenseManager.getMachineId()
  }

  /**
   * Activate a license with the provided key
   */
  async activateLicense(
    licenseKey: string,
    token?: string
  ): Promise<{ success: boolean; payload?: LicensePayload; error?: string }> {
    try {
      const hwId = await LicenseManager.getMachineId()
      const deviceName = LicenseManager.getDeviceName()
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
        await LicenseManager.saveLicense(licenseKey, result.certificate)
        const payload = await LicenseManager.verifyCertificate(
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
   */
  async getLicenseInfo(): Promise<{
    licenseKey: string
    plan: string
    expiresAt: string
  } | null> {
    const stored = await LicenseManager.getLicense()
    if (!stored) return null

    const payload = await LicenseManager.verifyCertificate(stored.certificate)
    if (!payload) return null

    return {
      licenseKey: stored.licenseKey,
      plan: payload.plan,
      expiresAt: payload.expiresAt,
    }
  }

  /**
   * Clear the stored license
   */
  async clearLicense(): Promise<{ success: true }> {
    await LicenseManager.clearLicense()
    return { success: true }
  }
}

// Export singleton instance
export const licenseService = new LicenseService()
