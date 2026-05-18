import fs from "node:fs"
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
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true })
  }
  const skillFs = new ReadWriteFs({ root: skillsDir })

  const mountableFs = new MountableFs({
    base: new InMemoryFs(),
    mounts: [
      { mountPoint: "/skills", filesystem: skillFs },
      { mountPoint: "/dataspace", filesystem: treeFs },
      { mountPoint: "/journals", filesystem: journalsFs },
      { mountPoint: "/extensions", filesystem: extensionsFs },
    ],
  })

  return mountableFs
}

/**
 * Create a sandboxed bash tool.
 * Accepts a pre-built MountableFs (from buildAgentFs) to share with file-tools.
 */
export function createBashTool(
  fs: InstanceType<typeof MountableFs>,
  extraInstructions?: string,
  dataspace?: DataSpace,
  secrets?: Record<string, string>
): Tool {
  const bash = new Bash({
    fs,
    cwd: "/",
    env: secrets,
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
      denyPrivateRanges: false,
    },
    defenseInDepth: false,
  })

  if (dataspace) {
    registerTableCommands(bash, dataspace)
  }

  const description = `Execute a bash command in a sandboxed filesystem. Available mounts:
  /dataspace/  — structured tables and documents. Tables appear as .table files (read-only). A same-named directory appears ONLY when the table has child documents (.md files, writable).

CRITICAL: Under a table directory, the .md filename IS the record title — they are the same string. "My Task.md" means title="My Task". Never transform or sanitize the filename (no kebab-case, no lowercase). Before writing, always ls the directory to see existing titles. Writing to an existing .md updates that record's doc. Writing to a new .md creates a new record. Deleting a .md removes only the doc, not the record. To delete a record, use eidos record delete.
  /skills/     — skills directory at ~/.agents/skills/ (read-write, create/edit/delete skills)
  /journals/   — journal day pages as YYYY-MM-DD.md files (read-write, create/update journals)
  /extensions/ — installed extensions as .ts/.tsx files organized by slug (read-write, create/edit/delete extensions)
Use ls, cat, rg (ripgrep) to explore. Prefer using rg for searching rather than find. Supports pipes, redirections, variables, and common Unix tools.

Table tips:
  - Every table has a built-in 'title' field — never create a column named "title".
  - eidos table create returns JSON with the table id — use it directly. The table appears in /dataspace/ immediately as <name>.table and <name>/.
  - cat /dataspace/<name>.table to see schema once the table appears.
  - eidos table create takes a positional <name> argument, NOT --name.
  - CRITICAL: All subsequent commands (column create/update, view create/list/delete/update, record query/insert/update/delete) REQUIRE the 32-character hexadecimal table ID (found in the .table file or returned by table create). Never use the table's display name.
  - eidos record insert and update support both direct option flags (highly recommended) and stdin piping:
    * Insert (via --data):   eidos record insert <table_id> --data '{"title": "Zerostack", "score": 135}'
    * Insert (via pipe):     echo '{"title": "Zerostack"}' | eidos record insert <table_id>
    * Update (via options):  eidos record update <table_id> --where '{"hn_id": "123"}' --data '{"score": 150}'
    * Update (via pipe):     echo '{"where": {"hn_id": "123"}, "data": {"score": 150}}' | eidos record update <table_id>
    (The data JSON can be either a single record object or a JSON array of records)
  - Available field types: text, number, checkbox, date, url, rating, file, select, multi-select, formula, link, lookup.
  - Use 'eidos column update' to change a field's type or set its property (formula, options, etc.).
  - Use 'eidos view update' to modify a view. Key flags:
    --query "<SQL>"   A SQL SELECT statement (NOT JSON). Only WHERE and ORDER BY — no LIMIT/OFFSET.
                      Example: --query "SELECT * FROM tb_xxx WHERE status = 'Done' ORDER BY priority DESC"
    --property <json> View display config (NOT field list or sort). Grid: {"fieldWidthMap":{},"freezeColumns":0}
    --name <str>      Rename the view
    --type <str>      Change view type (grid, gallery, doc_list, kanban)
    Use 'eidos view list <table_id>' to find view IDs.
  - eidos record query supports two modes (mutually exclusive):
    Structured: eidos record query <table_id> --where '{"status":"Done"}' --take 20 --orderBy '{"priority":"asc"}'
    Raw SQL:    eidos record query <table_id> --query "SELECT * FROM tb_xxx WHERE status = 'Done' ORDER BY priority ASC"
    Do NOT mix --query with --where/--orderBy/--take/--skip.

Custom built-in command:
  eidos <resource> <action> [args...] — table/column/view/record CRUD. Run "eidos" with no args for full usage.
    eidos table  create|delete ...
    eidos column create|update|delete ...
    eidos view   create|list|delete|update ...
    eidos record query|insert|update|delete ...
Note: Always use the 'id' found in the .table file (e.g., 844482a7...) for table_id, NOT the table name.
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
