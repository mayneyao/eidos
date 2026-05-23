import { z } from "zod"
import type { DataSpace } from "@/packages/core/data-space"
import { LightCli } from "./light-cli"
import * as sh from "./subdoc-handlers"

export function registerSubdocCommands(cli: LightCli, ds: DataSpace) {
  cli
    .command("subdoc list <table_id>")
    .schema(
      z.object({
        tableId: z.string({ required_error: "Table ID is required" }).min(1),
      })
    )
    .description("List all sub-documents under a table")
    .action(async (data) => sh.subdocList(ds, data.tableId))

  cli
    .command("subdoc read <table_id> <record_id>")
    .schema(
      z.object({
        tableId: z.string({ required_error: "Table ID is required" }).min(1),
        recordId: z.string({ required_error: "Record ID is required" }).min(1),
      })
    )
    .description(
      "Read a sub-document's full markdown content (accepts dashed/undashed ID)"
    )
    .action(async (data) => sh.subdocRead(ds, data.tableId, data.recordId))

  cli
    .command("subdoc write <table_id> <record_id>")
    .schema(
      z.object({
        tableId: z.string({ required_error: "Table ID is required" }).min(1),
        recordId: z.string({ required_error: "Record ID is required" }).min(1),
      })
    )
    .description(
      "Create/update a sub-document. Auto-expands record. Content via stdin. Accepts dashed/undashed ID."
    )
    .action(async (data, ctx) => {
      const content = ctx?.stdin
      if (content == null || content === "") {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "No content. Pipe via stdin.",
        }
      }
      return sh.subdocWrite(ds, data.tableId, data.recordId, content)
    })

  cli
    .command("subdoc delete <table_id> <record_id>")
    .schema(
      z.object({
        tableId: z.string({ required_error: "Table ID is required" }).min(1),
        recordId: z.string({ required_error: "Record ID is required" }).min(1),
      })
    )
    .description("Soft-delete a sub-document (accepts dashed/undashed ID)")
    .action(async (data) => sh.subdocDelete(ds, data.tableId, data.recordId))
}
