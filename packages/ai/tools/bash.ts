import type { Tool } from "ai"
import { z } from "zod"
import { Bash } from "just-bash"

const MAX_OUTPUT_LENGTH = 30000

let bashInstance: any = null

async function getBash() {
  if (bashInstance) return bashInstance
  bashInstance = new Bash({
    cwd: "/workspace",
    executionLimits: {
      maxCommandCount: 10000,
      maxLoopIterations: 100,
    },
  })
  return bashInstance
}

const bashParams = z.object({
  command: z.string().describe("The bash command to execute"),
})

export const bashTool: Tool = {
  description: `Execute a bash command in a sandboxed virtual environment with an in-memory filesystem. Supports pipes, redirections, variables, subshells, and common Unix tools (grep, sed, awk, find, sort, uniq, wc, head, tail, cat, echo, etc.). The working directory is /workspace.`,
  inputSchema: bashParams,
  execute: async (args) => {
    const { command } = args as z.infer<typeof bashParams>
    console.log("[tool:bash] ▶", { command: command.slice(0, 200) })
    try {
      const bash = await getBash()
      const result = await bash.exec(command)
      const stdout =
        result.stdout.length > MAX_OUTPUT_LENGTH
          ? result.stdout.slice(0, MAX_OUTPUT_LENGTH) + "\n\n[Output truncated]"
          : result.stdout
      const stderr =
        result.stderr.length > MAX_OUTPUT_LENGTH
          ? result.stderr.slice(0, MAX_OUTPUT_LENGTH) + "\n\n[Output truncated]"
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
