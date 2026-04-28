import { useCallback } from "react"
import { uuidv4 } from "@/lib/utils"

import { getCodeFromMarkdown } from "@/lib/markdown"
import { getUuid, uuidv7 } from "@/lib/utils"
import { startRecorder, stopRecorder } from "@/lib/web/recorder"

import { useAllTools } from "@/apps/web-app/hooks/use-all-tools"
import { useCurrentPathInfo } from "./use-current-pathinfo"

import { useScriptCall } from "./use-script-call"
import { useSqlite } from "./use-sqlite"
import { useTableOperation } from "./use-table"

const autoRunScope = ["SQL.SELECT"]

export const useAIFunctions = () => {
  const { space: database, tableName: table } = useCurrentPathInfo()
  const tools = useAllTools()
  const { callScript } = useScriptCall()

  const { handleSql, sqlite } = useSqlite(database)
  const { runQuery } = useTableOperation(table ?? "", database)

  const handleRunSql = useCallback(
    async (sql: string) => {
      if (sql.includes("UUID()")) {
        // bug, all uuid is same
        // sql = sql.replaceAll("UUID()", `'${uuidV4()}'`)
        // replace UUID() with uuidv4(), each uuid is unique
        while (sql.includes("UUID()")) {
          sql = sql.replace("UUID()", `'${uuidv4()}'`)
        }
      }
      // remove comments
      sql = sql.replace(/--.*\n/g, "\n").replace(/\/\*.*\*\//g, "")

      // read-only sql will be not handled by handleSql
      const handled = await handleSql(sql)
      console.log({ sql, handled })
      if (!handled) {
        const res = await runQuery(sql)
        console.log(res)
        return res
      }
      return "ok"
    },
    [handleSql, runQuery]
  )

  const handleRunD3 = (
    code: string,
    context: {
      msgIndex: number
      width: number
    }
  ) => {
    const { msgIndex, width } = context

    try {
      ;(window as any)._CANVAS_ID_ = `#chart-${msgIndex}`
      ;(window as any)._CHART_WIDTH_ = width - 50
      ;(window as any)._CHART_HEIGHT_ = width - 50
      eval(code)
    } catch (error) {
      console.log(code)
      console.error(error)
    }
  }

  const handleRunCode = async (props: {
    code: string
    lang: string
    isAuto: boolean
    context?: {
      msgIndex: number
      width?: number
    }
  }) => {
    const { width = 300, msgIndex = -1 } = props.context || {}
    const { code, lang, isAuto = false } = props
    switch (lang) {
      case "js":
        if (!isAuto || autoRunScope.includes("D3.CHART")) {
          handleRunD3(code, {
            msgIndex,
            width,
          })
        }
        break
      case "sql":
      default:
        const scope = "SQL." + code?.trim().toUpperCase().slice(0, 6)
        const shouldRun = isAuto ? autoRunScope.includes(scope) : true
        if (shouldRun) {
          return await handleRunSql(code)
        }
        break
      // throw new Error(`lang ${lang} not supported auto run`)
    }
  }

  const handleToolsCall = async (
    name: string,
    parameters: any,
    isAuto: boolean = true
  ) => {
    const functionId = (tools[name] as any)?.id
    if (functionId) {
      const [scriptId, commandName] = functionId.split(".")
      const res = await callScript(scriptId, parameters, commandName)
      return res
    }
    switch (name) {
      case "createRecords":
        return "not supported"
      // const { table_id, records } = parameters
      // const res1 = await sqlite?.createRecords(table_id, records)
      // return res1
      case "sqlQuery":
        const { sql } = parameters
        const scope = "SQL." + sql?.trim().toUpperCase().split(" ")[0]
        if (autoRunScope.includes(scope)) {
          return await handleRunSql(sql)
        }
        return "permission denied"
      case "startRecorder":
        const res = await startRecorder()
        return `recorder id: ${res}`
      case "stopRecorder": {
        const fileUrl = await stopRecorder(parameters.id)
        console.log("recorded file url: ", fileUrl)
        return fileUrl
      }
      case "saveFile2EFS": {
        const { url: fileUrl } = parameters
        // Fetch the file
        const response = await fetch(fileUrl)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)

        const fileId = getUuid()
        // Infer filename from URL or default
        const fileName = fileUrl.split("/").pop() || `file-${fileId}`
        const ext = fileName.split(".").pop() || ""
        const path = `~/.eidos/files/${fileId}.${ext}`

        await sqlite?.fs.writeFile(path, uint8Array)

        return window.location.origin + "/" + path
      }
      case "createDoc":
        const { markdown, title } = parameters
        const docId = getUuid()
        const doc = await sqlite?.createOrUpdateDocWithMarkdown(
          docId,
          markdown,
          undefined,
          title
        )
        const url = `/${docId}`
        console.log(doc, url)
        return url
      case "createTable":
        const { name: tableName, fields } = parameters
        const tableId = await sqlite?.createTable(fields, tableName)
        return tableId
      default:
        throw new Error(`function ${name} not supported auto run`)
    }
  }
  const autoRun = async (
    markdown: string,
    context: {
      msgIndex: number
      width: number
    }
  ) => {
    const allCode = getCodeFromMarkdown(markdown)

    for (const { code, lang } of allCode) {
      await handleRunCode({
        code,
        lang,
        isAuto: true,
        context,
      })
    }
  }
  return { autoRun, handleRunCode, handleToolsCall }
}
