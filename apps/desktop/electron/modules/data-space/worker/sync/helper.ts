import fs from "node:fs"
import path from "path"

import type { SyncCredentials } from "@eidos.space/sync"
import type { SpaceInfo } from "@eidos.space/space-manager"

// --- START: Helper function to check if this is an initialization operation ---
export function isInitializationOperation(space: SpaceInfo): boolean {
  try {
    const eidosDirPath = path.join(space.path, ".eidos")
    const graftDirPath = path.join(eidosDirPath, ".graft")
    const graftConfigPath = path.join(graftDirPath, "config.toml")

    return (
      !fs.existsSync(eidosDirPath) ||
      !fs.existsSync(graftDirPath) ||
      !fs.existsSync(graftConfigPath)
    )
  } catch (error) {
    console.error("Failed to check initialization status:", error)
    return true
  }
}
// --- END: Helper function to check initialization ---

function ensureEidosDir(space: SpaceInfo) {
  const eidosDirPath = path.join(space.path, ".eidos")
  if (!fs.existsSync(eidosDirPath)) {
    fs.mkdirSync(eidosDirPath, { recursive: true })
  }
  return eidosDirPath
}

function normalizeRemoteSpaceId(segment?: string) {
  const value = segment?.trim()
  if (!value || value === ".graft" || value === ".eidos") {
    return undefined
  }
  return value.replace(/\.(db|sqlite|sqlite3)$/i, "")
}

export function remoteSpaceIdFromRemote(remote?: string) {
  if (!remote) {
    return undefined
  }

  let remotePath = remote.trim()
  if (!remotePath) {
    return undefined
  }

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(remotePath)) {
      const url = new URL(remotePath)
      remotePath = url.pathname
    }
  } catch {
    // Fall through to path-style parsing below.
  }

  const pathWithoutQuery = remotePath.split(/[?#]/, 1)[0]
  const segments = pathWithoutQuery.split("/").filter(Boolean)
  if (segments.length === 0) {
    return undefined
  }

  const eidosIndex = segments.indexOf(".eidos")
  if (eidosIndex > 0) {
    return normalizeRemoteSpaceId(segments[eidosIndex - 1])
  }

  if (segments.length >= 3) {
    return normalizeRemoteSpaceId(segments[2])
  }

  return normalizeRemoteSpaceId(segments.at(-1))
}

function remoteSpaceIdFor(space: SpaceInfo, remoteOverride?: string) {
  return (
    remoteSpaceIdFromRemote(remoteOverride) ||
    remoteSpaceIdFromRemote(space.sync?.remote) ||
    space.id
  )
}

function setAwsCredentialEnv(credentials: SyncCredentials) {
  process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId
  process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey
  process.env.AWS_REGION = "auto"
  process.env.AWS_ENDPOINT = credentials.endpoint
  process.env.AWS_ENDPOINT_URL = credentials.endpoint
}

function clearLegacyGraftConfigEnv() {
  delete process.env.GRAFT_CONFIG
}

// --- START: Helper function to prepare a remote Graft repository URI ---
export function applyGraftConfigToEnv(
  space: SpaceInfo,
  credentials: SyncCredentials,
  remoteOverride?: string
) {
  try {
    ensureEidosDir(space)
    const remoteSpaceId = remoteSpaceIdFor(space, remoteOverride)
    const prefix = `${remoteSpaceId}/.eidos/.graft`
    const endpoint = credentials.endpoint
      ? `?endpoint=${credentials.endpoint}`
      : ""
    const remoteUri = `s3_compatible://${credentials.bucketName}/${prefix}${endpoint}`

    clearLegacyGraftConfigEnv()
    setAwsCredentialEnv(credentials)
    console.log(`Prepared Graft remote URI: ${remoteUri}`)
    return remoteUri
  } catch (error) {
    console.error("Failed to prepare graft remote configuration:", error)
    throw error
  }
}
// --- END: Helper function ---
