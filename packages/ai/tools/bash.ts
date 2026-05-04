import type { Tool } from "ai"
import { z } from "zod"
import { Bash, InMemoryFs } from "just-bash"
import type { DataSpace } from "@/packages/core/data-space"
import { EidosTreeFs } from "./eidos-tree-fs"

const MAX_OUTPUT_LENGTH = 30000

const bashParams = z.object({
  command: z.string().describe("The bash command to execute"),
})

/**
 * Create a sandboxed bash tool.
 * When dataspace is provided, uses EidosTreeFs as the root filesystem.
 */
export function createBashTool(dataspace?: DataSpace): Tool {
  let bashInstance: Bash | null = null

  async function getBash(): Promise<Bash> {
    if (bashInstance) return bashInstance

    let fs: InMemoryFs | EidosTreeFs = new InMemoryFs()
    if (dataspace) {
      const treeFs = new EidosTreeFs(dataspace)
      await treeFs.healthCheck()
      fs = treeFs
    }

    bashInstance = new Bash({
      fs,
      cwd: "/",
      executionLimits: {
        maxCommandCount: 10000,
        maxLoopIterations: 100,
      },
      defenseInDepth: false,
    })
    return bashInstance
  }

  const description = dataspace
    ? `Execute a bash command in a sandboxed virtual filesystem backed by the user's knowledge base. The root / contains the user's tree nodes (folders, docs, tables). Use ls, cat, find to explore. Supports pipes, redirections, variables, and common Unix tools (grep, sed, awk, find, sort, uniq, wc, head, tail, cat, echo, etc.).`
    : `Execute a bash command in a sandboxed virtual environment with an in-memory filesystem. Supports pipes, redirections, variables, subshells, and common Unix tools (grep, sed, awk, find, sort, uniq, wc, head, tail, cat, echo, etc.). The working directory is /workspace.`

  return {
    description,
    inputSchema: bashParams,
    execute: async (args) => {
      const { command } = args as z.infer<typeof bashParams>
      console.log("[tool:bash] ▶", { command: command.slice(0, 200) })
      try {
        const bash = await getBash()
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

/** Default bash tool without dataspace (no /dataspace mount) */
export const bashTool = createBashTool()
