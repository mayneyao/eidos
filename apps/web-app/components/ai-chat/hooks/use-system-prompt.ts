import { useMap } from "ahooks"
import { useEffect, useMemo, useState } from "react"

import { useRemixPrompt } from "@/apps/web-app/pages/[database]/extensions/hooks/use-remix-prompt"
import { useCurrentExtension, useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useDocEditor } from "@/apps/web-app/hooks/use-doc-editor"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { getRawTableNameById, getTableIdByRawTableName } from "@/lib/utils"
import { ALLOWED_DOCUMENT_EXTENSIONS } from "@/lib/const"
import systemPromptRaw from "./prompt.md?raw"

import extensionBlockPrompt from "@/packages/ai/prompts/extension-block.md?raw"
import extensionScriptPrompt from "@/packages/ai/prompts/extension-script.md?raw"

export const getPromptByExtensionType = (type?: string) => {
    switch (type) {
        case "script":
            return extensionScriptPrompt
        case "block":
        case "m_block":
            return extensionBlockPrompt
        default:
            return extensionScriptPrompt
    }
}

export const useAdditionalData = (
    contextNodes: ITreeNode[] = [],
) => {
    const { space } = useCurrentPathInfo()
    const currentNode = useCurrentNode()
    const [_map, { set, reset, get }] = useMap<string, string>()
    const [_tableMap, { set: setTable, reset: resetTable, get: getTable }] = useMap<string, string>()
    const [_extensionMap, { set: setExtension, reset: resetExtension, get: getExtension }] = useMap<string, { slug: string; code: string }>()
    const [_pathDocMap, { set: setPathDoc, reset: resetPathDoc, get: getPathDoc }] = useMap<string, string>()
    const { sqlite } = useSqlite()
    const { getDocMarkdown } = useDocEditor(sqlite)

    const tables = useMemo(
        () =>
            contextNodes
                .filter((node) => node.type === "table")
                .map((node) => getRawTableNameById(node.id)),
        [contextNodes]
    )

    const docs = useMemo(
        () =>
            contextNodes.filter((node) => node.type === "doc").map((node) => node.id),
        [contextNodes]
    )

    const extensions = useMemo(
        () =>
            contextNodes.filter((node) => node.type === "extension").map((node) => node.id),
        [contextNodes]
    )

    const pathDocs = useMemo(
        () =>
            contextNodes.filter((node) => {
                const isPathNode = node.id.startsWith('~') || node.id.startsWith('@/')
                const fileName = node.name?.toLowerCase() || ''
                // Only allow text/markdown files for pathDocs
                const allowedTextExtensions = ALLOWED_DOCUMENT_EXTENSIONS.slice(0, 3) // .md, .markdown, .txt
                return isPathNode && allowedTextExtensions.some(ext => fileName.endsWith(ext))
            }).map((node) => node.id),
        [contextNodes]
    )

    useEffect(() => {
        async function loadDocs() {
            for (const docId of docs) {
                const markdown = await getDocMarkdown(docId)
                set(docId, markdown)
            }
        }
        loadDocs()
    }, [docs, getDocMarkdown, set])

    useEffect(() => {
        async function loadTableSchemas() {
            if (!sqlite) return

            console.log(tables)
            for (const tableName of tables) {
                try {
                    // Get table schema using PRAGMA table_info
                    const columns = await sqlite.listUiColumns(tableName)
                    /**
                     *   name: string
  type: FieldType
  table_column_name: string
  table_name: string
  property: T
  created_at?: string
  updated_at?: string
                     */
                    console.log('columns', columns)
                    const schemaText = columns.map((col) =>
                        `${col.name}`
                    ).join('\n')

                    setTable(tableName, schemaText)
                } catch (error) {
                    console.warn(`Failed to load schema for table ${tableName}:`, error)
                }
            }
        }
        loadTableSchemas()
    }, [tables, sqlite, setTable])

    useEffect(() => {
        async function loadExtensions() {
            if (!sqlite) return

            for (const extensionId of extensions) {
                try {
                    const extension = await sqlite.extension.get(extensionId)
                    if (extension && extension.ts_code) {
                        setExtension(extensionId, {
                            slug: extension.slug,
                            code: extension.ts_code
                        })
                    }
                } catch (error) {
                    console.warn(`Failed to load extension ${extensionId}:`, error)
                }
            }
        }
        loadExtensions()
    }, [extensions, sqlite, setExtension])

    useEffect(() => {
        async function loadPathDocs() {
            if (!sqlite) return

            for (const path of pathDocs) {
                try {
                    // Read file content using the file system API
                    const content = await sqlite.fs.readFile(path, { encoding: 'utf-8' })
                    setPathDoc(path, content)
                } catch (error) {
                    console.warn(`Failed to load path document ${path}:`, error)
                }
            }
        }
        loadPathDocs()
    }, [pathDocs, sqlite, setPathDoc])

    const additionalData = useMemo(() => {
        return `
  <additional_data>
  <attached_docs>
  ${Array.from(_map.entries()).map(([key, value]) => `<doc id="${key}" title="${contextNodes.find(node => node.id === key)?.name}">\n${value}\n</doc>`).join("\n")}
  </attached_docs>
  <attached_tables>
  ${Array.from(_tableMap.entries()).map(([tableName, schema]) => `<table id="${getTableIdByRawTableName(tableName)}" name="${tableName}" title="${contextNodes.find(node => getRawTableNameById(node.id) === tableName)?.name}">\n${schema}\n</table>`).join("\n")}
  </attached_tables>
  <attached_extensions>
  ${Array.from(_extensionMap.entries()).map(([extensionId, extensionData]) => `<extension id="${extensionId}" slug="${extensionData.slug}">\n${extensionData.code}\n</extension>`).join("\n")}
  </attached_extensions>
  <attached_path_docs>
  ${Array.from(_pathDocMap.entries()).map(([path, content]) => `<doc path="${path}" title="${contextNodes.find(node => node.id === path)?.name}">\n${content}\n</doc>`).join("\n")}
  </attached_path_docs>
  </additional_data>
  <use_info>
${currentNode ? ` <current_node id="${currentNode?.id}" name="${currentNode?.name}" type="${currentNode?.type}" />` : ""
            }
  <current_space id="${space}" name="${space}" />
  </use_info>
  `
    }, [_map, _tableMap, _extensionMap, _pathDocMap, contextNodes, currentNode, space])

    return additionalData
}


