import { Agent } from "@mariozechner/pi-agent-core"
import { getModel } from "@mariozechner/pi-ai"
import { Type } from "@sinclair/typebox"

import { formatSkillsForSystemPrompt, loadAllSkills } from "../skills/index.js"
import { createReplTools } from "../tools/repl-tools.js"
import {
  createShellTools,
  createShellToolsForSpace,
} from "../tools/shell-tools.js"
import { SpaceFileSystem } from "../tools/space-tools.js"
import type { AgentConfig, SpaceManagerInterface } from "../types/index.js"

/**
 * Space context for agent
 */
interface SpaceContext {
  space: SpaceInfo | null
  userId: string
  spaceManager: SpaceManagerInterface
}

/**
 * Get default base URL for a provider
 */
function getDefaultBaseUrl(provider: string): string {
  const defaults: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta",
    groq: "https://api.groq.com/openai/v1",
    deepseek: "https://api.deepseek.com/v1",
    xai: "https://api.x.ai/v1",
    openrouter: "https://openrouter.ai/api/v1",
    azure: "https://api.openai.azure.com",
    togetherai: "https://api.together.xyz/v1",
    fireworks: "https://api.fireworks.ai/inference/v1",
    perplexity: "https://api.perplexity.ai",
    mistral: "https://api.mistral.ai/v1",
    ollama: "http://localhost:11434/v1",
    cohere: "https://api.cohere.ai/v1",
    cerebras: "https://api.cerebras.ai/v1",
    deepinfra: "https://api.deepinfra.com/v1/openai",
    "openai-compatible": "",
    "anthropic-compatible": "",
  }
  return defaults[provider] || "https://api.openai.com/v1"
}

/**
 * Space info type (subset of SpaceInfo from space-manager)
 */
interface SpaceInfo {
  id: string
  name: string
  path: string
}

/**
 * Tool result helper
 */
function createResult<T>(text: string, details: T) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  }
}

/**
 * Create space tools for a specific user and space context
 */
