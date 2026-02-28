/**
 * Space Tools for Agent
 * Provides file system operations within a specific space directory
 */

import fs from "fs/promises"
import path from "path"
import { Type } from "@sinclair/typebox"
import type { AgentTool } from "@mariozechner/pi-agent-core"
import type { SpaceInfo } from "@eidos.space/space-manager"

/**
 * Tool result type
 */
interface ToolResult<T> {
  content: Array<{ type: "text"; text: string }>
  details: T
}

/**
 * Create tool result
 */
function createResult<T>(text: string, details: T): ToolResult<T> {
  return {
    content: [{ type: "text", text }],
    details,
  }
}

/**
 * Space tools configuration
 */
export interface SpaceToolsConfig {
  /** Get all available spaces */
  getSpaces: () => SpaceInfo[]
  /** Get current space for a user */
  getCurrentSpace: (userId: string) => SpaceInfo | null
  /** Set current space for a user */
  setCurrentSpace: (userId: string, spaceId: string) => boolean
}

/**
 * Create space-related tools for the agent
 */
export function createSpaceTools(config: SpaceToolsConfig): AgentTool<any>[] {
  const { getSpaces, getCurrentSpace, setCurrentSpace } = config

  // Tool: List all available spaces
  const listSpacesTool: AgentTool<typeof ListSpacesSchema> = {
    name: "list_spaces",
    label: "List Spaces",
    description: "List all available Eidos spaces that you can access",
    parameters: Type.Object({}),
    execute: async (toolCallId, params) => {
      const spaces = getSpaces()
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

  // Tool: Switch to a specific space
  const switchSpaceTool: AgentTool<typeof SwitchSpaceSchema> = {
    name: "switch_space",
    label: "Switch Space",
    description:
      "Switch to a specific Eidos space by its ID. You must switch to a space before performing file operations.",
    parameters: Type.Object({
      space_id: Type.String({
        description: "The ID of the space to switch to",
      }),
    }),
    execute: async (toolCallId, params, signal, onUpdate) => {
      // This will be called with user context, we need to get userId from closure
      // Actually, we need to pass userId through the tool execution context
      // For now, we'll handle this at the agent level
      return createResult(
        `Switched to space: ${params.space_id}`,
        { spaceId: params.space_id }
      )
    },
  }

  // Tool: Get current space info
  const getCurrentSpaceTool: AgentTool<typeof GetCurrentSpaceSchema> = {
    name: "get_current_space",
    label: "Get Current Space",
    description: "Get information about the currently selected space",
    parameters: Type.Object({}),
    execute: async (toolCallId, params) => {
      // User context will be provided at call time
      return createResult(
        "Current space information will be provided based on user context.",
        { userId: "provided_at_runtime" }
      )
    },
  }

  // Tool: List files in current space
  const listFilesTool: AgentTool<typeof ListFilesSchema> = {
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
    execute: async (toolCallId, params, signal, onUpdate) => {
      // Implementation will be provided with user context
      return createResult(
        "File listing will be performed based on user context and current space.",
        { directory: params.directory, recursive: params.recursive }
      )
    },
  }

  // Tool: Read file content
  const readFileTool: AgentTool<typeof ReadFileSchema> = {
    name: "read_file",
    label: "Read File",
    description: "Read the content of a file in the current space",
    parameters: Type.Object({
      file_path: Type.String({
        description: "Relative path to the file from space root",
      }),
    }),
    execute: async (toolCallId, params, signal, onUpdate) => {
      // Implementation will be provided with user context
      return createResult(
        "File content will be read based on user context and current space.",
        { filePath: params.file_path }
      )
    },
  }

  // Tool: Write file content
  const writeFileTool: AgentTool<typeof WriteFileSchema> = {
    name: "write_file",
    label: "Write File",
    description: "Write content to a file in the current space. Creates directories if needed.",
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
    execute: async (toolCallId, params, signal, onUpdate) => {
      // Implementation will be provided with user context
      return createResult(
        "File will be written based on user context and current space.",
        { filePath: params.file_path, append: params.append }
      )
    },
  }

  // Tool: Create directory
  const createDirectoryTool: AgentTool<typeof CreateDirectorySchema> = {
    name: "create_directory",
    label: "Create Directory",
    description: "Create a new directory in the current space",
    parameters: Type.Object({
      directory_path: Type.String({
        description: "Relative path to the directory from space root",
      }),
    }),
    execute: async (toolCallId, params, signal, onUpdate) => {
      // Implementation will be provided with user context
      return createResult(
        "Directory will be created based on user context and current space.",
        { directoryPath: params.directory_path }
      )
    },
  }

  // Tool: Delete file or directory
  const deleteTool: AgentTool<typeof DeleteSchema> = {
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
    execute: async (toolCallId, params, signal, onUpdate) => {
      // Implementation will be provided with user context
      return createResult(
        "Item will be deleted based on user context and current space.",
        { path: params.path, recursive: params.recursive }
      )
    },
  }

  return [
    listSpacesTool,
    switchSpaceTool,
    getCurrentSpaceTool,
    listFilesTool,
    readFileTool,
    writeFileTool,
    createDirectoryTool,
    deleteTool,
  ]
}

// TypeBox schemas for tools
const ListSpacesSchema = Type.Object({})
const SwitchSpaceSchema = Type.Object({
  space_id: Type.String(),
})
const GetCurrentSpaceSchema = Type.Object({})
const ListFilesSchema = Type.Object({
  directory: Type.Optional(Type.String()),
  recursive: Type.Optional(Type.Boolean()),
})
const ReadFileSchema = Type.Object({
  file_path: Type.String(),
})
const WriteFileSchema = Type.Object({
  file_path: Type.String(),
  content: Type.String(),
  append: Type.Optional(Type.Boolean()),
})
const CreateDirectorySchema = Type.Object({
  directory_path: Type.String(),
})
const DeleteSchema = Type.Object({
  path: Type.String(),
  recursive: Type.Optional(Type.Boolean()),
})

/**
 * Space file system operations
 * Provides actual file system implementation for a specific space
 */
export class SpaceFileSystem {
  private spacePath: string

  constructor(spacePath: string) {
    this.spacePath = spacePath
  }

  /**
   * Resolve a relative path to absolute path within the space
   */
  private resolvePath(relativePath: string): string {
    // Normalize and ensure the path stays within the space
    const resolved = path.resolve(this.spacePath, relativePath)
    const relative = path.relative(this.spacePath, resolved)

    // Security check: ensure the resolved path is within the space
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Access denied: path is outside of the space directory")
    }

    return resolved
  }

  /**
   * List files in a directory
   */
  async listFiles(
    directory = ".",
    recursive = false
  ): Promise<{ files: string[]; directories: string[] }> {
    const targetPath = this.resolvePath(directory)

    try {
      const stats = await fs.stat(targetPath)
      if (!stats.isDirectory()) {
        throw new Error(`Not a directory: ${directory}`)
      }
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(`Directory not found: ${directory}`)
      }
      throw error
    }

    const files: string[] = []
    const directories: string[] = []

    if (recursive) {
      await this.walkDirectory(targetPath, "", files, directories)
    } else {
      const entries = await fs.readdir(targetPath, { withFileTypes: true })
      for (const entry of entries) {
        const relativePath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          directories.push(relativePath)
        } else {
          files.push(relativePath)
        }
      }
    }

    return { files, directories }
  }

  /**
   * Walk directory recursively
   */
  private async walkDirectory(
    absolutePath: string,
    relativePrefix: string,
    files: string[],
    directories: string[]
  ): Promise<void> {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true })

    for (const entry of entries) {
      const relativePath = path.join(relativePrefix, entry.name)
      const absoluteEntryPath = path.join(absolutePath, entry.name)

      if (entry.isDirectory()) {
        directories.push(relativePath)
        await this.walkDirectory(absoluteEntryPath, relativePath, files, directories)
      } else {
        files.push(relativePath)
      }
    }
  }

  /**
   * Read file content
   */
  async readFile(filePath: string): Promise<string> {
    const targetPath = this.resolvePath(filePath)

    try {
      const content = await fs.readFile(targetPath, "utf-8")
      return content
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(`File not found: ${filePath}`)
      }
      if (error.code === "EISDIR") {
        throw new Error(`Path is a directory, not a file: ${filePath}`)
      }
      throw error
    }
  }

  /**
   * Write file content
   */
  async writeFile(
    filePath: string,
    content: string,
    append = false
  ): Promise<void> {
    const targetPath = this.resolvePath(filePath)

    // Ensure parent directory exists
    const parentDir = path.dirname(targetPath)
    await fs.mkdir(parentDir, { recursive: true })

    if (append) {
      await fs.appendFile(targetPath, content, "utf-8")
    } else {
      await fs.writeFile(targetPath, content, "utf-8")
    }
  }

  /**
   * Create directory
   */
  async createDirectory(dirPath: string): Promise<void> {
    const targetPath = this.resolvePath(dirPath)
    await fs.mkdir(targetPath, { recursive: true })
  }

  /**
   * Delete file or directory
   */
  async delete(targetPath: string, recursive = false): Promise<void> {
    const resolvedPath = this.resolvePath(targetPath)

    try {
      const stats = await fs.stat(resolvedPath)

      if (stats.isDirectory()) {
        if (recursive) {
          await fs.rm(resolvedPath, { recursive: true })
        } else {
          await fs.rmdir(resolvedPath)
        }
      } else {
        await fs.unlink(resolvedPath)
      }
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(`Path not found: ${targetPath}`)
      }
      throw error
    }
  }

  /**
   * Check if path exists
   */
  async exists(targetPath: string): Promise<boolean> {
    try {
      const resolvedPath = this.resolvePath(targetPath)
      await fs.access(resolvedPath)
      return true
    } catch {
      return false
    }
  }
}
