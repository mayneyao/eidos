import { useSqlite } from "@/hooks/use-sqlite"
import { FIELD_VALUE_TYPE_MAP } from "@/lib/fields/const"
import { getRawTableNameById } from "@/lib/utils"

import remixPrompt from "@/lib/v3/prompts/remix.md?raw"



export const useRemixPrompt = () => {
    const { sqlite } = useSqlite()

    let bindingsPrompt = `
If a table is named MY_TABLE, you can use \`eidos.currentSpace.MY_TABLE.rows.query\` to query the table directly.

here are some tables you can use:
`
    const getRemixPrompt = async (
        bindings?: Record<string, { type: "table", value: string }>,
        userCode?: string,
        defaultPrompt?: string
    ) => {
        for (const [key, value] of Object.entries(bindings ?? {})) {
            const fields = await sqlite?.column.list({ table_name: getRawTableNameById(value.value) })
            bindingsPrompt += `### ${key}\n`
            bindingsPrompt += `| Field | Type | Value Type | Example |\n|--------|------|------------|------|\n`
            fields?.forEach((field) => {
                bindingsPrompt += `| ${field.name} | ${field.type} | ${FIELD_VALUE_TYPE_MAP[field.type].valueType} | ${FIELD_VALUE_TYPE_MAP[field.type].example} |\n`
            })
            bindingsPrompt += '\n'
        }
        let prompt = defaultPrompt ?? remixPrompt
        return prompt.replace("{{bindings}}", bindingsPrompt).replace("{{userCode}}", `
            <userCode>
            \`\`\`jsx
            ${userCode}
            \`\`\`
            </userCode>
            ` ?? "")
    }
    return {
        getRemixPrompt
    }
}
