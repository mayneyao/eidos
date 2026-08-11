import { lookup } from "node:dns/promises"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"

import {
  EIDOS_LITE_ASSET_BYTES_MAX,
  EIDOS_LITE_ASSET_PREVIEW_BYTES_MAX,
  detectAssetMediaType,
  detectRasterMediaType,
  portableEidosFileAssetName,
} from "./eidos-file-attachments"

const URL_IMAGE_REDIRECTS_MAX = 5
const URL_IMAGE_TIMEOUT_MS = 15_000

export interface ResolvedEidosFileUrlImage {
  bytes: Uint8Array
  mediaType: string
  size: number
}

export interface AcquiredEidosFileRemoteAsset {
  name: string
  mediaType: string
  size: number
  uri: string
}

function publicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number)
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false
  }
  const [a, b, c] = octets as [number, number, number, number]
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

function ipv6Bytes(address: string): Uint8Array | null {
  const normalized = address.replace(/^\[|\]$/gu, "").toLowerCase()
  const halves = normalized.split("::")
  if (halves.length > 2) return null
  const parse = (value: string): number[] | null => {
    if (!value) return []
    const words: number[] = []
    for (const part of value.split(":")) {
      if (part.includes(".")) {
        if (!publicIpv4(part) && isIP(part) !== 4) return null
        const octets = part.split(".").map(Number)
        if (octets.length !== 4) return null
        words.push(
          (octets[0]! << 8) | octets[1]!,
          (octets[2]! << 8) | octets[3]!
        )
        continue
      }
      if (!/^[\da-f]{1,4}$/u.test(part)) return null
      words.push(Number.parseInt(part, 16))
    }
    return words
  }
  const left = parse(halves[0] ?? "")
  const right = parse(halves[1] ?? "")
  if (!left || !right) return null
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null
  const words = [...left, ...Array.from({ length: missing }, () => 0), ...right]
  if (words.length !== 8) return null
  return Uint8Array.from(words.flatMap((word) => [word >> 8, word & 0xff]))
}

