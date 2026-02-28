/**
 * Skills system types
 * Following the Agent Skills standard: https://agentskills.io/
 */

/**
 * Skill metadata from YAML frontmatter
 */
export interface SkillMetadata {
  /** Unique skill name (kebab-case recommended) */
  name: string
  /** Description of what the skill does and when to use it */
  description: string
}

/**
 * Complete skill with metadata and content
 */
export interface Skill {
  /** Metadata from YAML frontmatter */
  metadata: SkillMetadata
  /** Markdown content (instructions) */
  content: string
}

/**
 * Source type for skill priority resolution
 */
export type SkillSource = "space" | "global"

/**
 * Skill with location information
 */
export interface SkillLocation {
  /** The skill data */
  skill: Skill
  /** Where the skill was loaded from */
  source: SkillSource
  /** Absolute file path to SKILL.md */
  path: string
}

/**
 * Result of parsing a SKILL.md file
 */
export interface ParseResult {
  success: boolean
  skill?: Skill
  error?: string
}
