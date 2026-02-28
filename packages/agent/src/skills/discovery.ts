import * as fs from "node:fs"
import * as path from "node:path"
import { homedir } from "node:os"
import type { SkillSource } from "./types.js"

/**
 * Discovered skill file path with source
 */
export interface DiscoveredSkill {
  /** Absolute path to SKILL.md file */
  path: string
  /** Source of the skill */
  source: SkillSource
}

/**
 * Get the global skills directory path
 */
export function getGlobalSkillsDir(): string {
  return path.join(homedir(), ".eidos", "skills")
}

/**
 * Get the space-level skills directory path
 */
export function getSpaceSkillsDir(spacePath: string): string {
  return path.join(spacePath, ".eidos", "skills")
}

/**
 * Discover skill files from a directory
 * 
 * Discovery rules:
 * - Direct .md files in the skills directory root
 * - Recursive SKILL.md files under subdirectories
 */
export function discoverSkillsInDirectory(
  skillsDir: string,
  source: SkillSource
): DiscoveredSkill[] {
  const discovered: DiscoveredSkill[] = []

  try {
    if (!fs.existsSync(skillsDir)) {
      return discovered
    }

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(skillsDir, entry.name)
      
      let isFile = entry.isFile()
      let isDirectory = entry.isDirectory()

      if (entry.isSymbolicLink()) {
        try {
          const stat = fs.statSync(fullPath)
          isFile = stat.isFile()
          isDirectory = stat.isDirectory()
        } catch (e) {
          // Ignore broken symlinks
          continue
        }
      }

      if (isFile && entry.name.endsWith(".md")) {
        // Direct .md file in root
        discovered.push({ path: fullPath, source })
      } else if (isDirectory) {
        // Look for SKILL.md in subdirectory
        const skillMdPath = path.join(fullPath, "SKILL.md")
        if (fs.existsSync(skillMdPath)) {
          discovered.push({ path: skillMdPath, source })
        }

        // Recursively search subdirectories
        const subSkills = discoverSkillsInDirectory(fullPath, source)
        discovered.push(...subSkills)
      }
    }
  } catch (error: any) {
    console.warn(`Failed to discover skills in ${skillsDir}: ${error.message}`)
  }

  return discovered
}

/**
 * Discover all skills from global and space directories
 */
export function discoverAllSkills(spacePath?: string): DiscoveredSkill[] {
  const discovered: DiscoveredSkill[] = []

  // Discover global skills
  const globalDir = getGlobalSkillsDir()
  const globalSkills = discoverSkillsInDirectory(globalDir, "global")
  discovered.push(...globalSkills)

  // Discover space skills if space path provided
  if (spacePath) {
    const spaceDir = getSpaceSkillsDir(spacePath)
    const spaceSkills = discoverSkillsInDirectory(spaceDir, "space")
    discovered.push(...spaceSkills)
  }

  return discovered
}
