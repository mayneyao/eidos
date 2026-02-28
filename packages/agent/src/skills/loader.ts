import * as fs from "node:fs"
import type { Skill, SkillLocation } from "./types.js"
import { parseSkillFile } from "./parser.js"
import { discoverAllSkills } from "./discovery.js"

// In-memory cache for loaded skills
const skillCache = new Map<string, Skill>()

/**
 * Load a skill from a file path
 */
export function loadSkillFromFile(filePath: string): Skill | null {
  try {
    // Check cache first
    if (skillCache.has(filePath)) {
      return skillCache.get(filePath)!
    }

    // Read and parse file
    const content = fs.readFileSync(filePath, "utf-8")
    const parseResult = parseSkillFile(content)

    if (!parseResult.success || !parseResult.skill) {
      console.warn(`Failed to parse skill at ${filePath}: ${parseResult.error}`)
      return null
    }

    // Cache the skill
    skillCache.set(filePath, parseResult.skill)

    return parseResult.skill
  } catch (error: any) {
    console.warn(`Failed to load skill from ${filePath}: ${error.message}`)
    return null
  }
}

/**
 * Load all skills with priority resolution
 * Space skills override global skills with the same name
 */
export function loadAllSkills(spacePath?: string): SkillLocation[] {
  const discovered = discoverAllSkills(spacePath)
  const skillMap = new Map<string, SkillLocation>()

  // Load all discovered skills
  for (const { path, source } of discovered) {
    const skill = loadSkillFromFile(path)
    if (!skill) continue

    const existing = skillMap.get(skill.metadata.name)

    // Priority resolution: space > global
    if (existing) {
      if (source === "space") {
        // Space skill overrides global
        console.log(
          `⚡ Skill "${skill.metadata.name}": space version overrides global`
        )
        skillMap.set(skill.metadata.name, { skill, source, path })
      }
      // If existing is space and new is global, keep existing
    } else {
      skillMap.set(skill.metadata.name, { skill, source, path })
    }
  }

  return Array.from(skillMap.values())
}

/**
 * Clear the skill cache
 */
export function clearSkillCache(): void {
  skillCache.clear()
}