export const useSystemPrompt = (
    contextNodes: ITreeNode[] = [],
) => {
    const additionalData = useAdditionalData(contextNodes)
    const extension = useCurrentExtension()
    const { getRemixPrompt } = useRemixPrompt()
    const [remixPrompt, setRemixPrompt] = useState("")
    // const [selectedCustomPromptId, setSelectedCustomPromptId] = useState<
    //     string | null
    // >(null)

    // Memoize the base prompt calculation to prevent unnecessary recalculations
    const basePrompt = useMemo(() => {
        if (!extension?.type) {
            return null
        }
        return getPromptByExtensionType(extension?.type)
    }, [extension?.type])

    // Memoize the extension data to prevent unnecessary re-renders
    const extensionData = useMemo(() => ({
        bindings: extension?.bindings,
        code: extension?.ts_code || extension?.code,
        type: extension?.type
    }), [extension?.bindings, extension?.ts_code, extension?.code, extension?.type])

    useEffect(() => {
        if (!basePrompt) {
            return
        }
        getRemixPrompt(basePrompt, {
            bindings: extensionData.bindings,
            userCode: extensionData.code,
            useSdk: true,
            useUiGuide: true,
        }
        ).then(setRemixPrompt)
    }, [
        extensionData.bindings,
        extensionData.code,
        basePrompt,
        getRemixPrompt,
    ])

    return `
    ${systemPromptRaw}
    Below are some potentially helpful/relevant pieces of information for figuring out to respond
    ${additionalData}

    Below is the custom prompt for this task:
    <custom_prompt>
    ${remixPrompt}
    </custom_prompt>
    `
}

