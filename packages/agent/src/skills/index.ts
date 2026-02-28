/**
 * Skills system for Eidos Agent
 * Implements the Agent Skills standard: https://agentskills.io/
 */

// Re-export types
export type {
  Skill,
  SkillMetadata,
  SkillLocation,
  SkillSource,
  ParseResult,
} from "./types.js"

// Re-export functions
export {
  loadAllSkills,
  loadSkillFromFile,
  clearSkillCache,
} from "./loader.js"

export {
  discoverAllSkills,
  discoverSkillsInDirectory,
  getGlobalSkillsDir,
  getSpaceSkillsDir,
} from "./discovery.js"

export { parseSkillFile } from "./parser.js"

// Export utilities
import type { SkillLocation } from "./types.js"

/**
 * Format skills for system prompt following Agent Skills standard
 * Returns XML format: https://agentskills.io/integrate-skills
 */
export function formatSkillsForSystemPrompt(skills: SkillLocation[]): string {
  if (skills.length === 0) {
    return ""
  }

  const skillsXml = skills
    .map(
      ({ skill, path }) => `  <skill>
    <skill_name>${escapeXml(skill.metadata.name)}</skill_name>
    <skill_path>${escapeXml(path)}</skill_path>
    <description>${escapeXml(skill.metadata.description)}</description>
  </skill>`
    )
    .join("\n")

  return `
<skills>
Available skills - use the read_file tool on the skill_path to load full instructions when needed:
${skillsXml}
</skills>
`
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
