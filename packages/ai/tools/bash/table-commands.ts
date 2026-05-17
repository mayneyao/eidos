import { z } from "zod"
import type { DataSpace } from "@/packages/core/data-space"
import type { Bash } from "just-bash"
import { LightCli } from "./light-cli"
import * as handlers from "./table-handlers"

const PROPERTY_HELP_TEXT = `--property format by field type (values are merged with existing):
  select/multi-select: {"options": [{"name": "...", "color": "..."}]}  — uses options, NOT optionConfig!
  number:             {"format": "number"|"percent"|"currency", "showAs": "number"|"bar"|"ring"}
  formula:            {"formula": "price * quantity", "displayType": "number", "numberConfig": {...}}
    - Stored as a SQLite generated column: GENERATED ALWAYS AS (<formula>). Must be valid SQLite SQL.
    - Reference columns by table_column_name (lowercase, underscores) — NOT the display name.
    - String concat uses || (not +). Cast: CAST(expr AS TEXT|INTEGER|REAL). Common fns: UPPER, LOWER, COALESCE, SUBSTR, REPLACE.
    - displayType: text, number, date, checkbox, select, multi-select, url, rating, file
    - displayType=select/multi-select uses optionConfig (NOT options): {"optionConfig": {"colorMap": [{"value": "...", "color": "..."}]}}
  link:               {"linkTableName": "...", "linkColumnName": "..."}
  lookup:             {"linkFieldId": "...", "lookupTargetFieldId": "..."}
  text:               {"enableEmbedding": true}
  file:               {"proxyUrl": "..."}
  checkbox/date/rating/url: {} (no configurable properties)

--type allowed values: text, number, checkbox, date, url, rating, file, select, multi-select, formula, link, lookup, created-time, created-by, last-edited-time, last-edited-by`