export function isPublicUrlImageAddress(address: string): boolean {
  const family = isIP(address.replace(/^\[|\]$/gu, ""))
  if (family === 4) return publicIpv4(address)
  if (family !== 6) return false
  const bytes = ipv6Bytes(address)
  if (!bytes) return false
  const mappedIpv4 =
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  if (mappedIpv4) {
    return publicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`)
  }
  const globalUnicast = bytes[0]! >= 0x20 && bytes[0]! <= 0x3f
  const documentation =
    bytes[0] === 0x20 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x0d &&
    bytes[3] === 0xb8
  return globalUnicast && !documentation
}

export function isProxySyntheticUrlImageAddress(address: string): boolean {
  if (isIP(address) !== 4) return false
  const octets = address.split(".").map(Number)
  return octets[0] === 198 && (octets[1] === 18 || octets[1] === 19)
}

async function pinnedPublicAddress(hostname: string) {
  const bareHostname = hostname.replace(/^\[|\]$/gu, "")
  if (isIP(bareHostname)) {
    if (!isPublicUrlImageAddress(bareHostname)) {
      throw new Error("Remote file address is not public")
    }
    return { address: bareHostname, family: isIP(bareHostname) as 4 | 6 }
  }
  const addresses = await lookup(bareHostname, { all: true, verbatim: true })
  const publicAddresses = addresses.filter((candidate) =>
    isPublicUrlImageAddress(candidate.address)
  )
  if (publicAddresses.length > 0) return publicAddresses[0]!
  // System proxy/TUN clients commonly synthesize DNS answers from RFC 2544's
  // benchmarking range. Accept that range only as a hostname lookup result;
  // literal 198.18/15 URL hosts remain rejected by the branch above.
  if (
    addresses.length > 0 &&
    addresses.every((candidate) =>
      isProxySyntheticUrlImageAddress(candidate.address)
    )
  ) {
    return addresses[0]!
  }
  throw new Error("Remote file host did not resolve to public addresses")
}

function validatedUrl(value: string, base?: URL): URL {
  let url: URL
  try {
    url = base ? new URL(value, base) : new URL(value)
  } catch {
    throw new Error("Remote file URL is invalid")
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error("Remote files require an HTTPS URL without credentials")
  }
  return url
}

async function readUrlResource(
  url: URL,
  redirectsRemaining: number,
  maximumBytes: number,
  imagesOnly: boolean
): Promise<Uint8Array> {
  const pinned = await pinnedPublicAddress(url.hostname)
  return new Promise<Uint8Array>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        family: pinned.family,
        headers: {
          Accept: imagesOnly
            ? "image/avif,image/webp,image/png,image/jpeg,image/gif,image/bmp,image/x-icon"
            : "*/*",
          "User-Agent": "Eidos-Lite-Remote-Asset/1",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, pinned.address, pinned.family),
      },
      (response) => {
        const status = response.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.resume()
          const location = response.headers.location
          if (!location || redirectsRemaining <= 0) {
            reject(new Error("Remote file redirect limit was exceeded"))
            return
          }
          let redirected: URL
          try {
            redirected = validatedUrl(location, url)
          } catch (error) {
            reject(error)
            return
          }
          void readUrlResource(
            redirected,
            redirectsRemaining - 1,
            maximumBytes,
            imagesOnly
          ).then(resolve, reject)
          return
        }
        if (status < 200 || status >= 300) {
          response.resume()
          reject(new Error(`Remote file request failed with HTTP ${status}`))
          return
        }
        const declaredSize = Number(response.headers["content-length"])
        if (Number.isFinite(declaredSize) && declaredSize > maximumBytes) {
          response.resume()
          reject(new Error("Remote file exceeds the negotiated size limit"))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength
          if (size > maximumBytes) {
            response.destroy(
              new Error("Remote file exceeds the negotiated size limit")
            )
            return
          }
          chunks.push(chunk)
        })
        response.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))))
        response.on("error", reject)
      }
    )
    request.setTimeout(URL_IMAGE_TIMEOUT_MS, () =>
      request.destroy(new Error("Remote file request timed out"))
    )
    request.on("error", reject)
    request.end()
  })
}

export async function resolveEidosFileUrlImage(
  uri: string,
  purpose: "thumbnail" | "preview"
): Promise<ResolvedEidosFileUrlImage> {
  if (purpose !== "thumbnail" && purpose !== "preview") {
    throw new Error("Network image purpose is invalid")
  }
  const bytes = await readUrlResource(
    validatedUrl(uri),
    URL_IMAGE_REDIRECTS_MAX,
    EIDOS_LITE_ASSET_PREVIEW_BYTES_MAX,
    true
  )
  const mediaType = detectRasterMediaType(bytes)
  if (!mediaType) {
    throw new Error("Network resource is not a supported raster image")
  }
  return { bytes, mediaType, size: bytes.byteLength }
}

function remoteAssetName(uri: string, requestedName?: string): string {
  if (requestedName?.trim()) {
    return portableEidosFileAssetName(requestedName.trim())
  }
  const url = validatedUrl(uri)
  const segment = url.pathname.split("/").filter(Boolean).at(-1)
  if (!segment) return "remote-file"
  try {
    return portableEidosFileAssetName(decodeURIComponent(segment))
  } catch {
    return portableEidosFileAssetName(segment)
  }
}

export async function acquireEidosFileRemoteAsset(
  uri: string,
  requestedName?: string
): Promise<AcquiredEidosFileRemoteAsset> {
  const name = remoteAssetName(uri, requestedName)
  const bytes = await readUrlResource(
    validatedUrl(uri),
    URL_IMAGE_REDIRECTS_MAX,
    EIDOS_LITE_ASSET_BYTES_MAX,
    false
  )
  return {
    name,
    mediaType: detectAssetMediaType(bytes, name),
    size: bytes.byteLength,
    uri,
  }
}

export async function resolveEidosFileRemoteAsset(
  uri: string,
  name: string,
  purpose: "thumbnail" | "preview" | "download"
): Promise<ResolvedEidosFileUrlImage> {
  const bytes = await readUrlResource(
    validatedUrl(uri),
    URL_IMAGE_REDIRECTS_MAX,
    purpose === "download"
      ? EIDOS_LITE_ASSET_BYTES_MAX
      : EIDOS_LITE_ASSET_PREVIEW_BYTES_MAX,
    purpose === "thumbnail"
  )
  const mediaType =
    purpose === "thumbnail"
      ? detectRasterMediaType(bytes)
      : detectAssetMediaType(bytes, name)
  if (!mediaType) {
    throw new Error("Remote file is not a supported raster image")
  }
  return { bytes, mediaType, size: bytes.byteLength }
}
