import { useCallback } from "react"
import { v4 as uuidV4 } from "uuid"

import { getCodeFromMarkdown } from "@/lib/markdown"
import { getUuid, uuidv7 } from "@/lib/utils"
import { startRecorder, stopRecorder } from "@/lib/web/recorder"

import { useCurrentPathInfo } from "./use-current-pathinfo"
import { useEidosFileSystemManager } from "./use-fs"
import { useSqlite } from "./use-sqlite"
import { useTableOperation } from "./use-table"

const autoRunScope = ["SQL.SELECT"]

export const useAIFunctions = () => {
  const { space: database, tableName: table } = useCurrentPathInfo()
  const { handleSql, sqlite } = useSqlite(database)
  // FIXME: now ai-chat is global, maybe not in table page
  const { runQuery } = useTableOperation(table ?? "", database)
  const { efsManager } = useEidosFileSystemManager()

  const handleRunSql = useCallback(
    async (sql: string) => {
      if (sql.includes("UUID()")) {
        // bug, all uuid is same
        // sql = sql.replaceAll("UUID()", `'${uuidV4()}'`)
        // replace UUID() with uuidv4(), each uuid is unique
        while (sql.includes("UUID()")) {
          sql = sql.replace("UUID()", `'${uuidV4()}'`)
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
      ; (window as any)._CANVAS_ID_ = `#chart-${msgIndex}`
        ; (window as any)._CHART_WIDTH_ = width - 50
        ; (window as any)._CHART_HEIGHT_ = width - 50
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
    switch (name) {
      case "sqlQuery":
        const { sql } = parameters
        const scope = "SQL." + sql?.trim().toUpperCase().split(" ")[0]
        if (autoRunScope.includes(scope)) {
          return await handleRunSql(sql)
        }
        return "permission denied"
      case "createQuickAction":
        const { name, params, nodes } = parameters
        try {
          await sqlite?.addAction({
            id: uuidv7(),
            name,
            params,
            nodes,
          })
          return "ok"
        } catch (error: any) {
          return error.message
        }
      case "startRecorder":
        const res = await startRecorder()
        return `recorder id: ${res}`
      case "stopRecorder":
        const fileUrl = await stopRecorder(parameters.id)
        console.log("recorded file url: ", fileUrl)
        return fileUrl
      case "saveFile2EFS":
        const fileObj = await sqlite?.saveFile2EFS(parameters.url)
        console.log("save file to opfs: ", fileObj)
        if (!fileObj) return "no file"
        return (
          window.location.origin + efsManager.getFileUrlByPath(fileObj.path)
        )
      case "createDoc":
        const { markdown, title } = parameters
        const docId = getUuid()
        const doc = await sqlite?.createOrUpdateDocWithMarkdown(docId, markdown, undefined, title)
        const url = `/${database}/${docId}}`
        console.log(doc, url)
        return url
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
