import { z } from "zod"

const createQuickAction = {
  name: "createQuickAction",
  description: "create a quick action",
  schema: z
    .object({
      name: z.string({
        description: "name of action",
      }),
      params: z.array(
        z.object({
          name: z.string({
            description: "name of param",
          }),
          type: z.string({
            description: "type of param, string|number|boolean",
          }),
        })
      ),
      nodes: z.array(
        z.object({
          name: z.string({
            description: "name of function will be called",
          }),
          params: z.array(
            z.object({
              name: z.string({
                description: "name of param",
              }),
              value: z.any({
                description: "value of param",
              }),
            })
          ),
        })
      ),
    })
    .describe("sql query"),
}

export default createQuickAction
