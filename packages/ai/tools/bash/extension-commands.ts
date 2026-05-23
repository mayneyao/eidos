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
        slug: z
          .string({
            required_error: "Extension slug is required",
          })
          .min(1),
      })
    )
    .description("Get extension code by slug")
    .action(async (data) => eh.extensionGet(ds, data.slug))

  cli
    .command("extension write <slug>")
    .schema(
      z.object({
        slug: z
          .string({
            required_error: "Extension slug is required",
          })
          .min(1),
      })
    )
    .description("Write or update an extension. Content comes from stdin/pipe.")
    .action(async (_data, ctx) => {
      const code = ctx?.stdin
      if (!code) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `Error: No code content provided. Pipe content to stdin.
Example: cat script.js | eidos extension write my-extension`,
        }
      }
      return eh.extensionWrite(ds, _data.slug, code)
    })
}
