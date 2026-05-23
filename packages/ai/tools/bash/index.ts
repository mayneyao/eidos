import type { Tool } from "ai"
import { z } from "zod"
import { Bash } from "@eidos.space/bashkit"
import type { DataSpace } from "@/packages/core/data-space"
import type { BuiltinContext, BuiltinCallback } from "@eidos.space/bashkit"
import { LightCli } from "./light-cli"
import { registerTableCommands, PROPERTY_HELP_TEXT } from "./table-commands"
import { registerJournalCommands } from "./journal-commands"
import { registerExtensionCommands } from "./extension-commands"
import { registerTreeCommands } from "./tree-commands"
import { registerDocCommands } from "./doc-commands"
import { registerSearchCommands } from "./search-commands"
import { registerSubdocCommands } from "./subdoc-commands"

const MAX_OUTPUT_LENGTH = 100000

export interface BashToolOptions {
  skillsDir?: string
  sessionsDir?: string
  /** Per-session VFS directory — mounted at /tmp/ for persistence across restarts */
  vfsDir?: string
  dataspace?: DataSpace
  extraInstructions?: string
  env?: Record<string, string>
}

const bashParams = z.object({
  command: z.string().describe("The bash command to execute"),
})

class EidosRunner {
  constructor(private ds: DataSpace) {}

  async run(ctx: BuiltinContext): Promise<string> {
    const cli = new LightCli("eidos")
    registerTableCommands(cli, this.ds)
    registerJournalCommands(cli, this.ds)
    registerExtensionCommands(cli, this.ds)
    registerTreeCommands(cli, this.ds)
    registerDocCommands(cli, this.ds)
    registerSearchCommands(cli, this.ds)
    registerSubdocCommands(cli, this.ds)

    const args = ctx.argv
    if (args.length === 0) {
      return cli.help() + "\n\n" + PROPERTY_HELP_TEXT
    }

    const execCtx = { stdin: ctx.stdin }
    const result = await cli.parse(args, execCtx)
    if (result.exitCode !== 0 && result.stderr) {
      return result.stderr
    }
    return result.stdout
  }
}

