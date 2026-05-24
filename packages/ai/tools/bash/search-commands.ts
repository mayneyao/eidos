import { z } from "zod"
import type { DataSpace } from "@/packages/core/data-space"
import { LightCli } from "./light-cli"
import * as sh from "./search-handlers"

export function registerSearchCommands(cli: LightCli, ds: DataSpace) {
  cli
    .command("search <keyword>")
    .schema(
      z.object({
        keyword: z
          .string({ required_error: "Search keyword is required" })
          .min(1),
      })
    )
    .description("Full-text search across all documents and journals")
    .action(async (data) => sh.searchDocs(ds, data.keyword))
}
