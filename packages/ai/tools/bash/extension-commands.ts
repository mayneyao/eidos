import { z } from "zod"
import type { DataSpace } from "@/packages/core/data-space"
import { LightCli } from "./light-cli"
import * as eh from "./extension-handlers"

export function registerExtensionCommands(cli: LightCli, ds: DataSpace) {
  cli
    .command("extension list")
    .description("List all extensions")
    .action(async () => eh.extensionList(ds))

  cli
    .command("extension get <slug>")
    .schema(
      z.object({
        slug: z.string({ required_error: "Extension slug is required" }).min(1),
      })
    )
    .description("Get extension code by slug")
    .action(async (data) => eh.extensionGet(ds, data.slug))

  cli
    .command("extension create <slug> <name>")
    .option("-t, --type <type>", "Extension type: script or block")
    .option("-d, --description <text>", "Description of the extension")
    .schema(
      z.object({
        slug: z.string({ required_error: "Extension slug is required" }).min(1),
        name: z.string({ required_error: "Extension name is required" }).min(1),
        type: z.string().optional().default("script"),
        description: z.string().optional(),
      })
    )
    .description(
      "Create a new extension. Code via stdin.\n" +
        'Example: cat script.ts | eidos extension create my-tool "My Tool" -t script'
    )
    .action(async (data, ctx) => {
      const code = ctx?.stdin
      if (!code) {
        return {
          exitCode: 1,
          stdout: "",
          stderr:
            'No code. Pipe via stdin: cat script.ts | eidos extension create my-tool "My Tool"',
        }
      }
      return eh.extensionCreate(ds, data.slug, {
        name: data.name,
        type: data.type,
        description: data.description,
        code,
      })
    })

  cli
    .command("extension write <slug>")
    .schema(
      z.object({
        slug: z.string({ required_error: "Extension slug is required" }).min(1),
      })
    )
    .description("Update an existing extension's code. Content via stdin.")
    .action(async (data, ctx) => {
      const code = ctx?.stdin
      if (!code) {
        return { exitCode: 1, stdout: "", stderr: "No code. Pipe via stdin." }
      }
      return eh.extensionWrite(ds, data.slug, code)
    })
}
