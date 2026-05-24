import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { promisify } from "node:util"
import { rgPath } from "@vscode/ripgrep"

const execFileAsync = promisify(execFile)

/**
 * Get the executable path for ripgrep
 * Handles the case where the binary is unpacked from ASAR
 */
async function getExecutablePath(): Promise<string> {
  let finalPath = rgPath

  // In production with asar, the binary might be in app.asar.unpacked
  if (finalPath.includes("app.asar")) {
    const unpackedPath = finalPath.replace("app.asar", "app.asar.unpacked")
    try {
      await fs.stat(unpackedPath)
      finalPath = unpackedPath
    } catch {
      // Fallback to original path if unpacked doesn't exist
    }
  }

  return finalPath
}

export async function searchWithRg(
  query: string,
  searchPaths: string[]
): Promise<string[]> {
  const binPath = await getExecutablePath()

  // Parse query into keywords (VSCode-style)
  const keywords = query.split(/\s+/).filter((k) => k.length > 0)
  if (keywords.length === 0) {
    return []
  }

  // Build glob patterns for all keywords
  // Multiple --iglob patterns work as AND conditions in ripgrep (case-insensitive)
  const globArgs = keywords.flatMap((keyword) => ["--iglob", `*${keyword}*`])

  try {
    // Run ripgrep
    // --files: Print each file that would be searched without actually performing the search
    // --iglob: Multiple case-insensitive patterns require ALL to match (AND logic, VSCode-style)
    const { stdout } = await execFileAsync(
      binPath,
      ["--files", ...globArgs, ...searchPaths],
      {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    )

    return stdout.split("\n").filter(Boolean)
  } catch (error: any) {
    // ripgrep returns exit code 1 if no matches found, which execFile treats as error
    if (error.code === 1) {
      return []
    }
    console.error("Search failed:", error)
    return []
  }
}

export interface ContentSearchResult {
  filePath: string
  lineNumber: number
  content: string
}

/**
 * Search file contents using ripgrep (content search mode).
 * Returns matching lines with file paths and line numbers.
 */
export async function searchContentWithRg(
  query: string,
  searchPaths: string[],
  options?: { maxResults?: number; filePattern?: string }
): Promise<ContentSearchResult[]> {
  const binPath = await getExecutablePath()

  const keywords = query.split(/\s+/).filter((k) => k.length > 0)
  if (keywords.length === 0) {
    return []
  }

  const maxResults = options?.maxResults ?? 50

  // Build args: case-insensitive, line numbers, JSON output
  const args = ["-i", "-n", "--json"]
  if (options?.filePattern) {
    args.push("-g", options.filePattern)
  }
  args.push("--max-count", String(maxResults))
  args.push(keywords[0], ...searchPaths)

  try {
    const { stdout } = await execFileAsync(binPath, args, {
      maxBuffer: 10 * 1024 * 1024,
    })

    const results: ContentSearchResult[] = []

    for (const line of stdout.split("\n")) {
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg.type === "match") {
          const content: string = msg.data.lines.text
          // For multi-keyword queries, post-filter: all keywords must be present
          if (keywords.length > 1) {
            const lowerContent = content.toLowerCase()
            const allMatch = keywords
              .slice(1)
              .every((k) => lowerContent.includes(k.toLowerCase()))
            if (!allMatch) continue
          }
          results.push({
            filePath: msg.data.path.text,
            lineNumber: msg.data.line_number,
            content: content.trimEnd(),
          })
          if (results.length >= maxResults) break
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    return results
  } catch (error: any) {
    if (error.code === 1) {
      return []
    }
    console.error("Content search failed:", error)
    return []
  }
}
