import type { DataSpace } from "@/packages/core/data-space"
import type { Bash } from "just-bash"
import { parseArgs } from "./utils"

const normalizeTableId = (id: string) => {
  if (!id) return id
  return id.startsWith("tb_") ? id.slice(3) : id
}

export function registerTableCommands(bash: Bash, ds: DataSpace) {
  // ── eidos-table-create ──────────────────────────────────────────────
  bash.registerCommand({
    name: "eidos-table-create",
    trusted: true,
    execute: async (args: string[]) => {
      try {
        const name = args[0]
        if (!name)
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Usage: eidos-table-create <name>",
          }
        const res = await ds.schema.createTable({ name, fields: [] })
        return {
          exitCode: 0,
          stdout: JSON.stringify({ id: res.id, name: res.name }),
          stderr: "",
        }
      } catch (err: any) {
        return { exitCode: 1, stdout: "", stderr: err.message || String(err) }
      }
    },
  })

  // ── eidos-column-create ──────────────────────────────────────────────
  bash.registerCommand({
    name: "eidos-column-create",
    trusted: true,
    execute: async (args: string[]) => {
      try {
        const [rawTableId, name, type] = args
        const tableId = normalizeTableId(rawTableId)
        if (!tableId || !name || !type) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Usage: eidos-column-create <table_id> <name> <type>",
          }
        }
        const columnName = name.toLowerCase().replace(/[^a-z0-9]/g, "_")
        await ds.schema.addField(tableId, {
          name,
          columnName,
          type: type as any,
        })
        return {
          exitCode: 0,
          stdout: "Column created successfully",
          stderr: "",
        }
      } catch (err: any) {
        return { exitCode: 1, stdout: "", stderr: err.message || String(err) }
      }
    },
  })

  // ── eidos-record-query ───────────────────────────────────────────────
  bash.registerCommand({
    name: "eidos-record-query",
    trusted: true,
    execute: async (args: string[]) => {
      try {
        const { positionals, flags } = parseArgs(args)
        const tableId = normalizeTableId(positionals[0])
        if (!tableId)
          return {
            exitCode: 1,
            stdout: "",
            stderr:
              "Usage: eidos-record-query <table_id> [--where json] [--take 100]",
          }

        const where = flags.where ? JSON.parse(flags.where) : undefined
        const orderBy = flags.orderBy ? JSON.parse(flags.orderBy) : undefined
        const take = flags.take ? parseInt(flags.take, 10) : 100
        const skip = flags.skip ? parseInt(flags.skip, 10) : 0

        const res = await ds
          .table(tableId)
          .findMany({ where, orderBy, take, skip })
        return {
          exitCode: 0,
          stdout: JSON.stringify(res, null, 2),
          stderr: "",
        }
      } catch (err: any) {
        return { exitCode: 1, stdout: "", stderr: err.message || String(err) }
      }
    },
  })

  // ── eidos-record-insert ──────────────────────────────────────────────
  bash.registerCommand({
    name: "eidos-record-insert",
    trusted: true,
    execute: async (args: string[], ctx: any) => {
      try {
        const tableId = normalizeTableId(args[0])
        if (!tableId)
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Usage: eidos-record-insert <table_id>",
          }
        if (!ctx.stdin)
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Missing stdin. Pipe JSON array to this command.",
          }

        const records = JSON.parse(ctx.stdin.trim() || "[]")
        if (!Array.isArray(records))
          return {
            exitCode: 1,
            stdout: "",
            stderr: "stdin must be a JSON array of records",
          }

        const res = await ds.table(tableId).createMany({ data: records })
        return {
          exitCode: 0,
          stdout: JSON.stringify({ count: res.count }),
          stderr: "",
        }
      } catch (err: any) {
        return { exitCode: 1, stdout: "", stderr: err.message || String(err) }
      }
    },
  })

  // ── eidos-record-update ──────────────────────────────────────────────
  bash.registerCommand({
    name: "eidos-record-update",
    trusted: true,
    execute: async (args: string[], ctx: any) => {
      try {
        const tableId = normalizeTableId(args[0])
        if (!tableId)
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Usage: eidos-record-update <table_id>",
          }
        if (!ctx.stdin)
          return {
            exitCode: 1,
            stdout: "",
            stderr:
              "Missing stdin. Pipe JSON array of {where, data} to this command.",
          }

        const updates = JSON.parse(ctx.stdin.trim() || "[]")
        if (!Array.isArray(updates))
          return {
            exitCode: 1,
            stdout: "",
            stderr: "stdin must be a JSON array of {where, data}",
          }

        let total = 0
        for (const op of updates) {
          const res = await ds
            .table(tableId)
            .updateMany({ where: op.where, data: op.data })
          total += res.count
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify({ count: total }),
          stderr: "",
        }
      } catch (err: any) {
        return { exitCode: 1, stdout: "", stderr: err.message || String(err) }
      }
    },
  })

  // ── eidos-record-delete ──────────────────────────────────────────────
  bash.registerCommand({
    name: "eidos-record-delete",
    trusted: true,
    execute: async (args: string[], ctx: any) => {
      try {
        const { positionals, flags } = parseArgs(args)
        const tableId = normalizeTableId(positionals[0])
        if (!tableId)
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Usage: eidos-record-delete <table_id> [--where json]",
          }

        const whereJson = flags.where ? flags.where : ctx.stdin
        if (!whereJson)
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Missing where condition. Use --where or pipe it.",
          }

        const where = JSON.parse(whereJson.trim() || "{}")
        const res = await ds.table(tableId).deleteMany({ where })
        return {
          exitCode: 0,
          stdout: JSON.stringify({ count: res.count }),
          stderr: "",
        }
      } catch (err: any) {
        return { exitCode: 1, stdout: "", stderr: err.message || String(err) }
      }
    },
  })
}
