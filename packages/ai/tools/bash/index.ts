import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Tool } from "ai"
import { z } from "zod"
import {
  Bash,
  InMemoryFs,
  MountableFs,
  ReadWriteFs,
} from "@eidos.space/just-bash"
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
    javascript: true,
    python: true,
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

  const description = `Execute a bash command in a sandboxed filesystem.

Available Mounts:
- /dataspace/  — read-only .table (schema) files, and directories containing records as .md files (write/edit to update).
- /skills/     — skill files (read-write).
- /journals/   — journal entries as YYYY-MM-DD.md files (read-write).
- /extensions/ — extensions as .ts/.tsx files (read-write).

CRITICAL MOUNT & FILE RULES:
1. Under a table directory, the .md filename is exactly the record title (e.g., "My Task.md" -> title="My Task"). Do NOT sanitize/kebab-case. Writing to a new .md inserts a record, writing to an existing .md updates it. Deleting a .md only removes its doc content, not the record. To delete a record, use 'eidos record delete'.
2. Use 'ls', 'cat', 'rg' to explore. Prefer 'rg' (ripgrep) over 'find'.
3. WRITING FILES/SCRIPTS: Do NOT use complex inline shell heredocs (e.g., cat << 'EOF' or python3 << 'EOF') to write scripts/files in bash. Always write files or scripts using your environment's file writing tools (like write_to_file) to avoid heredoc syntax, escaping, and truncation errors.

SANDBOX ARCHITECTURE PHILOSOPHY (Tool Composition & File Data Exchange):
- Decoupled Orchestration: The optimal design in this sandboxed WASM environment is "Unix Pipeline & Decoupling".
- Data Exchange via Files: Do NOT pass huge JSON arguments via shell command-line strings (like --data) or write complex inline heredoc scripts. Instead:
  1. Write scripts (Python/JS) and data payloads (JSON) as physical files (e.g. /tmp/raw.json, /tmp/transform.py) using your environment's file-writing tools.
  2. Use standard Unix redirection and piping to flow data between sandboxed tools:
     python3 /tmp/transform.py < /tmp/raw.json > /tmp/clean.json
     eidos record insert <table_id> < /tmp/clean.json
  3. This completely avoids shell escaping errors, buffer limits, and process constraints, ensuring 100% execution success!

WASM Runtime Constraints (Python & JavaScript):
- Python (python/python3) and JS (js-exec) run in highly restricted WASM sandboxes.
- NO PROCESSES / THREADS (EMSCRIPTEN LIMITATION): Emscripten does not support process creation or threading. Do NOT use subprocess, multiprocessing, threading, os.system, os.popen, os.fork inside scripts. Calling external binaries or the 'eidos' CLI from within Python/JS scripts is impossible and will crash.
- NO NETWORK ACCESS: Network modules (requests, urllib, socket, fetch) are completely disabled.
- NO PACKAGE INSTALLS: pip, npm, poetry, etc., are unavailable. Only standard libraries are supported (e.g., json, math, datetime, re).

Eidos CLI & Database Tips:
- CRITICAL: Always use the 32-char hexadecimal table ID (found in the .table file or returned by table create) for all database operations, NEVER the table's display name.
- Every table has a built-in 'title' field — never create a column named "title".
- eidos table create <name> (positional <name>, NOT --name)
- eidos column update <table_id> (to change field type or set formula/options)
- BATCH INSERT (HIGHLY RECOMMENDED): eidos record insert supports piping a JSON array of records. To batch insert, write your data into a JSON file (e.g. records.json) and pipe it directly:
    cat records.json | eidos record insert <table_id>
  Do NOT write scripts that recursively call 'eidos record insert' via subprocesses.
- eidos record insert/update (Single):
  * Insert: eidos record insert <table_id> --data '{"title": "Task", "score": 100}'
  * Update: eidos record update <table_id> --where '{"id": "123"}' --data '{"score": 150}'
- eidos record query <table_id>: Supports two mutually exclusive modes:
  * Raw SQL (highly recommended): --query "SELECT * FROM tb_xxx WHERE status = 'Done' ORDER BY priority ASC"
  * Structured: --where '{"status":"Done"}' --take 20 --orderBy '{"priority":"asc"}'
  (Do NOT mix --query with other options)
- eidos view update <table_id> --query "<SQL>" --type <grid|gallery|doc_list|kanban> --name <str>

For full command list, run "eidos" with no arguments.
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
