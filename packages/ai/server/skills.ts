import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createSkillToolkit, type SkillToolkit } from "./skills/skill-tool"

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
      watcher = null
    })
  } catch {
    // Directory doesn't exist yet
  }
}

export async function initSkillToolkit(): Promise<SkillToolkit | null> {
  if (cachedToolkit) return cachedToolkit
  try {
    const toolkit = await createSkillToolkit({ skillsDirectory: SKILLS_DIR })
    cachedToolkit = toolkit
    ensureWatcher()
    return toolkit
  } catch {
    return null
  }
}

export function getSkillMetas(toolkit: SkillToolkit | null): SkillMeta[] {
  if (!toolkit) return []
  return toolkit.skills.map((s) => ({
    name: s.name,
    description: s.description,
    dirName: path.basename(s.localPath),
  }))
}
