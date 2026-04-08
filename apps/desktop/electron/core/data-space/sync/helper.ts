import fs from "node:fs"
import path from "path"

import type { SyncCredentials } from "@eidos.space/sync"
import type { SpaceInfo } from "@eidos.space/space-manager"

// --- START: Helper function to check if this is an initialization operation ---
export function isInitializationOperation(space: SpaceInfo): boolean {
  try {
    const eidosDirPath = path.join(space.path, ".eidos")
    const graftConfigPath = path.join(eidosDirPath, "graft.toml")
    const graftDirPath = path.join(eidosDirPath, ".graft")

    return (
      !fs.existsSync(eidosDirPath) ||
      !fs.existsSync(graftConfigPath) ||
      !fs.existsSync(graftDirPath)
    )
  } catch (error) {
    console.error("Failed to check initialization status:", error)
    return true
  }
}
// --- END: Helper function to check initialization ---

// --- START: Helper function to apply Graft Config to Environment ---
export function applyGraftConfigToEnv(
  space: SpaceInfo,
  credentials: SyncCredentials
) {
  try {
    const eidosDirPath = path.join(space.path, ".eidos")
    if (!fs.existsSync(eidosDirPath)) {
      fs.mkdirSync(eidosDirPath, { recursive: true })
    }

    const remoteSpaceId =
      space.sync?.remote?.split("/").pop()?.split(".")[0] || space.id

    const graftConfigPath = path.join(eidosDirPath, "graft.toml")
    const graftDirPath = path.join(eidosDirPath, ".graft")

    // Always overwrite graft config
    // Ensure proper path escaping for Windows compatibility
    const escapedGraftDirPath = graftDirPath.replace(/\\/g, "\\\\")
    const sampleConfig = `
data_dir = "${escapedGraftDirPath}"
[remote]
type = "s3_compatible"
bucket = "${credentials.bucketName}"
prefix = "${remoteSpaceId}/.eidos/.graft"

# Configure your S3-compatible storage credentials here
# bucket: Your S3 bucket name
# prefix: Optional path prefix within the bucket
`

    try {
      fs.writeFileSync(graftConfigPath, sampleConfig, "utf-8")
      console.log(`Written graft config at ${graftConfigPath}`)
    } catch (e) {
      console.error(`Failed to write graft config at ${graftConfigPath}`, e)
    }

    if (!fs.existsSync(graftDirPath)) {
      fs.mkdirSync(graftDirPath, { recursive: true })
      console.log(`Created graft data directory at ${graftDirPath}`)
    }
    process.env.GRAFT_CONFIG = graftConfigPath
    console.log(`Set GRAFT_CONFIG=${graftConfigPath}`)
    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId
    console.log(`Set AWS_ACCESS_KEY_ID=${credentials.accessKeyId}`)
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey
    console.log(`Set AWS_SECRET_ACCESS_KEY=${credentials.secretAccessKey}`)
    process.env.AWS_REGION = "auto"
    console.log(`Set AWS_REGION=auto`)
    process.env.AWS_ENDPOINT = credentials.endpoint
    console.log(`Set AWS_ENDPOINT=${credentials.endpoint}`)
  } catch (error) {
    console.error(
      "Failed to read graft config or set environment variables:",
      error
    )
    // Decide if this is fatal. For now, just log and continue.
  }
}
// --- END: Helper function ---
