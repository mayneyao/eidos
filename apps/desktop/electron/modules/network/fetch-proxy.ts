/**
 * Electron Fetch - IPC-based fetch proxy for bypassing CORS
 *
 * This module provides a way to make HTTP requests from the renderer process
 * through the main process, bypassing CORS restrictions.
 *
 * Inspired by: https://github.com/arantes555/electron-fetch
 */

import { ipcMain, ipcRenderer } from "electron"

// IPC channel name
const IPC_FETCH_CHANNEL = "__electron_fetch__"

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength)
  owned.set(bytes)
  return owned.buffer as ArrayBuffer
}

/**
 * Convert various body types to ArrayBuffer for IPC transfer
 */
async function normalizeBody(
  body: BodyInit | null | undefined
): Promise<{ data: ArrayBuffer | null; type: string }> {
  if (body === null || body === undefined) {
    return { data: null, type: "null" }
  }

  if (body instanceof ArrayBuffer) {
    return { data: body, type: "arraybuffer" }
  }

  if (body instanceof Blob) {
    return { data: await body.arrayBuffer(), type: "blob" }
  }

  if (typeof body === "string") {
    return {
      data: ownedArrayBuffer(new TextEncoder().encode(body)),
      type: "string",
    }
  }

  if (body instanceof URLSearchParams) {
    return {
      data: ownedArrayBuffer(new TextEncoder().encode(body.toString())),
      type: "urlsearchparams",
    }
  }

  if (body instanceof FormData) {
    // Serialize FormData to a structured format
    const entries: Array<{
      name: string
      value: string
      type: "string" | "blob"
      filename?: string
      contentType?: string
    }> = []

    for (const [name, value] of body.entries()) {
      if (value instanceof Blob) {
        const arrayBuffer = await value.arrayBuffer()
        entries.push({
          name,
          value: Buffer.from(arrayBuffer).toString("base64"),
          type: "blob",
          filename: (value as File).name || "blob",
          contentType: value.type || "application/octet-stream",
        })
      } else {
        entries.push({
          name,
          value: String(value),
          type: "string",
        })
      }
    }

    return {
      data: ownedArrayBuffer(new TextEncoder().encode(JSON.stringify(entries))),
      type: "formdata",
    }
  }

  // For ReadableStream or other types, try to read as text
  return {
    data: ownedArrayBuffer(new TextEncoder().encode(String(body))),
    type: "string",
  }
}

/**
 * Convert normalized body back to format suitable for Node.js fetch
 */
function denormalizeBody(
  data: ArrayBuffer | null,
  type: string
): ArrayBuffer | string | FormData | URLSearchParams | null {
  if (data === null || type === "null") {
    return null
  }

  if (type === "arraybuffer") {
    return data
  }

  if (type === "blob") {
    return data
  }

  if (type === "string") {
    return new TextDecoder().decode(data)
  }

  if (type === "urlsearchparams") {
    return new TextDecoder().decode(data)
  }

  if (type === "formdata") {
    const entries = JSON.parse(new TextDecoder().decode(data))
    const formData = new FormData()

    for (const entry of entries) {
      if (entry.type === "blob") {
        const blob = new Blob([Buffer.from(entry.value, "base64")], {
          type: entry.contentType,
        })
        formData.append(entry.name, blob, entry.filename)
      } else {
        formData.append(entry.name, entry.value)
      }
    }

    return formData
  }

  return data
}

/**
 * Normalize headers to a plain object
 */
function normalizeHeaders(
  headers: HeadersInit | undefined
): Record<string, string> {
  if (!headers) {
    return {}
  }

  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }

  return headers as Record<string, string>
}

// ============================================================================
// Main Process API
// ============================================================================

export interface FetchRequestOptions {
  url: string
  method: string
  headers: Record<string, string>
  body: { data: ArrayBuffer | null; type: string } | null
  signal?: AbortSignal
}

export interface FetchResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  url: string
  body: ArrayBuffer
}

/**
 * Register the IPC handler for fetch in the main process
 */
export function registerElectronFetchIpc(): void {
  ipcMain.handle(
    IPC_FETCH_CHANNEL,
    async (_event, options: FetchRequestOptions): Promise<FetchResponse> => {
      const { url, method, headers, body } = options

      // Convert body back to usable format
      const requestBody = body ? denormalizeBody(body.data, body.type) : null

      const response = await fetch(url, {
        method,
        headers,
        body: requestBody as BodyInit,
      })

      const responseBody = await response.arrayBuffer()

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url,
        body: responseBody,
      }
    }
  )
}

// ============================================================================
// Renderer Process API (for use in preload)
// ============================================================================

/**
 * Make a fetch request through IPC
 */
async function fetchThroughIpc(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const normalizedBody = await normalizeBody(options?.body)

  const response = await ipcRenderer.invoke(IPC_FETCH_CHANNEL, {
    url,
    method: options?.method || "GET",
    headers: normalizeHeaders(options?.headers),
    body: normalizedBody,
  } as FetchRequestOptions)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/**
 * Install the fetch proxy in the renderer process
 * This should be called in the preload script
 */
export function installElectronFetchProxy(options?: {
  /**
   * URLs to proxy through IPC (bypass CORS)
   * - If not specified, all URLs are proxied
   * - Can be an array of strings (exact match) or RegExp patterns
   */
  proxyUrls?: (string | RegExp)[]

  /**
   * URLs to exclude from proxying
   */
  excludeUrls?: (string | RegExp)[]
}): void {
  const originalFetch = globalThis.fetch
  const { proxyUrls, excludeUrls } = options || {}

  function shouldProxy(url: string): boolean {
    // Check exclude list first
    if (excludeUrls) {
      for (const pattern of excludeUrls) {
        if (typeof pattern === "string") {
          if (url.includes(pattern)) return false
        } else if (pattern instanceof RegExp) {
          if (pattern.test(url)) return false
        }
      }
    }

    // Check proxy list
    if (!proxyUrls || proxyUrls.length === 0) {
      // Proxy all HTTP/HTTPS URLs by default
      return url.startsWith("http://") || url.startsWith("https://")
    }

    for (const pattern of proxyUrls) {
      if (typeof pattern === "string") {
        if (url.includes(pattern)) return true
      } else if (pattern instanceof RegExp) {
        if (pattern.test(url)) return true
      }
    }

    return false
  }

  globalThis.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input.toString()

    if (shouldProxy(url)) {
      try {
        return await fetchThroughIpc(url, init)
      } catch (error) {
        console.error("[ElectronFetch] IPC fetch failed:", error)
        // Fall back to original fetch
        return originalFetch(input, init)
      }
    }

    return originalFetch(input, init)
  }
}

/**
 * Uninstall the fetch proxy and restore original fetch
 */
export function uninstallElectronFetchProxy(): void {
  // Note: This requires storing the original fetch somewhere accessible
  // In practice, this is rarely needed
}
