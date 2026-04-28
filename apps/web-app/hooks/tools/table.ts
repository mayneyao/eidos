import { dynamicTool, jsonSchema } from "ai"

export const createRecordsTool = dynamicTool({
  description:
    "Create records in a table, keep batch size small, 10-20 is good",
  inputSchema: jsonSchema({
    type: "object",
    properties: {
      table_id: { type: "string" },
      records: { type: "array", items: { type: "object" } },
    },
    required: ["table_id", "records"],
  }),
  execute: async () => ({}),
})
