import type { Tool } from "ai"
import { z } from "zod"
import { Bash } from "@eidos.space/bashkit"
import type { DataSpace } from "@/packages/core/data-space"
import type { BuiltinContext, BuiltinCallback } from "@eidos.space/bashkit"
import { WebFetchBuiltin, WebSearchBuiltin } from "../web-tools"
import { withPermission } from "../../permission/wrapper"
import { createBashPermissionRule } from "./permission"
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
  /** Exa API key for web-search builtin. When set, the web-search builtin is registered. */
  exaApiKey?: string
  /** If provided, the bash tool will be wrapped with permission checks. */
  permissionServer?: any
  sessionId?: string
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
    if (args.length === 1) {
      return cli.helpFor(args[0]!) + "\n\n" + PROPERTY_HELP_TEXT
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
  const {
    skillsDir,
    sessionsDir,
    dataspace,
    extraInstructions,
    vfsDir,
    env,
    exaApiKey,
    permissionServer,
    sessionId,
  } = options

  const customBuiltins: Record<string, BuiltinCallback> = {}

  if (dataspace) {
    const runner = new EidosRunner(dataspace)
    customBuiltins.eidos = (ctx: BuiltinContext) => runner.run(ctx)
  }

  const webFetchRunner = new WebFetchBuiltin()
  customBuiltins["web-fetch"] = (ctx: BuiltinContext) => webFetchRunner.run(ctx)

  const webSearchRunner = new WebSearchBuiltin(exaApiKey)
  customBuiltins["web-search"] = (ctx: BuiltinContext) =>
    webSearchRunner.run(ctx)

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

MOUNTS: /agent/skills, /agent/sessions, /tmp (all read-write).

BUILTINS:
  web-fetch <url>              Extract clean page content (HTML→markdown). For raw API responses, use curl instead.
  web-search <query>           Search web via Exa → JSON to stdout${
    dataspace
      ? `
  eidos <resource> <action>    Data operations — run any resource alone for sub-action help

DATA DISCOVERY — eidos resources (run any for sub-action help):
  search    Full-text search across all docs & journals
  tree      Navigate the workspace hierarchy
  table     Manage table schemas and metadata
  record    Work with table rows (query, insert, update, delete)
  column    Manage table fields and their types
  view      Manage table display configurations
  doc       Standalone documents in the workspace tree
  subdoc    Markdown content attached to table records
  journal   Daily journal entries
  extension Custom code: scripts, blocks, tools

EXPLORATION WORKFLOW:
  eidos search <keyword> → eidos subdoc read <table> <id> > /tmp/x.md
  → cat /tmp/x.md (review) → file-read /tmp/x.md (get hashes) → file-edit /tmp/x.md

CRITICAL: hex table ID, never create "title" column, boolean = 1/0,
  raw SQL accepts plain ID or tb_<id>.`
      : ""
  }

PYTHON: restricted sandbox — prefer bash tools (jq, awk). Use python3
only for math/datetime/complex logic beyond bash.
${extraInstructions ? `\n\n${extraInstructions}` : ""}`

  let tool: Tool = {
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

  if (permissionServer && sessionId) {
    tool = withPermission(tool, {
      toolName: "bash",
      sessionId,
      permissionServer,
      requiresPermission: createBashPermissionRule(bash),
    })
  }

  return { tool, bash }
}
