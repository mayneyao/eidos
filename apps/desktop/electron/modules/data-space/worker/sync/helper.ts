import fs from "node:fs"
import path from "path"

import { upsertGraftMergePolicyToml } from "@eidos.space/sync"
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

export function writeEidosGraftMergePolicyConfig(spacePath: string) {
  const graftConfigPath = path.join(
    spacePath,
    ".eidos",
    ".graft",
    "config.toml"
  )
  if (!fs.existsSync(graftConfigPath)) {
    return false
  }

  const current = fs.readFileSync(graftConfigPath, "utf8")
  const next = upsertGraftMergePolicyToml(current)
  if (next === current) {
    return false
  }

  fs.writeFileSync(graftConfigPath, next)
  return true
}
