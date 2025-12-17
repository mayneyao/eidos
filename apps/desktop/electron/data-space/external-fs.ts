import * as path from "node:path"
import { type EidosDatabase } from "@/packages/core/data-space"

import { NodeExternalFileSystem } from "../external-fs-node"
import type { SpaceInfo } from "../space-registry"

export async function createExternalFileSystem(
  db: EidosDatabase,
  projectRoot: string
): Promise<NodeExternalFileSystem> {
  // Get project root directory from spaceInfo parameter or fallback to space registry for main process

  console.log(`Project root: ${projectRoot}`)

  return new NodeExternalFileSystem(
    async (fsPath: string) => {
      try {
        if (fsPath.startsWith("~/")) {
          // Project folder: ~/ maps to project root
          const relativePath = fsPath.substring(2)
          const absolutePath = path.join(projectRoot, relativePath)
          // console.log(`Resolved ~/ path: ${fsPath} -> ${absolutePath}`);
          return absolutePath
        } else if (fsPath.startsWith("@/")) {
          // Mounted folder: @/mountName/... maps to mounted path
          const parts = fsPath.substring(2).split("/")
          const mountName = parts[0]

          if (!mountName) {
            console.error("Invalid mounted path: missing mount name")
            return null
          }

          // Get mount path from database
          const mountKey = `eidos:space:files:mount:${mountName}`
          const mountRecords = await db.selectObjects(
            `SELECT value FROM eidos__kv WHERE key = ?`,
            [mountKey]
          )

          if (mountRecords.length === 0) {
            console.warn(`Mount not found: ${mountName}`)
            return null
          }

          const mountPath = mountRecords[0].value as string
          const relativePath = parts.slice(1).join("/")
          const absolutePath = relativePath
            ? path.join(mountPath, relativePath)
            : mountPath

          // console.log(`Resolved @/ path: ${fsPath} -> ${absolutePath}`);
          return absolutePath
        }

        console.error(
          `Invalid path format: ${fsPath}. Must start with ~/ or @/`
        )
        return null
      } catch (error) {
        console.error(`Error resolving path ${fsPath}:`, error)
        return null
      }
    },
    async () => {
      try {
        const mounts = await db.selectObjects(
          `SELECT key, value FROM eidos__kv WHERE key LIKE 'eidos:space:files:mount:%'`
        )
        return mounts.map((m: any) => {
          const name = m.key.split(":").pop()
          return { name, path: m.value }
        })
      } catch (error) {
        console.error("Error fetching mounts:", error)
        return []
      }
    }
  )
}
