/**
 * Shell Tools for Agent
 * Provides safe shell command execution with restrictions
 */

import { exec } from "child_process"
import { promisify } from "util"
import { Type } from "@sinclair/typebox"
import type { AgentTool } from "@mariozechner/pi-agent-core"

const execAsync = promisify(exec)

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
 * Shell tools configuration
 */
export interface ShellToolsConfig {
  /** Maximum execution time in milliseconds (default: 30000) */
  timeout?: number
  /** Maximum output size in characters (default: 10000) */
  maxOutputSize?: number
  /** Allowed commands whitelist (empty = allow all after safety check) */
  allowedCommands?: string[]
  /** Working directory for command execution */
  cwd?: string
}

/**
 * Dangerous commands that should be blocked
 */
const DANGEROUS_PATTERNS = [
  // System destructive commands
  /rm\s+-rf\s+\//,
  />\s*\/dev\/null/,
  /mkfs/,
  /dd\s+if=/,
  /:\(\)\{\s*:\|\:&\s*\};/, // Fork bomb
  // Privilege escalation
  /sudo\s+/,
  /su\s+-/,
  // Network attacks
  /ping\s+-f/,
]

/**
 * Commands that are generally safe for network/file operations
 * Most common Unix commands are allowed by default
 */
const DEFAULT_SAFE_COMMANDS = [
  // Network
  "curl",
  "wget",
  "ping",
  "dig",
  "nslookup",
  "host",
  "nc",
  "netcat",
  "ssh",
  "scp",
  // Navigation & File operations
  "cd",
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "grep",
  "egrep",
  "fgrep",
  "find",
  "ls",
  "ll",
  "tree",
  "file",
  "stat",
  "touch",
  "cp",
  "mv",
  "ln",
  "chmod",
  "chown",
  "mkdir",
  "rmdir",
  "rm",
  "du",
  "df",
  // Text processing
  "echo",
  "printf",
  "jq",
  "sed",
  "awk",
  "sort",
  "uniq",
  "wc",
  "tr",
  "cut",
  "paste",
  "rev",
  "tac",
  "split",
  "join",
  "comm",
  "diff",
  "cmp",
  "patch",
  // Encoding/Hashing
  "base64",
  "md5sum",
  "sha256sum",
  "sha1sum",
  "openssl",
  "xxd",
  "hexdump",
  // System info
  "date",
  "which",
  "whoami",
  "uname",
  "hostname",
  "uptime",
  "pwd",
  "id",
  "groups",
  "env",
  "printenv",
  "ps",
  "top",
  "htop",
  "free",
  "vmstat",
  "iostat",
  "mpstat",
  "sar",
  "df",
  "du",
  // Compression
  "tar",
  "gzip",
  "gunzip",
  "zip",
  "unzip",
  "bzip2",
  "bunzip2",
  "xz",
  "unxz",
  // Git
  "git",
  // Package managers (read-only)
  "npm",
  "yarn",
  "pnpm",
  "pip",
  "pip3",
  // Build tools
  "make",
  "cmake",
  "gcc",
  "g++",
  "clang",
  "go",
  "python",
  "python3",
  "node",
  "deno",
  "bun",
  "ruby",
  "perl",
  "php",
  "java",
  "javac",
  "rustc",
  "cargo",
  // Containers
  "docker",
  "docker-compose",
  "kubectl",
  // Editors (for viewing)
  "vi",
  "vim",
  "nano",
  "emacs",
  "code",
  // Other useful tools
  "tmux",
  "screen",
  "nohup",
  "time",
  "timeout",
  "parallel",
  "xargs",
  "tee",
  "script",
  "yes",
  "seq",
  "shuf",
  "sort",
  "tsort",
]

/**
 * Check if a command contains dangerous patterns
 */
function containsDangerousPatterns(command: string): boolean {
  const lowerCommand = command.toLowerCase()
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(lowerCommand))
}

/**
 * Extract the main command from a command string
 * Handles compound commands (cd X && bun run) by skipping cd and finding the real command
 */
