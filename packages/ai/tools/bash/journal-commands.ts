import { z } from "zod"
import type { DataSpace } from "@/packages/core/data-space"
import type { LightCli } from "./light-cli"
import type { ExecResult } from "./table-handlers"
import * as jh from "./journal-handlers"

export function registerJournalCommands(cli: LightCli, ds: DataSpace) {
  cli
    .command("journal list")
    .option("-l, --limit <limit>", "Max entries to return")
    .schema(
      z.object({
        limit: z
          .string()
          .optional()
          .transform((val) => (val ? parseInt(val, 10) : undefined))
          .refine((val) => val === undefined || !isNaN(val), {
            message: "--limit must be a valid number",
          }),
      })
    )
    .description("List journal entries (day pages)")
    .action(async (data) => jh.journalList(ds, data.limit ?? 30))

  cli
    .command("journal get <date>")
    .schema(
      z.object({
        date: z
          .string({
            required_error: "Date is required (YYYY-MM-DD or 'today')",
          })
          .min(1),
      })
    )
    .description("Get journal entry by date (YYYY-MM-DD or 'today')")
    .action(async (data) => jh.journalGet(ds, data.date))

  cli
    .command("journal write <date>")
    .schema(
      z.object({
        date: z
          .string({
            required_error: "Date is required (YYYY-MM-DD or 'today')",
          })
          .min(1),
      })
    )
    .description(
      "Write or update a journal entry. Content comes from --data or stdin/pipe."
    )
    .action(async (_data, ctx) => {
      const content = ctx?.stdin
      if (!content) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `Error: No content provided. Pipe content to stdin or use --data flag.
Example: echo "Today I learned..." | eidos journal write 2024-01-15`,
        }
      }
      return jh.journalWrite(ds, _data.date, content)
    })
}
