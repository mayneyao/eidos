import { z } from "zod"
import type { DataSpace } from "@/packages/core/data-space"
import { LightCli } from "./light-cli"
import * as dh from "./doc-handlers"

export function registerDocCommands(cli: LightCli, ds: DataSpace) {
  cli
    .command("doc get <id>")
    .schema(
      z.object({
        id: z.string({ required_error: "Record/Doc ID is required" }).min(1),
      })
    )
    .description("Get the full markdown content of a document")
    .action(async (data) => dh.docGet(ds, data.id))

  cli
    .command("doc create <name>")
    .option("-p, --parent <id>", "Create under a folder")
    .option(
      "-t, --table <table_id>",
      "Create as sub-doc under a table (with new record)"
    )
    .option(
      "-i, --id <record_id>",
      "Link to existing record _id (use with --table, accepts dashed or undashed)"
    )
    .schema(
      z.object({
        name: z.string({ required_error: "Document name is required" }).min(1),
        parent: z.string().optional(),
        table: z.string().optional(),
        id: z.string().optional(),
      })
    )
    .description(
      "Create a document. Content via stdin.\n" +
        "Standalone:    eidos doc create MyDoc --content '...'\n" +
        "In folder:     eidos doc create MyDoc --parent <folder_id> --content '...'\n" +
        "Table sub-doc: eidos doc create MyDoc --table <table_id> --content '...'"
    )
    .action(async (data, ctx) => {
      const content = ctx?.stdin
      if (!content) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `No content. Pipe via stdin: echo "# hi" | eidos doc create MyDoc`,
        }
      }
      return dh.docCreate(ds, data.name, {
        parentId: data.parent,
        tableId: data.table,
        recordId: data.id,
        content,
      })
    })

  cli
    .command("doc update <id>")
    .option(
      "-t, --table <table_id>",
      "Parent table ID (creates sub-doc if record not yet expanded)"
    )
    .schema(
      z.object({
        id: z.string({ required_error: "Record/Doc ID is required" }).min(1),
        table: z.string().optional(),
      })
    )
    .description(
      "Update a document's markdown. Auto-creates sub-doc if record not yet expanded. Content via stdin."
    )
    .action(async (data, ctx) => {
      const content = ctx?.stdin
      if (!content) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `No content. Pipe via stdin: cat doc.md | eidos doc update <id> --table <table_id>`,
        }
      }
      return dh.docUpdate(ds, data.id, data.table ?? "", content)
    })

  cli
    .command("doc delete <id>")
    .schema(
      z.object({
        id: z.string({ required_error: "Record/Doc ID is required" }).min(1),
      })
    )
    .description("Soft-delete a document")
    .action(async (data) => dh.docDelete(ds, data.id))
}
