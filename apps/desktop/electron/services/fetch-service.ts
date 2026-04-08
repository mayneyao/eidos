import { fetchAvailableModels } from "@/packages/ai/helper"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"

/**
 * Fetch Service - Handles HTTP fetch operations and AI model fetching
 */
@IpcService("fetch")
export class FetchService extends IpcServiceBase {
  /**
   * Simple fetch proxy - forwards to Node.js fetch (no CORS restrictions)
   */
  async fetch(
    url: string,
    options?: RequestInit
  ): Promise<{
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    url: string
    body: ArrayBuffer
  }> {
    const res = await fetch(url, options)
    const body = await res.arrayBuffer()

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      url: res.url,
      body: body,
    }
  }

  /**
   * Fetch available AI models from a provider
   */
  async fetchAvailableModels(
    apiKey: string,
    providerType: string,
    baseUrl?: string
  ): Promise<{ success: boolean; models?: any[]; error?: string }> {
    try {
      const models = await fetchAvailableModels(
        apiKey,
        providerType as any,
        baseUrl
      )
      return { success: true, models }
    } catch (error) {
      console.error("Error fetching available models:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}

// Export singleton instance
export const fetchService = new FetchService()