function extractMainCommand(command: string): string {
  // Remove leading environment variables
  let cmd = command.replace(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*/, "")
  cmd = cmd.trim()
  
  // Handle cd ... && ... patterns by skipping cd commands
  // Patterns: "cd dir && cmd", "cd dir || cmd", "cd dir; cmd"
  while (true) {
    const cdMatch = cmd.match(/^(cd)\s+[^&|;]+(?:&&|\|\||;)?\s*/)
    if (cdMatch) {
      // Remove the cd part and continue
      cmd = cmd.slice(cdMatch[0].length).trim()
    } else {
      break
    }
  }
  
  // Now extract the actual command (first word before space or operator)
  const match = cmd.match(/^([^\s|&;<>]+)/)
  return match ? match[1].toLowerCase() : ""
}

/**
 * Check if a command is allowed
 */
function isCommandAllowed(
  command: string,
  allowedCommands: string[]
): boolean {
  const mainCommand = extractMainCommand(command)

  if (allowedCommands.length === 0) {
    // If no whitelist specified, use default safe commands
    return DEFAULT_SAFE_COMMANDS.includes(mainCommand)
  }

  return allowedCommands.includes(mainCommand)
}

/**
 * Sanitize and validate command
 */
function validateCommand(
  command: string,
  allowedCommands: string[]
): { valid: boolean; error?: string } {
  // Check for empty command
  if (!command.trim()) {
    return { valid: false, error: "Empty command" }
  }

  // Check for dangerous patterns
  if (containsDangerousPatterns(command)) {
    return { valid: false, error: "Command contains potentially dangerous patterns" }
  }

  // Check if command is in allowed list
  if (!isCommandAllowed(command, allowedCommands)) {
    const allowedList =
      allowedCommands.length > 0
        ? allowedCommands.join(", ")
        : DEFAULT_SAFE_COMMANDS.join(", ")
    return {
      valid: false,
      error: `Command not allowed. Allowed commands: ${allowedList}`,
    }
  }

  return { valid: true }
}

/**
 * Execute shell command with safety checks
 */
async function executeShellCommand(
  command: string,
  config: ShellToolsConfig
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const timeout = config.timeout || 30000
  const maxOutputSize = config.maxOutputSize || 10000
  const cwd = config.cwd
  const home = process.env.HOME || "/tmp"
  const pathEnv = [
    // User-local installations (highest priority)
    `${home}/.bun/bin`,
    `${home}/.cargo/bin`,
    `${home}/.nvm/versions/node/current/bin`,
    `${home}/.local/bin`,
    `${home}/.pnpm`,
    `${home}/go/bin`,
    `${home}/bin`,
    // Homebrew (macOS)
    "/opt/homebrew/bin",
    "/opt/homebrew/opt/node/bin",
    "/usr/local/opt/node/bin",
    // System paths
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":")

  console.log(`🐚 Shell execution:`)
  console.log(`   Command: ${command}`)
  console.log(`   CWD: ${cwd || process.cwd()}`)
  console.log(`   HOME: ${home}`)
  console.log(`   PATH: ${pathEnv}`)

  try {
    const execOptions: any = {
      timeout,
      env: {
        PATH: pathEnv,
        HOME: home,
        USER: process.env.USER || "",
        SHELL: process.env.SHELL || "/bin/bash",
        LD_PRELOAD: "",
        LD_LIBRARY_PATH: "",
      },
    }
    if (cwd) {
      execOptions.cwd = cwd
    }
    
    console.log(`   Executing with timeout: ${timeout}ms`)
    const { stdout, stderr } = await execAsync(command, execOptions)
    console.log(`   ✓ Command succeeded`)

    // Convert Buffer to string if necessary
    const stdoutStr = stdout ? stdout.toString() : ""
    const stderrStr = stderr ? stderr.toString() : ""

    // Truncate output if too large
    const truncatedStdout =
      stdoutStr.length > maxOutputSize
        ? stdoutStr.substring(0, maxOutputSize) +
          `\n... (truncated, total ${stdoutStr.length} chars)`
        : stdoutStr

    const truncatedStderr =
      stderrStr.length > maxOutputSize
        ? stderrStr.substring(0, maxOutputSize) +
          `\n... (truncated, total ${stderrStr.length} chars)`
        : stderrStr

    return {
      stdout: truncatedStdout,
      stderr: truncatedStderr,
      exitCode: 0,
    }
  } catch (error: any) {
    console.log(`   ✗ Command failed: ${error.message}`)
    if (error.stderr) {
      console.log(`   STDERR: ${error.stderr.toString().substring(0, 200)}`)
    }
    
    if (error.killed || error.signal === "SIGTERM") {
      return {
        stdout: error.stdout ? error.stdout.toString() : "",
        stderr: `Command timed out after ${timeout}ms`,
        exitCode: 124,
      }
    }

    const stderr = error.stderr ? error.stderr.toString() : ""
    const errorMsg = stderr || error.message || "Unknown error"
    
    return {
      stdout: error.stdout ? error.stdout.toString() : "",
      stderr: errorMsg,
      exitCode: error.code || 1,
    }
  }
}

