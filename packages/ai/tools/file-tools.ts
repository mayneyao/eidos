import type { Tool } from "ai"
import type { IFileSystem } from "just-bash"
import { z } from "zod"

const MAX_READ_LENGTH = 50000

/**
 * Compute a 2-character content hash for a line.
 * Deterministic, fast, and collision-resistant enough for edit validation.
 */
function lineHash(line: string): string {
  let h = 0
  for (let i = 0; i < line.length; i++) {
    h = (h * 31 + line.charCodeAt(i)) | 0
  }
  const n = h >>> 0
  return n.toString(36).slice(-2).padStart(2, "0")
}

const readParams = z.object({
  path: z
    .string()
    .describe(
      "File path (e.g. /dataspace/my-doc, /journals/2024-01-15.md, /extensions/my-ext.ts)"
    ),
  offset: z
    .number()
    .optional()
    .describe(
      "Start line number (0-based, inclusive). Omit to start from the beginning."
    ),
  limit: z
    .number()
    .optional()
    .describe("Max number of lines to return. Omit to return all lines."),
})

const writeParams = z.object({
  path: z.string().describe("File path to write"),
  content: z.string().describe("Full file content to write (plain text)"),
})

const editParams = z.object({
  path: z.string().describe("File path to edit"),
  edits: z
    .array(
      z.object({
        start_line: z
          .number()
          .describe("First line to replace (1-based, from read output)"),
        end_line: z.number().describe("Last line to replace (inclusive)"),
        hashes: z
          .string()
          .describe(
            "Concatenated 2-character hashes of the lines being replaced. These are the strings BEFORE the '>' in each line of the file-read output (e.g. if lines start with 'ab>1|', 'cd>2|', then hashes should be 'abcd')."
          ),
        new_content: z
          .string()
          .describe(
            "Replacement text for the line range (plain text, no hashes)"
          ),
      })
    )
    .describe(
      "Array of edit operations to apply. Each specifies a line range identified by hashes."
    ),
})

/**
 * Create read/write/edit tools that operate directly on the virtual filesystem.
 * Implements the "hashline" pattern: read returns content tagged with line hashes,
 * edit references those hashes to validate and apply targeted line-range changes.
 */
export function createFileTools(fs: IFileSystem): Record<string, Tool> {
  const read: Tool = {
    description:
      "Read a file from the virtual filesystem. Each line is tagged with a 2-char hash and line number: `ab>12|line content`. " +
      "Use offset/limit to read specific line ranges. " +
      "Paths: /dataspace/ (knowledge base), /journals/ (day pages), /extensions/ (extension source), /skills/ (skill files).",
    inputSchema: readParams,
    execute: async (args) => {
      const { path, offset, limit } = args as z.infer<typeof readParams>
      try {
        const content = await fs.readFile(path)
        const lines = content.split("\n")
        const start = offset ?? 0
        const end = limit != null ? start + limit : lines.length
        const slice = lines.slice(start, end)
        const totalLines = lines.length

        const hashlines = slice
          .map((line, i) => `${lineHash(line)}>${start + i + 1}|${line}`)
          .join("\n")

        if (hashlines.length > MAX_READ_LENGTH) {
          return {
            content:
              hashlines.slice(0, MAX_READ_LENGTH) + "\n\n[Output truncated]",
            totalLines,
            from: start,
            to: Math.min(end, totalLines),
          }
        }

        return {
          content: hashlines,
          totalLines,
          from: start,
          to: Math.min(end, totalLines),
        }
      } catch (err: any) {
        return {
          error:
            err.code === "ENOENT" ? `File not found: ${path}` : err.message,
        }
      }
    },
  }

  const write: Tool = {
    description:
      "Write a file to the virtual filesystem (creates or overwrites). " +
      "For /dataspace/ docs, auto-creates doc nodes if the path doesn't exist. " +
      "For /journals/, creates/updates day pages (YYYY-MM-DD.md).",
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
      "Edit specific line ranges in a file using hashline references. " +
      "Each edit specifies start_line, end_line, the expected hashes (from a previous read), " +
      "and the new content. The tool verifies hashes match before applying. " +
      "Multiple edits can be applied in one call and are processed top-to-bottom.",
    inputSchema: editParams,
    execute: async (args) => {
      const { path, edits } = args as z.infer<typeof editParams>
      try {
        const currentContent = await fs.readFile(path)
        let lines = currentContent.split("\n")

        for (const edit of edits) {
          const { start_line, end_line, hashes, new_content } = edit
          const startIdx = start_line - 1
          const endIdx = end_line - 1

          if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
            return {
              error: `Invalid line range ${start_line}-${end_line} (file has ${lines.length} lines)`,
            }
          }

          // Verify hashes match the current lines
          const expectedHashes = lines
            .slice(startIdx, endIdx + 1)
            .map(lineHash)
            .join("")
          if (expectedHashes !== hashes) {
            return {
              error:
                `Hash mismatch at lines ${start_line}-${end_line}. Expected hashes: "${expectedHashes}". ` +
                `Please ensure you are concatenating ONLY the 2-character prefixes (the part before '>') from the latest file-read output. ` +
                `You can use the expected hashes provided here to retry if you are sure about the line range.`,
            }
          }

          // Apply the edit
          const newLines = new_content.split("\n")
          lines = [
            ...lines.slice(0, startIdx),
            ...newLines,
            ...lines.slice(endIdx + 1),
          ]
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
