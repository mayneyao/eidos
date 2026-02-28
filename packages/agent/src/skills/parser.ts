import type { Skill, SkillMetadata, ParseResult } from "./types.js"

/**
 * Parse YAML frontmatter and markdown content from a SKILL.md file
 */
export function parseSkillFile(content: string): ParseResult {
  try {
    // Check for YAML frontmatter delimiters
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)

    if (!match) {
      return {
        success: false,
        error: "No YAML frontmatter found. Expected format: ---\\nname: ...\\n---",
      }
    }

    const [, frontmatterText, markdownContent] = match

    // Parse YAML frontmatter manually (simple key-value pairs)
    const metadata = parseYamlFrontmatter(frontmatterText)

    // Validate required fields
    if (!metadata.name) {
      return {
        success: false,
        error: "Missing required field: name",
      }
    }

    if (!metadata.description) {
      return {
        success: false,
        error: "Missing required field: description",
      }
    }

    const skill: Skill = {
      metadata,
      content: markdownContent.trim(),
    }

    return {
      success: true,
      skill,
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Parse error: ${error.message}`,
    }
  }
}

/**
 * Simple YAML parser for frontmatter
 * Supports basic key: value pairs
 */
function parseYamlFrontmatter(yaml: string): SkillMetadata {
  const lines = yaml.split("\n")
  const metadata: Record<string, string> = {}

  let currentKey = ""
  let currentValue = ""

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Match key: value pattern
    const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/)
    if (kvMatch) {
      // Save previous key-value if exists
      if (currentKey) {
        metadata[currentKey] = currentValue.trim()
      }

      currentKey = kvMatch[1]
      currentValue = kvMatch[2]
    } else if (currentKey) {
      // Multi-line value continuation
      currentValue += " " + trimmed
    }
  }

  // Save last key-value
  if (currentKey) {
    metadata[currentKey] = currentValue.trim()
  }

  return {
    name: metadata.name || "",
    description: metadata.description || "",
  }
}
