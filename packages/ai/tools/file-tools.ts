import type { Tool } from "ai"
import type { IFileSystem } from "just-bash"
import { z } from "zod"
import crypto from "node:crypto"

const MAX_READ_LENGTH = 50000

/**
 * 16-character alphabet for hashes.
 * Deliberately excludes visually confusable letters and vowels.
 */
const HASH_ALPHABET = "ZPMQVRWSNKTXJBYH"

/**
 * Compute a 2-character content hash for a line.
 * Uses Node.js crypto and line index salting for non-alphanumeric lines to prevent collisions.
 */
function computeLineHash(index: number, line: string): string {
  const content = line.replace(/\r/g, "").trimEnd()
  // Check if the line has any alphanumeric characters
  const isSignificant = /[a-zA-Z0-9]/.test(content)

  const hash = crypto.createHash("md5")
  hash.update(content)
  if (!isSignificant) {
    // Seed with index for lines that are only whitespace or punctuation
    hash.update(index.toString())
  }

  const digest = hash.digest()
  // Map the first two bytes to our 16-char alphabet
  const h1 = digest[0]! % 16
  const h2 = digest[1]! % 16

  return HASH_ALPHABET[h1]! + HASH_ALPHABET[h2]!
}

/**
 * Parse an anchor like "10#BH" into line number and hash.
 */
function parseAnchor(anchor: string): { line: number; hash: string } {
  const match = anchor.trim().match(/^(\d+)#([ZPMQVRWSNKTXJBYH]{2})$/)
  if (!match) {
    throw new Error(
      `Invalid anchor format: "${anchor}". Expected "LINE#HASH" (e.g., "10#BH").`
    )
  }
  return {
    line: parseInt(match[1]!, 10),
    hash: match[2]!,
  }
}

const readParams = z.object({
  path: z
    .string()
    .describe(
      "File path to read (e.g. /dataspace/my-doc, /journals/2024-01-15.md)"
    ),
  offset: z
    .number()
    .optional()
    .describe("Start line number (0-based, inclusive). Omit for beginning."),
  limit: z
    .number()
    .optional()
    .describe("Max number of lines to return. Omit for all lines."),
})

const writeParams = z.object({
  path: z.string().describe("File path to write"),
  content: z.string().describe("Full file content to write"),
})

const editParams = z.object({
  path: z.string().describe("File path to edit"),
  edits: z
    .array(
      z.object({
        op: z
          .enum(["replace", "append", "prepend"])
          .describe(
            "Operation type: replace a range, or append/prepend relative to an anchor."
          ),
        pos: z
          .string()
          .describe("Target anchor from read output (e.g. '10#BH')."),
        end: z
          .string()
          .optional()
          .describe(
            "End anchor for range replacement (inclusive). Required for multi-line 'replace'."
          ),
        lines: z
          .array(z.string())
          .describe(
            "New content lines to insert/replace (as an array of strings)."
          ),
      })
    )
    .describe("List of edit operations to apply in sequence."),
})

export function createFileTools(fs: IFileSystem): Record<string, Tool> {
  const read: Tool = {
    description:
      "Read a file with hashline anchors: `LINE#HASH:content`. " +
      "Use these anchors to identify lines in the `file-edit` tool. " +
      "Paths: /dataspace/, /journals/, /extensions/, /skills/.",
    inputSchema: readParams,
    execute: async (args) => {
      const { path, offset, limit } = args as z.infer<typeof readParams>
      try {
        const content = await fs.readFile(path)
        const lines = content.split("\n")
        const start = offset ?? 0
        const end = limit != null ? start + limit : lines.length
        const slice = lines.slice(start, end)

        const formatted = slice
          .map((line, i) => {
            const lineNum = start + i + 1
            const hash = computeLineHash(lineNum, line)
            return `${lineNum}#${hash}:${line}`
          })
          .join("\n")

        const result = {
          content:
            formatted.length > MAX_READ_LENGTH
              ? formatted.slice(0, MAX_READ_LENGTH) + "\n\n[Output truncated]"
              : formatted,
          totalLines: lines.length,
          from: start + 1,
          to: Math.min(end, lines.length),
        }

        return result
      } catch (err: any) {
        return {
          error:
            err.code === "ENOENT" ? `File not found: ${path}` : err.message,
        }
      }
    },
  }

  const write: Tool = {
    description: "Write full content to a file (creates or overwrites).",
    inputSchema: writeParams,
    execute: async (args) => {
      const { path, content } = args as z.infer<typeof writeParams>
      try {
        await fs.writeFile(path, content)
        return { success: true, path }
      } catch (err: any) {
        return { error: err.message }
      }
    },
  }

  const edit: Tool = {
    description:
      "Edit a file using hash-anchored operations. " +
      "Anchors (e.g. '10#BH') ensure you are editing the correct version of the file. " +
      "If the hash mismatches, the file has changed and you must re-read it. " +
      "Operations are applied in order.",
    inputSchema: editParams,
    execute: async (args) => {
      const { path, edits } = args as z.infer<typeof editParams>
      try {
        const currentContent = await fs.readFile(path)
        let lines = currentContent.split("\n")

        // We apply edits in sequence.
        // Note: For multi-edit robustness, we should ideally validate all anchors against
        // a single snapshot first, but here we follow the standard sequential application.
        for (const editOp of edits) {
          const startAnchor = parseAnchor(editOp.pos)
          const startIdx = startAnchor.line - 1

          if (startIdx < 0 || startIdx >= lines.length) {
            return {
              error: `Line ${startAnchor.line} is out of range (file has ${lines.length} lines).`,
            }
          }

          const actualHash = computeLineHash(startAnchor.line, lines[startIdx]!)
          if (actualHash !== startAnchor.hash) {
            return {
              error: `Hash mismatch at line ${startAnchor.line}. Expected "${actualHash}", but you provided "${startAnchor.hash}". The file content has changed. Please re-read the file.`,
            }
          }

          if (editOp.op === "replace") {
            let endIdx = startIdx
            if (editOp.end) {
              const endAnchor = parseAnchor(editOp.end)
              endIdx = endAnchor.line - 1
              if (endIdx < startIdx || endIdx >= lines.length) {
                return {
                  error: `End anchor line ${endAnchor.line} is invalid or out of range.`,
                }
              }
              const actualEndHash = computeLineHash(
                endAnchor.line,
                lines[endIdx]!
              )
              if (actualEndHash !== endAnchor.hash) {
                return {
                  error: `Hash mismatch at end line ${endAnchor.line}. Expected "${actualEndHash}".`,
                }
              }
            }
            lines.splice(startIdx, endIdx - startIdx + 1, ...editOp.lines)
          } else if (editOp.op === "append") {
            lines.splice(startIdx + 1, 0, ...editOp.lines)
          } else if (editOp.op === "prepend") {
            lines.splice(startIdx, 0, ...editOp.lines)
          }
        }

        await fs.writeFile(path, lines.join("\n"))
        return { success: true, path }
      } catch (err: any) {
        return {
          error:
            err.code === "ENOENT" ? `File not found: ${path}` : err.message,
        }
      }
    },
  }

  return { "file-read": read, "file-write": write, "file-edit": edit }
}
