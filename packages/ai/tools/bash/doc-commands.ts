import { z } from "zod"
import type { DataSpace } from "@/packages/core/data-space"
import { LightCli } from "./light-cli"
import * as dh from "./doc-handlers"

export function registerDocCommands(cli: LightCli, ds: DataSpace) {
  cli
    .command("doc get <id>")
    .schema(
      z.object({
        id: z.string({ required_error: "Doc ID is required" }).min(1),
      })
    )
    .description("Get the full markdown content of a standalone document")
    .action(async (data) => dh.docGet(ds, data.id))

  cli
    .command("doc create <name>")
    .option("-p, --parent <id>", "Create under a folder")
    .schema(
      z.object({
        name: z.string({ required_error: "Document name is required" }).min(1),
        parent: z.string().optional(),
      })
    )
    .description(
      "Create a standalone document. Content via stdin.\n" +
        "Root:     echo '# doc' | eidos doc create MyDoc\n" +
        "In folder: echo '# doc' | eidos doc create MyDoc --parent <folder_id>"
    )
    .action(async (data, ctx) => {
      const content = ctx?.stdin
      if (!content)
        return {
          exitCode: 1,
          stdout: "",
          stderr: "No content. Pipe via stdin.",
        }
      return dh.docCreate(ds, data.name, { parentId: data.parent, content })
    })

  cli
    .command("doc update <id>")
    .schema(
      z.object({
        id: z.string({ required_error: "Doc ID is required" }).min(1),
      })
    )
    .description("Update a standalone document's markdown. Content via stdin.")
    .action(async (data, ctx) => {
      const content = ctx?.stdin
      if (!content)
        return {
          exitCode: 1,
          stdout: "",
          stderr: "No content. Pipe via stdin.",
        }
      return dh.docUpdateStandalone(ds, data.id, content)
    })

  cli
    .command("doc delete <id>")
    .schema(
      z.object({
        id: z.string({ required_error: "Doc ID is required" }).min(1),
      })
    )
    .description("Soft-delete a standalone document")
    .action(async (data) => dh.docDelete(ds, data.id))
}
