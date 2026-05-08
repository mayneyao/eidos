import type { Tool } from "ai"
import { z } from "zod"
import { Bash, InMemoryFs, MountableFs, ReadWriteFs } from "just-bash"
import type { DataSpace } from "@/packages/core/data-space"
import { EidosAgentFs } from "./eidos-agent-fs"

const MAX_OUTPUT_LENGTH = 30000

const MOUNT_PREFIX = "eidos:space:files:mount:"

export interface SpaceInfo {
  path: string
}

export interface BashToolContext {
  dataspace: DataSpace
  spaceInfo: SpaceInfo
}

const bashParams = z.object({
  command: z.string().describe("The bash command to execute"),
})

/**
 * Load mount configs from the KV store.
 * Returns an array of { name, physicalPath } entries.
 */
async function loadMounts(
  ds: DataSpace
): Promise<Array<{ name: string; physicalPath: string }>> {
  try {
    const records = await ds.kv.listWithPrefix({ prefix: MOUNT_PREFIX })
    return records
      .filter((r) => r.value)
      .map((r) => ({
        name: r.key.slice(MOUNT_PREFIX.length),
        physicalPath: r.value,
      }))
  } catch {
    return []
  }
}

/**
 * Build the composite filesystem for the AI agent:
 *
 *   /            → InMemoryFs (base, mostly unused)
 *   /dataspace/  → EidosAgentFs (read-only SQLite virtual fs)
 *   /~/          → ReadWriteFs (space physical directory)
 *   /@/<mount>/  → ReadWriteFs (each mounted external directory)
 */
async function buildAgentFs(ctx: BashToolContext) {
  const { dataspace, spaceInfo } = ctx

  const treeFs = new EidosAgentFs(dataspace)
  await treeFs.healthCheck()

  const mounts = await loadMounts(dataspace)

  const fs = new MountableFs({
    base: new InMemoryFs(),
    mounts: [
      { mountPoint: "/dataspace", filesystem: treeFs },
      {
        mountPoint: "/~",
        filesystem: new ReadWriteFs({ root: spaceInfo.path }),
      },
      ...mounts.map((m) => ({
        mountPoint: `/@/${m.name}`,
        filesystem: new ReadWriteFs({ root: m.physicalPath }),
      })),
    ],
  })

  return fs
}

/**
 * Create a sandboxed bash tool.
 * When ctx is provided, composes a MountableFs with:
 *   /dataspace/  → EidosAgentFs (knowledge base, read-only)
 *   /~/          → space physical directory (read-write)
 *   /@/<mount>/  → mounted external directories (read-write)
 */
export function createBashTool(ctx: BashToolContext): Tool {
  let bashInstance: Bash | null = null

  async function getBash(): Promise<Bash> {
    if (bashInstance) return bashInstance

    const fs = await buildAgentFs(ctx)

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

  const description = `Execute a bash command in a sandboxed filesystem. Available mounts:
  /dataspace/  — knowledge base: docs (writable via > and >>), mkdir supported, tables (read-only)
  /~/          — space project folder (read-write)
  /@/<name>/   — mounted external directories (read-write)
Use ls, cat, rg (ripgrep) to explore. Prefer using rg for searching rather than find. Supports pipes, redirections, variables, and common Unix tools.`

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