export function createBashTool(options: BashToolOptions = {}): {
  tool: Tool
  bash: Bash
} {
  const { skillsDir, sessionsDir, dataspace, extraInstructions, vfsDir, env } =
    options

  const customBuiltins: Record<string, BuiltinCallback> = {}

  if (dataspace) {
    const runner = new EidosRunner(dataspace)
    customBuiltins.eidos = (ctx: BuiltinContext) => runner.run(ctx)
  }

  const mountPaths = [skillsDir, sessionsDir, vfsDir].filter(
    Boolean
  ) as string[]

  const bash = new Bash({
    python: true,
    network: { allowAll: true },
    maxCommands: 10000,
    maxLoopIterations: 100,
    env,
    customBuiltins,
    allowedMountPaths: mountPaths,
  })
  if (skillsDir) {
    bash.mount(skillsDir, "/agent/skills", true)
  }
  if (sessionsDir) {
    bash.mount(sessionsDir, "/agent/sessions", true)
  }
  if (vfsDir) {
    bash.mount(vfsDir, "/tmp", true)
  }

  const description = `Execute a bash command in a sandboxed filesystem.

AVAILABLE MOUNTS:
- /agent/skills/    — skill files (read-write).
- /agent/sessions/  — agent session files (.meta.json, .jsonl) (read-write).
- /tmp/             — persistent session scratch space (read-write).

EIDOS CLI (built-in):
Use 'eidos' with subcommands directly in bash pipelines.
DATA DISCOVERY — start here to find what tables/records exist:
  eidos search <keyword>             # Full-text search across all docs & journals (titles + content)
  eidos tree                         # Nested tree with childCount (depth 1 by default, expand with --depth or --parent)
  eidos tree --depth 3               # Deeper nesting
  eidos tree --parent <id>           # Subtree of a specific node
  eidos table list                   # List tables (id + name)
  eidos table info <id>              # Table schema: id, name, fields, views
${
  dataspace
    ? `
TABLE SUB-DOCUMENTS (Markdown content for table records):
  eidos subdoc list <table>                        # List all sub-docs under a table
  eidos subdoc read <table> <record_id>           # Read markdown (accepts dashed/undashed ID)
  eidos subdoc write <table> <record_id>           # Create/update via stdin (auto-expands)
  eidos subdoc delete <table> <record_id>          # Soft-delete a sub-document

  SUBDOC PIPELINE:
    1. eidos subdoc read <table> <record_id> > /tmp/doc.md
    2. file-read + file-edit on /tmp/doc.md
    3. cat /tmp/doc.md | eidos subdoc write <table> <record_id>

STANDALONE DOCS (root/folder docs, NOT table sub-documents):
  eidos doc create <name>                                 # Create (stdin for content)
  eidos doc create <name> --parent <folder_id>             # Create in folder
  eidos doc get <id>                                       # Read markdown
  eidos doc update <id>                                    # Update content via stdin
  eidos doc delete <id>                                    # Soft-delete

MUTATION:
  eidos record query <table> -q "SELECT ..."               # Query records
  eidos record insert <table> -d '{"title":"x"}'           # Single insert
  echo '[...]' | eidos record insert <table> --stdin       # Batch insert via pipe
  eidos record update <table> -w '{"id":"x"}' -d '{...}'   # Update records
  eidos record delete <table> -w '{"id":"x"}'              # Delete records
  eidos table create <name>                                 # Create table
  eidos table delete <table_id>                             # Delete table
  eidos column create <table> <name> -t text               # Add column
  eidos column delete <table> <column_name>                # Delete column
  eidos column update <table> <column_name> -n newName    # Update column
  eidos view create <table> <name> grid                    # Create view
  eidos view list <table>                                   # List views
  eidos view update <table> <view_id> -n "New" -q "..."    # Update view
  eidos journal list [--limit 30]                              # List journal entries
  eidos journal get <YYYY-MM-DD>                               # Read journal entry
  eidos journal write <YYYY-MM-DD> <content>                   # Write journal entry (stdin)
  eidos extension create <slug> <name> -t script|block     # Create extension (compiles TS→JS via V3)
  eidos extension list                                         # List extensions
  eidos extension get <slug>                                   # Get extension code + meta
  eidos extension write <slug>                                 # Update code (compiles + validates)

  EXTENSION WORKFLOW:
    1. Write TypeScript code with "export const meta = {...}" and export functions
    2. cat code.ts | eidos extension create my-tool "My Tool" -t script   # Create + compile
    3. eidos extension get my-tool                                        # Verify code and meta
    4. cat updated.ts | eidos extension write my-tool                      # Update + recompile
    Compile errors are returned in full — use them to fix your code.

    TABLE-SCOPED ACTION (restrict to specific table):
      export const meta = {
        type: "tableAction",
        funcName: "myAction",
        tableAction: {
          name: "My Action",
          description: "Does something",
          tableId: "<table_id>"    // omit to show on ALL tables
        }
      }`
    : "No dataspace — eidos commands unavailable."
}

EIDOS PIPELINE PATTERN:
  eidos search "invoice" | jq '.[].recordId'                     # Find matching records
  eidos record query <table> -q "SELECT * ..." | jq '...' | python3 script.py
  curl ... | jq -s '.' | eidos record insert <table> --stdin     # Batch insert via pipe

EXPLORATION WORKFLOW:
  1. eidos search <keyword>                        → find by keyword
  2. eidos subdoc read <table> <id> > /tmp/x.md    → export
  3. file-read + file-edit on /tmp/x.md             → review & edit
  4. cat /tmp/x.md | eidos subdoc write <table> <id>  → commit

CRITICAL: Always use the 32-char hex table ID, NOT the display name.
Every table has a built-in 'title' field — never create a column named "title".
In raw SQL queries, use either the plain ID or tb_<id> — both are accepted.
Boolean/checkbox values: use 1 or 0 (true/false are auto-converted).

DATA EXCHANGE:
- Pipe JSON directly: echo '[{...}]' | eidos record insert <table> --stdin
- Write large data to /tmp/ files with file tools, then process in bash.
${extraInstructions ? `\n\n${extraInstructions}` : ""}`

  const tool: Tool = {
    description,
    inputSchema: bashParams,
    execute: async (args) => {
      const { command } = args as z.infer<typeof bashParams>
      console.log("[tool:bash] ▶", { command: command.slice(0, 200) })
      try {
        const result = await bash.execute(command)
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

  return { tool, bash }
}
