import os from "node:os"
import path from "node:path"
import type { Tool } from "ai"
import { z } from "zod"
import { Bash, InMemoryFs, MountableFs, ReadWriteFs } from "just-bash"
import type { DataSpace } from "@/packages/core/data-space"
import { EidosAgentFs, ExtensionsAgentFs, JournalsAgentFs } from "../agent-fs"
import { registerTableCommands } from "./table-commands"

const MAX_OUTPUT_LENGTH = 30000

export interface BashToolContext {
  dataspace: DataSpace
  /** Additional instructions to append to the tool description */
  extraInstructions?: string
}

const bashParams = z.object({
  command: z.string().describe("The bash command to execute"),
})

/**
 * Build the composite filesystem for the AI agent:
 *
 *   /            → InMemoryFs (base, mostly unused)
 *   /dataspace/  → EidosAgentFs (read-only SQLite virtual fs)
 *   /skills/     → ReadWriteFs backed by ~/.agents/skills/ (read-write)
 *   /journals/   → JournalsAgentFs (day pages from eidos__docs)
 *   /extensions/ → ExtensionsAgentFs (extensions from eidos__extensions, read-only)
 */
export async function buildAgentFs(ctx: BashToolContext) {
  const { dataspace } = ctx

  const treeFs = new EidosAgentFs(dataspace)
  await treeFs.healthCheck()

  const journalsFs = new JournalsAgentFs(dataspace)
  await journalsFs.healthCheck()

  const extensionsFs = new ExtensionsAgentFs(dataspace)
  await extensionsFs.healthCheck()

  const skillsDir = path.join(os.homedir(), ".agents", "skills")
  const skillFs = new ReadWriteFs({ root: skillsDir })

  const fs = new MountableFs({
    base: new InMemoryFs(),
    mounts: [
      { mountPoint: "/skills", filesystem: skillFs },
      { mountPoint: "/dataspace", filesystem: treeFs },
      { mountPoint: "/journals", filesystem: journalsFs },
      { mountPoint: "/extensions", filesystem: extensionsFs },
    ],
  })

  return fs
}

/**
 * Create a sandboxed bash tool.
 * Accepts a pre-built MountableFs (from buildAgentFs) to share with file-tools.
 */
export function createBashTool(
  fs: InstanceType<typeof MountableFs>,
  extraInstructions?: string,
  dataspace?: DataSpace
): Tool {
  const bash = new Bash({
    fs,
    cwd: "/",
    executionLimits: {
      maxCommandCount: 10000,
      maxLoopIterations: 100,
    },
    network: {
      dangerouslyAllowFullInternetAccess: true,
      allowedMethods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "PATCH",
        "HEAD",
        "OPTIONS",
      ],
      denyPrivateRanges: true,
    },
    defenseInDepth: false,
  })

  if (dataspace) {
    registerTableCommands(bash, dataspace)
  }

  const description = `Execute a bash command in a sandboxed filesystem. Available mounts:
  /dataspace/  — structured tables and documents. Tables appear as .table files (read-only) with a same-named directory containing their child docs (.md, writable).

CRITICAL: Under a table directory, the .md filename IS the record title — they are the same string. "My Task.md" means title="My Task". Never transform or sanitize the filename (no kebab-case, no lowercase). Before writing, always ls the directory to see existing titles. Writing to an existing .md updates that record's doc. Writing to a new .md creates a new record. Deleting a .md removes only the doc, not the record. To delete a record, use eidos-record-delete.
  /skills/     — skills directory at ~/.agents/skills/ (read-write, create/edit/delete skills)
  /journals/   — journal day pages as YYYY-MM-DD.md files (read-write, create/update journals)
  /extensions/ — installed extensions as .ts/.tsx files organized by slug (read-write, create/edit/delete extensions)
Use ls, cat, rg (ripgrep) to explore. Prefer using rg for searching rather than find. Supports pipes, redirections, variables, and common Unix tools.
Custom built-in commands:
  eidos-table-create <name> - Create a new table.
  eidos-column-create <table_id> <name> <type> - Add a column to a table.
  eidos-record-query <table_id> [options] - Query records. (e.g., eidos-record-query 8444... --where '{"status":"done"}')
  eidos-record-insert <table_id> - Insert records from stdin. (e.g., cat data.json | eidos-record-insert 8444...)
  eidos-record-update <table_id> - Update records from stdin. (e.g., echo '[{"where":{"id":1}, "data":{"s":"ok"}}]' | eidos-record-update 8444...)
  eidos-record-delete <table_id> [options] - Delete records. (e.g., eidos-record-delete 8444... --where '{"id":1}')
Note: Always use the 'id' found in the .table file (e.g., 844482a7...) for table_id. The physical table name (tb_xxx) is also supported but not recommended.
${extraInstructions ? `\n\n${extraInstructions}` : ""}`

  return {
    description,
    inputSchema: bashParams,
    execute: async (args) => {
      const { command } = args as z.infer<typeof bashParams>
      console.log("[tool:bash] ▶", { command: command.slice(0, 200) })
      try {
        const result = await bash.exec(command)
        const stdout =
          result.stdout.length > MAX_OUTPUT_LENGTH
            ? result.stdout.slice(0, MAX_OUTPUT_LENGTH) +
              "\n\n[Output truncated]"
            : result.stdout
        const stderr =
          result.stderr.length > MAX_OUTPUT_LENGTH
            ? result.stderr.slice(0, MAX_OUTPUT_LENGTH) +
              "\n\n[Output truncated]"
            : result.stderr
        console.log("[tool:bash] ✔", {
          exitCode: result.exitCode,
          stdoutLen: stdout.length,
          stderrLen: stderr.length,
        })
        return { stdout, stderr, exitCode: result.exitCode }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[tool:bash] ✖", msg)
        return { error: msg }
      }
    },
  }
}
