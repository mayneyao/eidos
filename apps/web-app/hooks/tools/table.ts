import type { Tool } from "ai"

export const createRecordsTool: Tool<{
  table_id: string;
  records: Array<Record<string, unknown>>;
}, any> = {
    description: "Create records in a table, keep batch size small, 10-20 is good",
    inputSchema: {
        type: "object",
        properties: {
            table_id: { type: "string" },
            records: { type: "array", items: { type: "object" } },
        },
        required: ['table_id', 'records'],
    } as any,
}