function createSpaceToolsForUser(
  userId: string,
  spaceContext: SpaceContext,
  getCurrentSpace: (userId: string) => SpaceInfo | null,
  switchSpace: (userId: string, spaceId: string) => boolean
) {
  // Tool: List all available spaces
  const listSpacesTool = {
    name: "list_spaces",
    label: "List Spaces",
    description: "List all available Eidos spaces that you can access",
    parameters: Type.Object({}),
    execute: async () => {
      const spaces = spaceContext.spaceManager.getAllSpaces()
      const spaceList = spaces
        .map((s) => `- ${s.name} (ID: ${s.id})`)
        .join("\n")

      return createResult(
        spaces.length > 0
          ? `Available spaces:\n${spaceList}\n\nUse switch_space to select a space.`
          : "No spaces available.",
        { spaces: spaces.map((s) => ({ id: s.id, name: s.name })) }
      )
    },
  }

  // Tool: Get current space info
  const getCurrentSpaceTool = {
    name: "get_current_space",
    label: "Get Current Space",
    description: "Get information about the currently selected space",
    parameters: Type.Object({}),
    execute: async () => {
      const currentSpace = getCurrentSpace(userId)
      if (!currentSpace) {
        return createResult(
          "No space is currently selected. Use list_spaces to see available spaces, then switch_space to select one.",
          { currentSpace: null }
        )
      }

      return createResult(
        `Current space: ${currentSpace.name} (ID: ${currentSpace.id})\nPath: ${currentSpace.path}`,
        { currentSpace }
      )
    },
  }

  // Tool: Switch to a specific space
  const switchSpaceTool = {
    name: "switch_space",
    label: "Switch Space",
    description:
      "Switch to a specific Eidos space by its ID. You must switch to a space before performing file operations.",
    parameters: Type.Object({
      space_id: Type.String({
        description: "The ID of the space to switch to",
      }),
    }),
    execute: async (toolCallId: string, params: { space_id: string }) => {
      const success = switchSpace(userId, params.space_id)
      if (success) {
        const space = getCurrentSpace(userId)
        return createResult(
          `Successfully switched to space: ${space?.name} (${params.space_id})\n\nYou can now use file operations like list_files, read_file, write_file in this space.`,
          { success: true, spaceId: params.space_id, spaceName: space?.name }
        )
      } else {
        return createResult(
          `Failed to switch to space: ${params.space_id}. Space not found or session expired.`,
          { success: false, spaceId: params.space_id }
        )
      }
    },
  }

  // Helper to get filesystem
  const getFileSystem = (): SpaceFileSystem | null => {
    const currentSpace = getCurrentSpace(userId)
    if (!currentSpace) return null
    return new SpaceFileSystem(currentSpace.path)
  }

  // Tool: List files in current space
  const listFilesTool = {
    name: "list_files",
    label: "List Files",
    description:
      "List files and directories in the current space. Returns relative paths from the space root.",
    parameters: Type.Object({
      directory: Type.Optional(
        Type.String({
          description:
            "Relative directory path to list (default: root of space)",
          default: ".",
        })
      ),
      recursive: Type.Optional(
        Type.Boolean({
          description: "Whether to list files recursively",
          default: false,
        })
      ),
    }),
    execute: async (
      toolCallId: string,
      params: { directory?: string; recursive?: boolean }
    ) => {
      const fs = getFileSystem()
      if (!fs) {
        return createResult(
          "No space is currently selected. Use switch_space to select a space first.",
          { error: "NO_SPACE_SELECTED" }
        )
      }

      try {
        const result = await fs.listFiles(
          params.directory || ".",
          params.recursive || false
        )
        const filesStr = result.files.join("\n") || "(no files)"
        const dirsStr = result.directories.join("\n") || "(no subdirectories)"

        return createResult(
          `Files:\n${filesStr}\n\nDirectories:\n${dirsStr}`,
          result
        )
      } catch (error: any) {
        return createResult(`Error listing files: ${error.message}`, {
          error: error.message,
        })
      }
    },
  }

  // Tool: Read file content
  const readFileTool = {
    name: "read_file",
    label: "Read File",
    description: "Read the content of a file in the current space (or absolute path for system skills)",
    parameters: Type.Object({
      file_path: Type.String({
        description: "Relative path to the file from space root (or absolute path for system skills)",
      }),
    }),
    execute: async (toolCallId: string, params: { file_path: string }) => {
      // Special case: allow reading skill files bypassing space constraints
      if (params.file_path.includes(".eidos/skills") && params.file_path.endsWith(".md")) {
        try {
          const fs = await import("node:fs/promises")
          const content = await fs.readFile(params.file_path, "utf-8")
          return createResult(content, {
            filePath: params.file_path,
            contentLength: content.length,
            type: "skill_bypass",
          })
        } catch (error: any) {
          // Fall through to space fs if bypassing fails
        }
      }

      const fs = getFileSystem()
      if (!fs) {
        return createResult(
          "No space is currently selected. Use switch_space to select a space first.",
          { error: "NO_SPACE_SELECTED" }
        )
      }

      try {
        const content = await fs.readFile(params.file_path)
        return createResult(content, {
          filePath: params.file_path,
          contentLength: content.length,
        })
      } catch (error: any) {
        return createResult(`Error reading file: ${error.message}`, {
          error: error.message,
        })
      }
    },
  }

  // Tool: Write file content
  const writeFileTool = {
    name: "write_file",
    label: "Write File",
    description:
      "Write content to a file in the current space. Creates directories if needed.",
    parameters: Type.Object({
      file_path: Type.String({
        description: "Relative path to the file from space root",
      }),
      content: Type.String({
        description: "Content to write to the file",
      }),
      append: Type.Optional(
        Type.Boolean({
          description: "Whether to append to the file instead of overwriting",
          default: false,
        })
      ),
    }),
    execute: async (
      toolCallId: string,
      params: { file_path: string; content: string; append?: boolean }
    ) => {
      const fs = getFileSystem()
      if (!fs) {
        return createResult(
          "No space is currently selected. Use switch_space to select a space first.",
          { error: "NO_SPACE_SELECTED" }
        )
      }

      try {
        await fs.writeFile(params.file_path, params.content, params.append)
        const action = params.append ? "appended to" : "written to"
        return createResult(`Successfully ${action} ${params.file_path}`, {
          filePath: params.file_path,
          action: params.append ? "append" : "write",
          contentLength: params.content.length,
        })
      } catch (error: any) {
        return createResult(`Error writing file: ${error.message}`, {
          error: error.message,
        })
      }
    },
  }

  // Tool: Create directory
  const createDirectoryTool = {
    name: "create_directory",
    label: "Create Directory",
    description: "Create a new directory in the current space",
    parameters: Type.Object({
      directory_path: Type.String({
        description: "Relative path to the directory from space root",
      }),
    }),
    execute: async (toolCallId: string, params: { directory_path: string }) => {
      const fs = getFileSystem()
      if (!fs) {
        return createResult(
          "No space is currently selected. Use switch_space to select a space first.",
          { error: "NO_SPACE_SELECTED" }
        )
      }

      try {
        await fs.createDirectory(params.directory_path)
        return createResult(
          `Successfully created directory: ${params.directory_path}`,
          { directoryPath: params.directory_path }
        )
      } catch (error: any) {
        return createResult(`Error creating directory: ${error.message}`, {
          error: error.message,
        })
      }
    },
  }

  // Tool: Delete file or directory
  const deleteTool = {
    name: "delete",
    label: "Delete",
    description: "Delete a file or directory in the current space",
    parameters: Type.Object({
      path: Type.String({
        description: "Relative path to the file or directory from space root",
      }),
      recursive: Type.Optional(
        Type.Boolean({
          description: "Whether to delete directories recursively",
          default: false,
        })
      ),
    }),
    execute: async (
      toolCallId: string,
      params: { path: string; recursive?: boolean }
    ) => {
      const fs = getFileSystem()
      if (!fs) {
        return createResult(
          "No space is currently selected. Use switch_space to select a space first.",
          { error: "NO_SPACE_SELECTED" }
        )
      }

      try {
        await fs.delete(params.path, params.recursive)
        return createResult(`Successfully deleted: ${params.path}`, {
          path: params.path,
          recursive: params.recursive,
        })
      } catch (error: any) {
        return createResult(`Error deleting: ${error.message}`, {
          error: error.message,
        })
      }
    },
  }

  return [
    listSpacesTool,
    getCurrentSpaceTool,
    switchSpaceTool,
    listFilesTool,
    readFileTool,
    writeFileTool,
    createDirectoryTool,
    deleteTool,
  ]
}

