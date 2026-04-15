import { spawn } from "node:child_process"

import {
  RawData,
  type RawDataAdapter,
  type RawDataResult,
} from "@eidos.space/rawdata"
import type Database from "better-sqlite3"

import { Inject, Injectable } from "../../../common/di"
import { DataPersisterService } from "../persistence/data-persister.service"

function buildEnrichedPath(): string {
  const segments: string[] = []
  const envPath = process.env.PATH || ""

  if (process.platform === "darwin") {
    segments.push(
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/local/sbin"
    )
  } else if (process.platform === "linux") {
    segments.push(
      "/usr/local/bin",
      "/usr/local/sbin",
      "/home/linuxbrew/.linuxbrew/bin"
    )
  }

  if (process.env.HOME) {
    segments.push(
      `${process.env.HOME}/.local/bin`,
      `${process.env.HOME}/.cargo/bin`,
      `${process.env.HOME}/.bun/bin`
    )
  }

  if (envPath) {
    segments.push(envPath)
  }

  return segments.join(process.platform === "win32" ? ";" : ":")
}

let enrichedPath: string | undefined

@Injectable()
export class CliRunnerService {
  constructor(
    @Inject(DataPersisterService) private dataPersister: DataPersisterService
  ) {}

  async runAdapter(
    spaceId: string,
    adapter: RawDataAdapter,
    args: Record<string, any>,
    store: RawData,
    db: Database.Database,
    sendLog?: (message: string) => void
  ): Promise<
    RawDataResult & {
      persisted: { agents: number; goods: number; relations: number }
    }
  > {
    console.log("[RawData] runCliAdapter:", {
      site: adapter.meta.site,
      name: adapter.meta.name,
    })

    if (!enrichedPath) {
      enrichedPath = buildEnrichedPath()
    }

    const browserContext = {
      navigate: async () => {
        throw new Error("Browser navigation not available in CLI adapter")
      },
      settle: async () => {
        throw new Error("Browser settle not available in CLI adapter")
      },
      evaluate: async () => {
        throw new Error("Browser evaluate not available in CLI adapter")
      },
      click: async () => {
        throw new Error("Browser click not available in CLI adapter")
      },
      fill: async () => {
        throw new Error("Browser fill not available in CLI adapter")
      },
    }

    const httpContext = {
      get: async (url: string, params?: Record<string, any>) => {
        const queryString = params
          ? "?" + new URLSearchParams(params).toString()
          : ""
        const fullUrl = url + queryString
        console.log("[RawData] HTTP GET (CLI):", fullUrl)

        const res = await fetch(fullUrl, {
          headers: { Accept: "application/json" },
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return await res.json()
      },

      post: async (
        url: string,
        body?: any,
        headers?: Record<string, string>
      ) => {
        console.log("[RawData] HTTP POST (CLI):", url)

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return await res.json()
      },
    }

    const execContext = {
      run: async (
        bin: string,
        args: string[],
        opts?: { timeout?: number; cwd?: string }
      ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        const cmdStr = `${bin} ${args.join(" ")}`
        console.log("[RawData] EXEC:", cmdStr)
        sendLog?.(`Executing command: ${cmdStr}`)
        const timeout = opts?.timeout ?? 60000

        return new Promise((resolve, reject) => {
          let proc: ReturnType<typeof spawn>
          try {
            proc = spawn(bin, args, {
              stdio: ["pipe", "pipe", "pipe"],
              env: { ...process.env, PATH: enrichedPath },
              cwd: opts?.cwd,
            })
          } catch (err: any) {
            if (err.code === "ENOENT" || err.errno === -2) {
              const friendly = `Command "${bin}" not found. Please install it and make sure it's available in your PATH.`
              sendLog?.(friendly)
              reject(new Error(friendly))
            } else {
              reject(err)
            }
            return
          }

          let stdout = ""
          let stderr = ""
          let killed = false

          const timer = setTimeout(() => {
            killed = true
            proc.kill()
            const msg = `命令执行超时 (${timeout}ms): ${cmdStr}`
            sendLog?.(msg)
            reject(new Error(msg))
          }, timeout)

          proc.stdout?.on("data", (data) => {
            stdout += data
          })

          proc.stderr?.on("data", (data) => {
            stderr += data
          })

          proc.on("error", (err: any) => {
            clearTimeout(timer)
            if (err.code === "ENOENT" || err.errno === -2) {
              const friendly = `Command "${bin}" not found. Please install it and make sure it's available in your PATH.`
              sendLog?.(friendly)
              reject(new Error(friendly))
            } else {
              reject(err)
            }
          })

          proc.on("close", (code) => {
            clearTimeout(timer)
            if (!killed) {
              if (code !== 0) {
                sendLog?.(
                  `Command exited with code ${code}: ${stderr.slice(0, 200)}`
                )
              } else {
                sendLog?.(`Command execution completed`)
              }
              resolve({ stdout, stderr, exitCode: code ?? 0 })
            }
          })
        })
      },
    }

    // Build incremental sync state
    const source = `${adapter.meta.site}/${adapter.meta.name}`
    const existingIds = new Set<string>()
    let cursorValue: string | number | undefined

    if (adapter.sync?.incremental) {
      const rows = db
        .prepare(
          `SELECT entity_id FROM data WHERE source = ? AND entity_type != '__meta__'`
        )
        .all(source) as { entity_id: string }[]
      for (const r of rows) existingIds.add(r.entity_id)

      const cursorRow = db
        .prepare(
          `SELECT data FROM data WHERE source = ? AND entity_type = '__meta__' AND entity_id = '__cursor__'`
        )
        .get(source) as { data: string } | undefined
      if (cursorRow?.data) {
        try {
          cursorValue = JSON.parse(cursorRow.data).value
        } catch {}
      }
    }

    const syncContext = {
      exists: (id: string) => existingIds.has(id),
      getCursor: () => cursorValue,
      setCursor: (value: string | number) => {
        cursorValue = value
        db.prepare(`
          INSERT INTO data (id, source, entity_type, entity_id, data, fetched_at)
          VALUES (?, ?, '__meta__', '__cursor__', ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at
        `).run(
          `${source}#__meta__#__cursor__`,
          source,
          JSON.stringify({ value }),
          Date.now()
        )
      },
    }

    const fetchContext = {
      args,
      browser: browserContext,
      http: httpContext,
      exec: execContext,
      sync: adapter.sync?.incremental ? syncContext : undefined,
      log: (message: string, ...logArgs: any[]) => {
        const line = [message, ...logArgs]
          .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
          .join(" ")
        console.log("[Adapter]", line)
        sendLog?.(line)
      },
    }

    // Step 1: Fetch raw data
    console.log("[RawData] === STEP 1: FETCH (CLI) ===")
    let rawEntities: any[] = []
    const startTime = Date.now()

    try {
      const fetchResult = await adapter.fetch(fetchContext)
      const elapsed = Date.now() - startTime

      if (!Array.isArray(fetchResult)) {
        console.error(
          "[RawData] Fetch returned non-array:",
          typeof fetchResult,
          fetchResult
        )
        throw new Error(`Expected array from fetch, got ${typeof fetchResult}`)
      }

      rawEntities = fetchResult
      console.log(
        `[RawData] Fetch completed in ${elapsed}ms, got ${rawEntities.length} entities`
      )

      if (rawEntities.length > 0) {
        console.log("[RawData] First entity sample:", {
          entityType: rawEntities[0]?.entityType,
          entityId: rawEntities[0]?.entityId,
          dataKeys: Object.keys(rawEntities[0]?.data || {}),
        })
      }
    } catch (fetchError) {
      console.error("[RawData] Fetch FAILED:", fetchError)
      throw fetchError
    }

    // Step 1.5: Store raw data
    console.log("[RawData] === STORING RAW DATA ===")
    try {
      await this.dataPersister.storeRawData(
        db,
        `${adapter.meta.site}/${adapter.meta.name}`,
        rawEntities
      )
    } catch (storeError) {
      console.error("[RawData] Failed to store raw data:", storeError)
    }

    // Step 2: Transform
    console.log("[RawData] === STEP 2: TRANSFORM ===")
    let agents: any[] = []
    let goods: any[] = []
    let relations: any[] = []

    if (adapter.transform) {
      console.log(
        "[RawData] adapter.transform exists, processing",
        rawEntities.length,
        "entities..."
      )
      for (let i = 0; i < rawEntities.length; i++) {
        const entity = rawEntities[i]
        try {
          console.log(
            `[RawData] Transforming entity ${i + 1}/${rawEntities.length}:`,
            entity.entityId
          )
          const result = await adapter.transform(entity)
          console.log(`[RawData] Entity ${i + 1} transformed:`, {
            agents: result.agents?.length || 0,
            goods: result.goods?.length || 0,
            relations: result.relations?.length || 0,
          })
          if (result.agents) agents.push(...result.agents)
          if (result.goods) goods.push(...result.goods)
          if (result.relations) relations.push(...result.relations)
        } catch (error) {
          console.error(
            `[RawData] Transform FAILED for entity ${entity.entityId}:`,
            error
          )
        }
      }
    } else {
      console.log("[RawData] No transform function, using raw data as goods")
      goods = rawEntities.map((e) => ({
        id: e.entityId,
        category: "unknown",
        title: e.data?.title || e.entityId,
        ...e.data,
      }))
    }

    console.log("[RawData] === TRANSFORM COMPLETE ===")
    console.log("[RawData] Total:", {
      agents: agents.length,
      goods: goods.length,
      relations: relations.length,
    })

    const allRows = [
      ...agents.map((a) => ({ ...a, _type: "agent" })),
      ...goods.map((g) => ({ ...g, _type: "good" })),
    ]
    const columns =
      allRows.length > 0
        ? Object.keys(allRows[0]).filter((k) => !k.startsWith("_"))
        : []
    const data = allRows.map((row) => {
      const filtered: Record<string, any> = {}
      for (const key of columns) {
        filtered[key] = row[key]
      }
      return filtered
    })

    const result: RawDataResult = {
      source: `${adapter.meta.site}/${adapter.meta.name}`,
      data,
      columns,
      adapter,
    }

    ;(result as any).agents = agents
    ;(result as any).goods = goods
    ;(result as any).relations = relations

    // Step 3: Persist
    console.log("[RawDataService] Persisting results...")
    const persisted = await this.dataPersister.persistResults(
      store,
      db,
      adapter,
      result
    )
    console.log("[RawDataService] Persist complete:", persisted)

    return { ...result, persisted }
  }
}