export function registerTableCommands(bash: Bash, ds: DataSpace) {
  const cli = new LightCli("eidos")

  // ==========================================
  // Command Registrations with Inline Schemas
  // ==========================================

  cli
    .command("table create <name>")
    .schema(
      z.object({
        name: z
          .string({
            required_error: "Table name is required as the 1st argument",
          })
          .min(1, "Table name cannot be empty")
          .refine((val) => !val.startsWith("-"), {
            message:
              'Invalid table name: cannot start with "-". Did you mean to use a positional argument?',
          })
          .refine((val) => /^[a-zA-Z_]/.test(val), {
            message: "Table name must start with a letter or underscore",
          })
          .refine((val) => /^[a-zA-Z0-9_]+$/.test(val), {
            message:
              "Table name must only contain alphanumeric characters and underscores",
          }),
      })
    )
    .description("Create a new table")
    .action(async (data) => {
      return handlers.tableCreate(ds, data.name)
    })

  cli
    .command("table delete <table_id>")
    .schema(
      z.object({
        tableId: z
          .string({
            required_error: "Table ID is required as the 1st argument",
          })
          .min(1, "Table ID cannot be empty"),
      })
    )
    .description("Delete a table")
    .action(async (data) => {
      return handlers.tableDelete(ds, data.tableId)
    })

  cli
    .command("column create <table_id> <name> [type]")
    .option("-p, --property <property>", "JSON properties of the column")
    .option("-t, --type <type>", "Column data type")
    .schema(
      z.object({
        tableId: z
          .string({
            required_error: "Table ID is required as the 1st argument",
          })
          .min(1),
        name: z
          .string({
            required_error: "Column name is required as the 2nd argument",
          })
          .min(1),
        type: z
          .enum(
            [
              "text",
              "number",
              "checkbox",
              "date",
              "url",
              "rating",
              "file",
              "select",
              "multi-select",
              "formula",
              "link",
              "lookup",
              "created-time",
              "created-by",
              "last-edited-time",
              "last-edited-by",
            ],
            {
              errorMap: (issue, ctx) => {
                if (issue.code === z.ZodIssueCode.invalid_enum_value) {
                  return {
                    message: `Invalid type "${ctx.data}". Allowed types: text, number, checkbox, date, url, rating, file, select, multi-select, formula, link, lookup, created-time, created-by, last-edited-time, last-edited-by`,
                  }
                }
                return { message: ctx.defaultError }
              },
            }
          )
          .optional()
          .default("text"),
        property: z
          .string()
          .optional()
          .refine(
            (val) => {
              if (!val) return true
              try {
                JSON.parse(val)
                return true
              } catch {
                return false
              }
            },
            { message: "Property must be a valid JSON string" }
          ),
      })
    )
    .description("Create a new column in a table")
    .action(async (data) => {
      return handlers.columnCreate(
        ds,
        data.tableId,
        data.name,
        data.type,
        data.property
      )
    })

  cli
    .command("column delete <table_id> <column_name>")
    .schema(
      z.object({
        tableId: z
          .string({
            required_error: "Table ID is required as the 1st argument",
          })
          .min(1),
        columnName: z
          .string({
            required_error: "Column name is required as the 2nd argument",
          })
          .min(1),
      })
    )
    .description("Delete a column from a table")
    .action(async (data) => {
      return handlers.columnDelete(ds, data.tableId, data.columnName)
    })

  cli
    .command("column update <table_id> <column_name>")
    .option("-n, --name <name>", "New name for the column")
    .option("-t, --type <type>", "New type for the column")
    .option("-p, --property <property>", "New JSON properties for the column")
    .schema(
      z
        .object({
          tableId: z
            .string({
              required_error: "Table ID is required as the 1st argument",
            })
            .min(1),
          columnName: z
            .string({
              required_error: "Column name is required as the 2nd argument",
            })
            .min(1),
          name: z.string().optional(),
          type: z
            .enum(
              [
                "text",
                "number",
                "checkbox",
                "date",
                "url",
                "rating",
                "file",
                "select",
                "multi-select",
                "formula",
                "link",
                "lookup",
                "created-time",
                "created-by",
                "last-edited-time",
                "last-edited-by",
              ],
              {
                errorMap: (issue, ctx) => {
                  if (issue.code === z.ZodIssueCode.invalid_enum_value) {
                    return {
                      message: `Invalid type "${ctx.data}". Allowed types: text, number, checkbox, date, url, rating, file, select, multi-select, formula, link, lookup, created-time, created-by, last-edited-time, last-edited-by`,
                    }
                  }
                  return { message: ctx.defaultError }
                },
              }
            )
            .optional(),
          property: z
            .string()
            .optional()
            .refine(
              (val) => {
                if (!val) return true
                try {
                  JSON.parse(val)
                  return true
                } catch {
                  return false
                }
              },
              { message: "Property must be a valid JSON string" }
            ),
        })
        .refine((data) => data.name || data.type || data.property, {
          message:
            "At least one of --name, --type, or --property is required to perform an update",
        })
    )
    .description("Update an existing column's name, type, or property")
    .action(async (data) => {
      return handlers.columnUpdate(
        ds,
        data.tableId,
        data.columnName,
        data.name,
        data.type,
        data.property
      )
    })

  cli
    .command("view create <table_id> <name> [type]")
    .schema(
      z.object({
        tableId: z
          .string({
            required_error: "Table ID is required as the 1st argument",
          })
          .min(1),
        name: z
          .string({
            required_error: "View name is required as the 2nd argument",
          })
          .min(1),
        type: z
          .string()
          .default("grid")
          .refine(
            (val) => {
              return (
                ["grid", "gallery", "doc_list", "kanban"].includes(val) ||
                val.startsWith("ext__")
              )
            },
            {
              message:
                "View type must be grid, gallery, doc_list, kanban, or ext__<plugin_id>",
            }
          ),
      })
    )
    .description("Create a new view for a table")
    .action(async (data) => {
      return handlers.viewCreate(ds, data.tableId, data.name, data.type)
    })

  cli
    .command("view list <table_id>")
    .schema(
      z.object({
        tableId: z
          .string({
            required_error: "Table ID is required as the 1st argument",
          })
          .min(1),
      })
    )
    .description("List all views for a table")
    .action(async (data) => {
      return handlers.viewList(ds, data.tableId)
    })

  cli
    .command("view delete <table_id> <view_id>")
    .schema(
      z.object({
        tableId: z
          .string({
            required_error: "Table ID is required as the 1st argument",
          })
          .min(1),
        viewId: z
          .string({ required_error: "View ID is required as the 2nd argument" })
          .min(1),
      })
    )
    .description("Delete a view from a table")
    .action(async (data) => {
      return handlers.viewDelete(ds, data.tableId, data.viewId)
    })

  cli
    .command("view update <table_id> <view_id>")
    .option("-n, --name <name>", "New name of the view")
    .option("-t, --type <type>", "New type of the view")
    .option("-q, --query <query>", "SQL SELECT query of the view")
    .option("-p, --property <property>", "New JSON properties of the view")
    .schema(
      z
        .object({
          tableId: z
            .string({
              required_error: "Table ID is required as the 1st argument",
            })
            .min(1),
          viewId: z
            .string({
              required_error: "View ID is required as the 2nd argument",
            })
            .min(1),
          name: z.string().optional(),
          type: z
            .string()
            .optional()
            .refine(
              (val) => {
                if (!val) return true
                return (
                  ["grid", "gallery", "doc_list", "kanban"].includes(val) ||
                  val.startsWith("ext__")
                )
              },
              {
                message:
                  "View type must be grid, gallery, doc_list, kanban, or ext__<plugin_id>",
              }
            ),
          query: z.string().optional(),
          property: z
            .string()
            .optional()
            .refine(
              (val) => {
                if (!val) return true
                try {
                  JSON.parse(val)
                  return true
                } catch {
                  return false
                }
              },
              { message: "Property must be a valid JSON string" }
            ),
        })
        .refine(
          (data) => data.name || data.type || data.query || data.property,
          {
            message:
              "At least one of --name, --type, --query, or --property is required to perform an update",
          }
        )
    )
    .description("Update an existing view's name, type, query, or properties")
    .action(async (data) => {
      return handlers.viewUpdate(
        ds,
        data.tableId,
        data.viewId,
        data.name,
        data.type,
        data.query,
        data.property
      )
    })

  cli
    .command("record query <table_id>")
    .option("-w, --where <where>", "JSON condition for lookup")
    .option("-o, --orderBy <orderBy>", "JSON order by config")
    .option("-t, --take <take>", "Limit number of records")
    .option("-s, --skip <skip>", "Offset number of records")
    .option("-q, --query <query>", "Complete SQL query for advanced select")
    .schema(
      z
        .object({
          tableId: z
            .string({
              required_error: "Table ID is required as the 1st argument",
            })
            .min(1),
          query: z.string().optional(),
          where: z
            .string()
            .optional()
            .refine(
              (val) => {
                if (!val) return true
                try {
                  JSON.parse(val)
                  return true
                } catch {
                  return false
                }
              },
              { message: "--where must be a valid JSON string" }
            ),
          orderBy: z
            .string()
            .optional()
            .refine(
              (val) => {
                if (!val) return true
                try {
                  JSON.parse(val)
                  return true
                } catch {
                  return false
                }
              },
              { message: "--orderBy must be a valid JSON string" }
            ),
          take: z
            .string()
            .optional()
            .transform((val) => (val ? parseInt(val, 10) : undefined))
            .refine((val) => val === undefined || !isNaN(val), {
              message: "--take must be a valid number",
            }),
          skip: z
            .string()
            .optional()
            .transform((val) => (val ? parseInt(val, 10) : undefined))
            .refine((val) => val === undefined || !isNaN(val), {
              message: "--skip must be a valid number",
            }),
        })
        .refine(
          (data) => {
            if (data.query) {
              return !(
                data.where ||
                data.orderBy ||
                data.take !== undefined ||
                data.skip !== undefined
              )
            }
            return true
          },
          {
            message:
              "--query is exclusive with --where, --orderBy, --take, and --skip",
          }
        )
    )
    .description("Query records from a table")
    .action(async (data) => {
      return handlers.recordQuery(
        ds,
        data.tableId,
        data.query,
        data.where,
        data.orderBy,
        data.take,
        data.skip
      )
    })

  cli
    .command("record insert <table_id>")
    .option("-d, --data <data>", "JSON record or array to insert")
    .schema(
      z.object({
        tableId: z
          .string({
            required_error: "Table ID is required as the 1st argument",
          })
          .min(1),
        data: z
          .string()
          .optional()
          .refine(
            (val) => {
              if (!val) return true
              try {
                JSON.parse(val)
                return true
              } catch {
                return false
              }
            },
            { message: "--data must be a valid JSON string" }
          ),
      })
    )
    .description("Insert record(s) into a table (stdin or --data)")
    .action(async (data, ctx) => {
      return handlers.recordInsert(ds, data.tableId, ctx, data.data)
    })

  cli
    .command("record update <table_id>")
    .option("-w, --where <where>", "JSON condition to select records to update")
    .option("-d, --data <data>", "JSON properties to update")
    .schema(
      z.object({
        tableId: z
          .string({
            required_error: "Table ID is required as the 1st argument",
          })
          .min(1),
        where: z
          .string()
          .optional()
          .refine(
            (val) => {
              if (!val) return true
              try {
                JSON.parse(val)
                return true
              } catch {
                return false
              }
            },
            { message: "--where must be a valid JSON string" }
          ),
        data: z
          .string()
          .optional()
          .refine(
            (val) => {
              if (!val) return true
              try {
                JSON.parse(val)
                return true
              } catch {
                return false
              }
            },
            { message: "--data must be a valid JSON string" }
          ),
      })
    )
    .description("Update record(s) in a table (stdin or --where/--data)")
    .action(async (data, ctx) => {
      return handlers.recordUpdate(ds, data.tableId, ctx, data.where, data.data)
    })

  cli
    .command("record delete <table_id>")
    .option("-w, --where <where>", "JSON condition for record deletion")
    .schema(
      z.object({
        tableId: z
          .string({
            required_error: "Table ID is required as the 1st argument",
          })
          .min(1),
        where: z
          .string()
          .optional()
          .refine(
            (val) => {
              if (!val) return true
              try {
                JSON.parse(val)
                return true
              } catch {
                return false
              }
            },
            { message: "Where condition must be a valid JSON string" }
          ),
      })
    )
    .description("Delete record(s) from a table")
    .action(async (data, ctx) => {
      return handlers.recordDelete(ds, data.tableId, ctx, data.where)
    })

  bash.registerCommand({
    name: "eidos",
    trusted: true,
    execute: async (args: string[], ctx?: any) => {
      try {
        if (args.length === 0) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: cli.help() + "\n\n" + PROPERTY_HELP_TEXT,
          }
        }
        return await cli.parse(args, ctx)
      } catch (err: any) {
        return { exitCode: 1, stdout: "", stderr: err.message || String(err) }
      }
    },
  })
}
