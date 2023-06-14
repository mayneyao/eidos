import { useCallback } from "react"
import { useParams } from "next/navigation"
import { v4 as uuidV4 } from "uuid"

import { getCodeFromMarkdown } from "@/lib/markdown"
import { useConfigStore } from "@/app/settings/store"

import { useSqlite } from "./use-sqlite"
import { useTable } from "./use-table"

export const useAutoRunCode = () => {
  const { database, table } = useParams()
  const { handleSql } = useSqlite(database)
  const { aiConfig } = useConfigStore()
  const { runQuery } = useTable(table, database)

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
        if (res) {
          // TODO: use runtime context to pass data to d3,
          ;(window as any)._DATA_ = res
        }
      }
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
    // eslint-disable-next-line no-eval
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
    const { autoRunScope } = aiConfig
    const { width = 300, msgIndex = -1 } = props.context || {}
    const { code, lang, isAuto = false } = props
    switch (lang) {
      case "sql":
        const scope = "SQL." + code?.trim().toUpperCase().slice(0, 6)
        const shouldRun = isAuto ? autoRunScope.includes(scope) : true
        if (shouldRun) {
          await handleRunSql(code)
        }
        break
      case "js":
        if (!isAuto || autoRunScope.includes("D3.CHART")) {
          handleRunD3(code, {
            msgIndex,
            width,
          })
        }
        break
      default:
        throw new Error(`lang ${lang} not supported auto run`)
    }
  }

  const handleFunctionCall = async (
    name: string,
    parameters: any,
    isAuto: boolean = true
  ) => {
    const { autoRunScope } = aiConfig
    switch (name) {
      case "sqlQuery":
        const { sql } = parameters
        const scope = "SQL." + sql?.trim().toUpperCase().slice(0, 6)
        if (autoRunScope.includes(scope)) {
          return await handleRunSql(sql)
        }
        break
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
  return { autoRun, handleRunCode, handleFunctionCall }
}
