import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  experimental_createSkillTool as createSkillTool,
  type SkillToolkit,
} from "bash-tool"

const SKILLS_DIR = path.join(os.homedir(), ".agents", "skills")

export interface SkillMeta {
  name: string
  description: string
  dirName: string
}

let cachedToolkit: SkillToolkit | null = null
let watcher: fs.FSWatcher | null = null

function invalidateCache() {
  cachedToolkit = null
}

function ensureWatcher() {
  if (watcher) return
  try {
    watcher = fs.watch(SKILLS_DIR, { recursive: true }, () => {
      invalidateCache()
    })
    watcher.on("error", () => {
      // Directory doesn't exist or other error — ignore
      watcher = null
    })
  } catch {
    // Directory doesn't exist yet
  }
}

/**
 * Initialize the skill toolkit using bash-tool's createSkillTool.
 * Caches the result and invalidates when ~/.agents/skills/ changes.
 */
export async function initSkillToolkit(): Promise<SkillToolkit | null> {
  if (cachedToolkit) return cachedToolkit
  try {
    const toolkit = await createSkillTool({ skillsDirectory: SKILLS_DIR })
    cachedToolkit = toolkit
    ensureWatcher()
    return toolkit
  } catch {
    return null
  }
}

/**
 * Lightweight skill metadata for the list API endpoint.
 */
export function getSkillMetas(toolkit: SkillToolkit | null): SkillMeta[] {
  if (!toolkit) return []
  return toolkit.skills.map((s) => ({
    name: s.name,
    description: s.description,
    dirName: path.basename(s.localPath),
  }))
}
