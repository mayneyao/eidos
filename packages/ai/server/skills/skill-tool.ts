import fs from "node:fs"
import path from "node:path"
import type { Tool } from "ai"
import { z } from "zod"
import { parse as parseYaml } from "yaml"

/**
 * Skill metadata parsed from SKILL.md frontmatter.
 */
export interface SkillMetadata {
  name: string
  description: string
}

/**
 * Base skill info from discovery (without file list).
 */
export interface DiscoveredSkill extends SkillMetadata {
  localPath: string
  sandboxPath: string
}

/**
 * Full skill representation with file list.
 */
export interface Skill extends DiscoveredSkill {
  files: string[]
}

/**
 * Options for creating a skill toolkit.
 */
export interface CreateSkillToolOptions {
  skillsDirectory: string
  destination?: string
}

/**
 * Return type from createSkillToolkit.
 */
export interface SkillToolkit {
  skill: Tool
  skills: Skill[]
  files: Record<string, string>
  instructions: string
}

// ── Frontmatter parsing ────────────────────────────────────────

function parseFrontmatter(raw: string): {
  data: Record<string, unknown>
  content: string
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match?.[1]) return { data: {}, content: raw }
  const data = (parseYaml(match[1]) as Record<string, unknown>) ?? {}
  return { data, content: match[2] ?? "" }
}

function extractSkillMetadata(raw: string): SkillMetadata | null {
  const { data } = parseFrontmatter(raw)
  const name = data.name
  const description = data.description
  if (
    typeof name !== "string" ||
    typeof description !== "string" ||
    !name ||
    !description
  ) {
    return null
  }
  return { name, description }
}

function extractBody(raw: string): string {
  const { content } = parseFrontmatter(raw)
  return content.trim()
}

// ── Skill discovery ────────────────────────────────────────────

async function discoverSkills(
  skillsDir: string,
  sandboxDestination: string
): Promise<DiscoveredSkill[]> {
  const absoluteDir = path.resolve(skillsDir)
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(absoluteDir, { withFileTypes: true })
  } catch (err: any) {
    if (err.code === "ENOENT") return []
    throw new Error(
      `Failed to read skills directory: ${absoluteDir}. ${err.message}`
    )
  }

  const results: DiscoveredSkill[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillDir = path.join(absoluteDir, entry.name)
    const skillMdPath = path.join(skillDir, "SKILL.md")

    let content: string
    try {
      content = await fs.promises.readFile(skillMdPath, "utf-8")
    } catch {
      continue
    }

    const meta = extractSkillMetadata(content)
    if (!meta) continue

    results.push({
      name: meta.name,
      description: meta.description,
      localPath: skillDir,
      sandboxPath: `${sandboxDestination}/${entry.name}`,
    })
  }
  return results
}

async function listSkillFiles(skillPath: string): Promise<string[]> {
  const files: string[] = []
  async function walk(dir: string, prefix: string = "") {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), relativePath)
      } else {
        files.push(relativePath)
      }
    }
  }
  await walk(skillPath)
  return files
}

// ── Skill AI Tool ──────────────────────────────────────────────

function createSkillTool(skills: Skill[]): Tool {
  const skillMap = new Map<string, Skill>()
  for (const s of skills) {
    skillMap.set(s.name, s)
  }

  const skillList = skills
    .map((s) => `  - skill("${s.name}"): ${s.description}`)
    .join("\n")

  return {
    description: `Load a skill's instructions to learn how to use it. You can load multiple skills. Treat the returned instructions as authoritative.

Available skills:
${skillList}

After loading a skill, use the bash tool to run its scripts from the skill's directory.`,
    inputSchema: z.object({
      skillName: z.string().describe("The name of the skill to load"),
    }),
    execute: async (args) => {
      const { skillName } = args as { skillName: string }
      const skill = skillMap.get(skillName)
      if (!skill) {
        const names = [...skillMap.keys()].join(", ")
        return {
          success: false,
          error: `Skill "${skillName}" not found. Available: ${names}`,
        }
      }

      const mdPath = path.join(skill.localPath, "SKILL.md")
      let content: string
      try {
        content = await fs.promises.readFile(mdPath, "utf-8")
      } catch (err: any) {
        return {
          success: false,
          error: `Failed to read ${skillName} instructions: ${err.message}`,
        }
      }

      const instructions = extractBody(content)
      const fileList = skill.files.filter((f) => f !== "SKILL.md")

      return {
        success: true,
        skill: {
          name: skill.name,
          description: skill.description,
          path: skill.sandboxPath,
        },
        instructions,
        files: fileList,
      }
    },
  }
}

// ── Instructions for bash tool ─────────────────────────────────

function generateSkillInstructions(skills: Skill[]): string {
  if (skills.length === 0) return ""
  const lines = [
    "SKILL DIRECTORIES:",
    "Skills are available at the following paths:",
  ]
  for (const s of skills) {
    lines.push(`  ${s.sandboxPath}/ - ${s.name}: ${s.description}`)
  }
  lines.push("")
  lines.push("To use a skill:")
  lines.push("  1. Call skill to get the skill's instructions")
  lines.push("  2. Run scripts from the skill directory with bash")
  return lines.join("\n")
}

// ── Main orchestrator ──────────────────────────────────────────

/**
 * Discover skills, collect files, and create the skill toolkit.
 * Replaces bash-tool's experimental_createSkillTool.
 */
export async function createSkillToolkit(
  options: CreateSkillToolOptions
): Promise<SkillToolkit> {
  const dest = options.destination ?? "skills"
  const sandboxDest = `./${dest}`
  const discovered = await discoverSkills(options.skillsDirectory, sandboxDest)

  const skills: Skill[] = []
  const allFiles: Record<string, string> = {}

  for (const s of discovered) {
    const fileList = await listSkillFiles(s.localPath)
    const enriched: Skill = { ...s, files: fileList }
    skills.push(enriched)

    const dirName = path.basename(s.localPath)
    for (const file of fileList) {
      try {
        const content = await fs.promises.readFile(
          path.join(s.localPath, file),
          "utf-8"
        )
        allFiles[`./${dest}/${dirName}/${file}`] = content
      } catch {
        // binary or unreadable — silently skip
      }
    }
  }

  const skill = createSkillTool(skills)
  const instructions = generateSkillInstructions(skills)

  return { skill, skills, files: allFiles, instructions }
}
