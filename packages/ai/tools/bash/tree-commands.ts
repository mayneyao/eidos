import { z } from "zod"
import type { DataSpace } from "@/packages/core/data-space"
import { LightCli } from "./light-cli"
import * as th from "./tree-handlers"

export function registerTreeCommands(cli: LightCli, ds: DataSpace) {
  cli
    .command("tree")
    .option("-p, --parent <id>", "Show subtree of a specific node")
    .option("-d, --depth <n>", "Maximum nesting depth (default: 1)")
    .schema(
      z.object({
        parent: z.string().optional(),
        depth: z
          .string()
          .optional()
          .transform((val) => (val ? parseInt(val, 10) : undefined))
          .refine((val) => val === undefined || !isNaN(val), {
            message: "--depth must be a valid number",
          }),
      })
    )
    .description(
      "Browse the eidos__tree hierarchy. Shows ALL nodes in a nested tree by default. Use --parent for a subtree, --depth to limit levels."
    )
    .action(async (data) => {
      return th.listTree(ds, data.parent, data.depth)
    })
}
