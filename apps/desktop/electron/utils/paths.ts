import { lookup } from "@/lib/mime/mime"
import fs from "node:fs"
import path from "path"
import { getConfigManager } from "../modules/config/config-manager"
import { getSpaceRegistry } from "../modules/space-management/space-management.module"

export const getSpacePath = (spaceId: string) => {
  const registry = getSpaceRegistry()
  const space = registry.getSpace(spaceId)
  if (!space) {
    throw new Error(`Space not found: ${spaceId}`)
  }

  return space.path
}

export const getSpaceFileFromPath = (spaceId: string, filename: string) => {
  const registry = getSpaceRegistry()
  const space = registry.getSpace(spaceId)

  if (!space) {
    console.log("❌ Space not found in registry")
    throw new Error(`Space not found: ${spaceId}`)
  }

  const filePath = path.join(space.path, ".eidos", "files", filename)

  if (!fs.existsSync(filePath)) {
    console.log("❌ File does not exist at path:", filePath)
    // 列出 .eidos/files 目录的内容来帮助调试
    const eidosFilesDir = path.join(space.path, ".eidos", "files")
    console.log(
      "  - .eidos/files directory exists:",
      fs.existsSync(eidosFilesDir)
    )
    if (fs.existsSync(eidosFilesDir)) {
      try {
        const files = fs.readdirSync(eidosFilesDir)
        console.log("  - files in .eidos/files:", files)
      } catch (e) {
        console.log("  - error reading .eidos/files directory:", e)
      }
    }
    throw new Error(`File not found: ${filePath}`)
  }

  const file = fs.readFileSync(filePath)
  return new File([file], filename, {
    type: (lookup(filename) as string) || "application/octet-stream",
  })
}

export const getFileFromPath = (pathname: string) => {
  const root = getConfigManager().get("dataFolder")
  if (!root) {
    throw new Error("Data folder not configured")
  }
  const filePath = path.join(root, pathname)
  const file = fs.readFileSync(filePath)
  return new File([file], pathname, {
    type: (lookup(pathname) as string) || "application/octet-stream",
  })
}
