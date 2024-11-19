import { useSqlite } from "@/hooks/use-sqlite"
import { FIELD_VALUE_TYPE_MAP } from "@/lib/fields/const"
import { getRawTableNameById } from "@/lib/utils"

import remixPrompt from "@/lib/v3/prompts/remix.md?raw"



export const useRemixPrompt = () => {
    const { sqlite } = useSqlite()

    let bindingsPrompt = `
If a table is named MUSIC, you can use \`eidos.currentSpace.MUSIC.rows.query\` to query the table directly.

here are some tables you can use:
`
    const getRemixPrompt = async (bindings?: Record<string, { type: "table", value: string }>) => {
        for (const [key, value] of Object.entries(bindings ?? {})) {
            const fields = await sqlite?.column.list({ table_name: getRawTableNameById(value.value) })
            bindingsPrompt += `### ${key}\n`
            bindingsPrompt += `| Field | Type | Value Type | Example |\n|--------|------|------------|------|\n`
            fields?.forEach((field) => {
                bindingsPrompt += `| ${field.name} | ${field.type} | ${FIELD_VALUE_TYPE_MAP[field.type].valueType} | ${FIELD_VALUE_TYPE_MAP[field.type].example} |\n`
            })
            bindingsPrompt += '\n'
        }
        return remixPrompt.replace("{{bindings}}", bindingsPrompt)
    }
    return {
        getRemixPrompt
    }
}
