import { useCallback } from "react"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { FIELD_VALUE_TYPE_MAP } from "@/packages/core/fields/const"
import { getRawTableNameById } from "@/lib/utils"
import codePatching from "@/packages/ai/prompts/common/code-patching.md?raw"
import uiGuide from "@/packages/ai/prompts/common/ui-guide.md?raw"
import sdk from "@/packages/ai/prompts/common/sdk.md?raw"
import type { DataSpace } from "@/packages/core/DataSpace"
import type { IBindings } from "@/packages/core/types/IExtension"


const getBindingsPrompt = async (bindings: IBindings, sqlite: DataSpace | null) => {
    let bindingsPrompt = `
If a table is named MY_TABLE, you can use \`eidos.currentSpace.MY_TABLE.rows.findMany\` to query the table directly.

**Important**: In the \`where\` clause of findMany, you must use the **Database Column Name** (not the Field Name) for filtering.

here are some tables you can use:
`
    for (const [key, value] of Object.entries(bindings ?? {})) {
        const fields = await sqlite?.column.list({ table_name: getRawTableNameById(value.value) })
        bindingsPrompt += `### ${key}\n`
        bindingsPrompt += `| Field Name | Database Column Name | Type | Value Type | Example |\n|------------|---------------------|------|------------|------|\n`
        fields?.forEach((field) => {
            bindingsPrompt += `| ${field.name} | ${field.table_column_name} | ${field.type} | ${FIELD_VALUE_TYPE_MAP[field.type].valueType} | ${FIELD_VALUE_TYPE_MAP[field.type].example} |\n`
        })
        bindingsPrompt += '\n'
    }
    return bindingsPrompt
}

export const useRemixPrompt = () => {
    const { sqlite } = useSqlite()

    const getRemixPrompt = useCallback(async (
        defaultPrompt: string,
        options?: {
            bindings?: IBindings,
            userCode?: string,
            useSdk?: boolean,
            useUiGuide?: boolean,
            useCodePatchingMode?: boolean,
        }
    ) => {
        const { bindings, userCode, useSdk, useUiGuide, useCodePatchingMode = true } = options ?? {}
        let bindingsPrompt = await getBindingsPrompt(bindings ?? {}, sqlite)
        let prompt = defaultPrompt
        let res = prompt.replace("{{bindings}}", bindingsPrompt).replace("{{userCode}}", `
            <user-code>
            \`\`\`jsx
            ${userCode}
            \`\`\`
            </user-code>
            `)
        if (useSdk) {
            res = res.replace("{{sdk}}", sdk ?? "")
        }
        if (useUiGuide) {
            res = res.replace("{{uiGuide}}", uiGuide ?? "")
        }
        if (useCodePatchingMode) {
            res = res.replace("{{codePatching}}", codePatching ?? "")
        }
        return res
    }, [sqlite])

    return {
        getRemixPrompt
    }
}