/**
 * Create shell execution tools
 */
export function createShellTools(config: ShellToolsConfig = {}): AgentTool<any>[] {
  const allowedCommands = config.allowedCommands || []

  // Tool: Execute shell command
  const executeCommandTool: AgentTool<typeof ExecuteCommandSchema> = {
    name: "execute_shell",
    label: "Execute Shell Command",
    description:
      "Execute a shell command. Supports most common Unix commands including network tools (curl, wget), " +
      "file operations (ls, cat, grep, find), text processing (jq, sed, awk), version control (git), " +
      "build tools (npm, make, gcc), and more. Dangerous commands (sudo, rm -rf /, etc.) are blocked. " +
      "For long outputs, only first/last 50 lines are shown. Timeout: 30s.",
    parameters: Type.Object({
      command: Type.String({
        description: "The shell command to execute",
      }),
      description: Type.Optional(
        Type.String({
          description: "Description of what this command does (for logging)",
        })
      ),
    }),
    execute: async (
      toolCallId: string,
      params: { command: string; description?: string }
    ) => {
      const { command, description } = params

      // Log the command
      console.log(
        `🐚 Shell command request: "${command}"${description ? ` [${description}]` : ""}`
      )

      // Validate command
      console.log(`   Validating command...`)
      const validation = validateCommand(command, allowedCommands)
      console.log(`   Validation result: ${validation.valid ? "PASS" : "FAIL"}`)
      if (!validation.valid) {
        console.log(`   Validation error: ${validation.error}`)
        return createResult(`❌ Command validation failed: ${validation.error}`, {
          error: validation.error,
          command,
        })
      }

      try {
        console.log(`   Executing...`)
        const result = await executeShellCommand(command, config)
        
        // Smart output formatting - summarize long outputs
        const MAX_LINES = 100
        const TRUNCATE_THRESHOLD = 2000
        
        let outputText = result.stdout
        let wasTruncated = false
        
        if (outputText.length > TRUNCATE_THRESHOLD) {
          const lines = outputText.split('\n')
          if (lines.length > MAX_LINES) {
            const firstHalf = lines.slice(0, 50).join('\n')
            const lastHalf = lines.slice(-50).join('\n')
            outputText = `${firstHalf}\n\n... (${lines.length - 100} lines omitted) ...\n\n${lastHalf}`
            wasTruncated = true
          }
        }
        
        // Include stderr if present (but truncated)
        let stderrText = result.stderr
        if (stderrText && stderrText.length > 500) {
          stderrText = stderrText.substring(0, 500) + '\n... (truncated)'
        }

        const output = []
        if (outputText) {
          output.push(outputText)
        }
        if (stderrText) {
          output.push(`[stderr]: ${stderrText}`)
        }
        if (result.exitCode !== 0) {
          output.push(`[exit: ${result.exitCode}]`)
        }

        console.log(`   Command completed with exit code: ${result.exitCode}`)
        return createResult(output.join("\n"), {
          command,
          exitCode: result.exitCode,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
          truncated: wasTruncated,
        })
      } catch (error: any) {
        console.log(`   Execution error: ${error.message}`)
        return createResult(`❌ Execution error: ${error.message}`, {
          error: error.message,
          command,
        })
      }
    },
  }

  // Tool: Download content via curl
  const curlTool: AgentTool<typeof CurlSchema> = {
    name: "curl",
    label: "HTTP Request (curl)",
    description:
      "Make HTTP requests using curl. Supports GET, POST, and custom headers. " +
      "Max response size: 10000 chars. Timeout: 30s.",
    parameters: Type.Object({
      url: Type.String({
        description: "URL to request",
      }),
      method: Type.Optional(
        Type.String({
          description: "HTTP method (GET, POST, PUT, DELETE)",
          default: "GET",
        })
      ),
      headers: Type.Optional(
        Type.Array(
          Type.String({
            description: "HTTP headers (e.g., 'Content-Type: application/json')",
          })
        )
      ),
      data: Type.Optional(
        Type.String({
          description: "Request body data (for POST/PUT)",
        })
      ),
      timeout: Type.Optional(
        Type.Number({
          description: "Request timeout in seconds (default: 30)",
          default: 30,
        })
      ),
      silent: Type.Optional(
        Type.Boolean({
          description: "Silent mode (no progress meter)",
          default: true,
        })
      ),
    }),
    execute: async (
      toolCallId: string,
      params: {
        url: string
        method?: string
        headers?: string[]
        data?: string
        timeout?: number
        silent?: boolean
      }
    ) => {
      const {
        url,
        method = "GET",
        headers = [],
        data,
        timeout = 30,
        silent = true,
      } = params

      // Build curl command
      let command = "curl"

      if (silent) {
        command += " -s"
      }

      // Follow redirects
      command += " -L"

      // Add method
      command += ` -X ${method.toUpperCase()}`

      // Add timeout
      command += ` --max-time ${timeout}`

      // Add headers
      for (const header of headers) {
        command += ` -H "${header.replace(/"/g, '\\"')}"`
      }

      // Add data
      if (data) {
        command += ` -d "${data.replace(/"/g, '\\"')}"`
      }

      // Add URL (must be last)
      command += ` "${url}"`

      console.log(`🌐 curl request: ${method.toUpperCase()} ${url}`)

      try {
        const result = await executeShellCommand(command, {
          ...config,
          timeout: timeout * 1000,
        })

        const output = []
        if (result.stdout) {
          output.push(result.stdout)
        }
        if (result.stderr && !result.stderr.includes("% Total")) {
          output.push(`STDERR: ${result.stderr}`)
        }
        if (result.exitCode !== 0) {
          output.push(`Exit code: ${result.exitCode}`)
        }

        return createResult(output.join("\n"), {
          url,
          method: method.toUpperCase(),
          exitCode: result.exitCode,
          responseLength: result.stdout.length,
        })
      } catch (error: any) {
        return createResult(`❌ Request failed: ${error.message}`, {
          error: error.message,
          url,
          method: method.toUpperCase(),
        })
      }
    },
  }

  // Tool: Fetch web content (simplified curl for GET requests)
  const fetchTool: AgentTool<typeof FetchSchema> = {
    name: "fetch",
    label: "Fetch Web Content",
    description:
      "Fetch content from a URL. Returns the response body as text. " +
      "For more control (headers, POST, etc.), use the 'curl' tool.",
    parameters: Type.Object({
      url: Type.String({
        description: "URL to fetch",
      }),
      max_size: Type.Optional(
        Type.Number({
          description: "Maximum response size in characters",
          default: 5000,
        })
      ),
    }),
    execute: async (
      toolCallId: string,
      params: { url: string; max_size?: number }
    ) => {
      const { url, max_size = 5000 } = params

      const command = `curl -sL --max-time 30 "${url}" | head -c ${max_size}`

      console.log(`🌐 Fetch: ${url}`)

      try {
        const result = await executeShellCommand(command, config)

        if (result.exitCode === 0) {
          return createResult(result.stdout, {
            url,
            contentLength: result.stdout.length,
            truncated: result.stdout.length >= max_size,
          })
        } else {
          return createResult(
            `❌ Failed to fetch: ${result.stderr}`,
            {
              error: result.stderr,
              exitCode: result.exitCode,
              url,
            }
          )
        }
      } catch (error: any) {
        return createResult(`❌ Fetch error: ${error.message}`, {
          error: error.message,
          url,
        })
      }
    },
  }

  // Tool: Fetch web content using r.jina.ai (for JS-rendered pages)
  const jinaFetchTool: AgentTool<typeof JinaFetchSchema> = {
    name: "jina_fetch",
    label: "Fetch with Jina AI",
    description:
      "Fetch content from a URL using r.jina.ai service. This tool is great for JavaScript-rendered pages " +
      "that regular curl/fetch cannot handle. Returns clean, AI-friendly Markdown content. " +
      "Use this when regular fetch returns empty or incomplete content.",
    parameters: Type.Object({
      url: Type.String({
        description: "URL to fetch (e.g., https://example.com/article)",
      }),
      max_length: Type.Optional(
        Type.Number({
          description: "Maximum content length to return (default: 10000)",
          default: 10000,
        })
      ),
    }),
    execute: async (
      toolCallId: string,
      params: { url: string; max_length?: number }
    ) => {
      const { url, max_length = 10000 } = params

      // Use r.jina.ai to fetch and convert to markdown
      const jinaUrl = `https://r.jina.ai/${url}`
      const command = `curl -sL --max-time 45 "${jinaUrl}" | head -c ${max_length}`

      console.log(`🔮 Jina fetch: ${url}`)

      try {
        const result = await executeShellCommand(command, config)

        if (result.exitCode === 0) {
          const content = result.stdout
          
          // Check if jina.ai returned an error
          if (content.includes("Failed to fetch") || content.includes("Error:")) {
            return createResult(
              `❌ Jina AI could not fetch this page: ${content.substring(0, 200)}`,
              {
                error: "Jina AI fetch failed",
                url,
                jinaUrl,
              }
            )
          }

          return createResult(content, {
            url,
            jinaUrl,
            contentLength: content.length,
            truncated: content.length >= max_length,
          })
        } else {
          return createResult(
            `❌ Failed to fetch via Jina AI: ${result.stderr}`,
            {
              error: result.stderr,
              exitCode: result.exitCode,
              url,
              jinaUrl,
            }
          )
        }
      } catch (error: any) {
        return createResult(`❌ Jina fetch error: ${error.message}`, {
          error: error.message,
          url,
          jinaUrl,
        })
      }
    },
  }

  return [executeCommandTool, curlTool, fetchTool, jinaFetchTool]
}

// TypeBox schemas
const ExecuteCommandSchema = Type.Object({
  command: Type.String(),
  description: Type.Optional(Type.String()),
})

const CurlSchema = Type.Object({
  url: Type.String(),
  method: Type.Optional(Type.String()),
  headers: Type.Optional(Type.Array(Type.String())),
  data: Type.Optional(Type.String()),
  timeout: Type.Optional(Type.Number()),
  silent: Type.Optional(Type.Boolean()),
})

const FetchSchema = Type.Object({
  url: Type.String(),
  max_size: Type.Optional(Type.Number()),
})

const JinaFetchSchema = Type.Object({
  url: Type.String(),
  max_length: Type.Optional(Type.Number()),
})

/**
 * Create shell tools with custom working directory (e.g., space path)
 */
export function createShellToolsForSpace(
  spacePath: string,
  extraConfig: Omit<ShellToolsConfig, "cwd"> = {}
): AgentTool<any>[] {
  return createShellTools({
    ...extraConfig,
    cwd: spacePath,
  })
}