/**
 * Get the appropriate API type for a provider
 */
function getApiTypeForProvider(
  provider: string,
  explicitApiType?: "openai-completions" | "anthropic-messages"
): "openai-completions" | "anthropic-messages" {
  // Use explicit apiType if provided
  if (explicitApiType) {
    return explicitApiType
  }

  // Auto-detect based on provider
  const anthropicProviders = ["anthropic", "anthropic-compatible"]
  if (anthropicProviders.includes(provider.toLowerCase())) {
    return "anthropic-messages"
  }

  // Default to OpenAI compatible format
  return "openai-completions"
}

/**
 * Create a new AI agent instance with optional space context
 */
export function createAgent(
  config: AgentConfig,
  spaceContext?: SpaceContext,
  sessionHooks?: {
    getCurrentSpace: (userId: string) => SpaceInfo | null
    switchSpace: (userId: string, spaceId: string) => boolean
  }
): Agent {
  const { provider, model, systemPrompt, apiKey, baseUrl, replConfig, apiType } = config

  console.log(`🔧 Initializing agent for ${provider}/${model}...`)

  // Always build model config from user configuration
  // This ensures we use exactly what the user configured (e.g., codingModel)
  // instead of relying on pi-ai's registry which may not have custom models
  let llmModel: any

  // Try to get from pi-ai registry first (for known models)
  try {
    llmModel = getModel(provider as any, model as any)
    console.log(`✅ Found model ${model} in pi-ai registry`)
  } catch (e) {
    console.log(`ℹ️ Model ${model} not in pi-ai registry, building from config`)
  }

  // Build/override with user-provided configuration
  if (!llmModel) {
    const detectedApiType = getApiTypeForProvider(provider, apiType)
    console.log(`📡 Using API format: ${detectedApiType}`)

    llmModel = {
      id: model,
      name: model,
      api: detectedApiType,
      provider: provider,
      baseUrl: baseUrl || getDefaultBaseUrl(provider),
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    }
  }

  // Always override with user-provided baseUrl if specified
  if (baseUrl) {
    console.log(`🌐 Using configured base URL: ${baseUrl}`)
    llmModel.baseUrl = baseUrl
  }

  if (llmModel.baseUrl) {
    console.log(`🔗 Final base URL: ${llmModel.baseUrl}`)
  }

  // Create agent
  const agent = new Agent({
    getApiKey: () => apiKey || "",
  })

  agent.setModel(llmModel)

  // Load skills
  const spacePath = spaceContext?.space?.path
  const skills = loadAllSkills(spacePath)

  if (skills.length > 0) {
    console.log(`📚 Loaded ${skills.length} skill(s):`)
    skills.forEach(({ skill, source }) => {
      console.log(`  - ${skill.metadata.name} (${source})`)
    })
  }

  // Build system prompt with skills and space context
  let finalSystemPrompt = systemPrompt

  // Add skills section (before space instructions)
  if (skills.length > 0) {
    const skillsSection = formatSkillsForSystemPrompt(skills)
    finalSystemPrompt += skillsSection
  }

  if (spaceContext && sessionHooks) {
    const spaceInstructions = `

## ⚡ TOOL USAGE - BE PROACTIVE

You have FULL PERMISSION to use ALL tools. DO NOT ask before executing.

### Space Tools (Auto-execute)
- list_spaces → Run immediately when user mentions "spaces", "list", "show spaces"
- switch_space → Auto-switch when user mentions a space name or ID
- list_files → Run immediately for "files", "list", "show", "dir"
- read_file → Read immediately when user mentions a filename
- write_file → Write immediately (no confirmation needed)
- execute_shell → Execute ANY command user requests

### Shell & Network Tools (Auto-execute)
- execute_shell: git, npm, bun, python, curl, etc. → EXECUTE IMMEDIATELY
- curl: HTTP requests → EXECUTE IMMEDIATELY
- fetch: Simple GET → EXECUTE IMMEDIATELY  
- jina_fetch: JS pages → Use when normal fetch fails

**RULE: When user asks for something → Use tool immediately → Show result**

Current space: ${spaceContext.space ? `"${spaceContext.space.name}"` : "None selected (run switch_space if needed)"}

## 🚀 PROACTIVE WORKFLOW EXAMPLES

User: "list files"
✓ [runs list_files] "📁 readme.md, src/, package.json"

User: "install lodash"  
✓ [runs npm install lodash] "✓ Installed lodash@4.17.21"

User: "fetch https://example.com"
✓ [runs curl] "Title: Example Domain..."

User: "what's in my space"
✓ [runs get_current_space → list_files] "📁 demo space: files, data/, config.json"

## 📝 OUTPUT FORMAT (Concise)

- Success: "✓ [action] [brief result]"
- Files: "📁 file1, file2, dir/"
- Data: Summarize to <20 lines
- Errors: "❌ [error message]"

## 🚫 NEVER DO

- "I will check..." → JUST CHECK
- "Should I..." → JUST DO IT
- "Let me think..." → ACT NOW
- Explain your plan → SHOW RESULTS
`
    finalSystemPrompt += spaceInstructions
  }

  agent.setSystemPrompt(finalSystemPrompt)
  agent.setThinkingLevel("off")

  console.log("finalSystemPrompt", finalSystemPrompt)

  // Set up tools
  let allTools: any[] = []

  // Space tools - require space context and session hooks
  if (spaceContext && sessionHooks) {
    const spaceTools = createSpaceToolsForUser(
      spaceContext.userId,
      spaceContext,
      sessionHooks.getCurrentSpace,
      sessionHooks.switchSpace
    )
    allTools = [...allTools, ...spaceTools]

    // Shell tools - always available, use space path as cwd if space is selected
    const shellTools = spaceContext.space
      ? createShellToolsForSpace(spaceContext.space.path, {
          timeout: 30000,
          maxOutputSize: 10000,
        })
      : createShellTools({
          timeout: 30000,
          maxOutputSize: 10000,
        })
    allTools.push(...(shellTools as any))

    // Create REPL tools if config provided
    if (replConfig) {
      const replTools = createReplTools(replConfig)
      allTools.push(...(replTools as any))
    }

    console.log(
      `🔧 Agent initialized with ${allTools.length} tools (${spaceTools.length} space, ${shellTools.length} shell, ${replConfig ? 1 : 0} REPL)`
    )
  }

  agent.setTools(allTools as any)

  return agent
}
