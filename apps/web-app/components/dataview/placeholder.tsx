import { useEffect, useState } from "react"
import { formatSql } from "@/packages/core/sqlite/helper"
import { ViewTypeEnum } from "@/packages/core/types/IView"
import type { SQLNamespace } from "@codemirror/lang-sql"
import { useTranslation } from "react-i18next"

import { shortenId, uuidv7 } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import SqlEditor from "@/components/sql-editor"
import { GridViewForView } from "@/apps/web-app/components/table/views/grid/grid-for-view"
import { useDataView } from "@/apps/web-app/hooks/use-data-view"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

import { templates } from "./template"

export const DataViewPlaceholder = ({
  nodeId,
  onCreated,
}: {
  nodeId: string
  onCreated: () => void
}) => {
  const [sql, setSql] = useState("")
  const [schema, setSchema] = useState<SQLNamespace>({})
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const { createDataView, createTempDataView } = useDataView()
  const { sqlite } = useSqlite()
  const { t } = useTranslation()

  useEffect(() => {
    const buildSchema = async () => {
      if (!sqlite) return

      try {
        const tables = await sqlite.sqlQuery2(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%'
        `)

        const schemaResult: SQLNamespace = {}

        for (const table of tables) {
          const tableName = table.name

          const columns = await sqlite.sqlQuery2(
            `PRAGMA table_info(${tableName})`
          )

          schemaResult[tableName] = columns.map((col: any) => col.name)
        }

        setSchema(schemaResult)
      } catch (error) {
        console.error("Error building schema:", error)
      }
    }

    buildSchema()
  }, [sqlite])

  const { space } = useCurrentPathInfo()
  const handleCreate = () => {
    createDataView(shortenId(nodeId), sql).then(onCreated)
  }

  const handleTemplateSelect = (templateSql: string) => {
    setSql(formatSql(templateSql))
    setPreviewError(null)
  }

  const handleSqlChange = (newSql: string) => {
    setSql(newSql)
    setPreviewError(null)
  }

  const handleFormatSql = () => {
    if (sql.trim()) {
      setSql(formatSql(sql))
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Format SQL: Opt+Shift+F or Alt+Shift+F
      if (event.altKey && event.shiftKey && event.key === "F") {
        event.preventDefault()
        handleFormatSql()
      }
      // Preview: Cmd+Enter or Ctrl+Enter
      else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        handlePreview()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [sql, isPreviewLoading])

  const handlePreview = async () => {
    if (!sql || !sql.trim()) {
      setPreviewError("Please enter a SQL query to preview")
      return
    }

    setIsPreviewLoading(true)
    setPreviewError(null)

    try {
      if (sqlite) {
        try {
          setIsPreviewMode(false)
          await sqlite.exec2(`DROP VIEW IF EXISTS vw_${nodeId}`)
        } catch (error) {
          console.warn("Failed to drop old temporary view:", error)
        }
      }

      await createTempDataView(nodeId, sql)
      setIsPreviewMode(true)
    } catch (error) {
      console.error("Preview error:", error)
      let errorMessage = "Failed to create preview"

      if (error instanceof Error) {
        if (error.message.includes("syntax error")) {
          errorMessage = "SQL syntax error. Please check your query."
        } else if (error.message.includes("no such table")) {
          errorMessage =
            "Table not found. Please check table names in your query."
        } else if (error.message.includes("no such column")) {
          errorMessage =
            "Column not found. Please check column names in your query."
        } else {
          errorMessage = error.message
        }
      }

      setPreviewError(errorMessage)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  return (
    <div className="flex h-full px-4 gap-4">
      <div className="w-72 flex-shrink-0 flex flex-col h-full">
        <label className="block text-sm font-medium text-muted-foreground mb-4 flex-shrink-0">
          {t("common.templates")}
        </label>
        <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
          {templates.map((template) => (
            <button
              key={template.name}
              onClick={() => handleTemplateSelect(template.sql.trim())}
              className="p-2 text-left border border-border rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="font-medium">{t(template.i18nKey)}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {t(template.descriptionKey)}
              </div>
              {template.tags && template.tags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {template.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-secondary text-secondary-foreground rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 h-full">
        <ResizablePanelGroup direction="vertical" className="h-full">
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col">
              <div className="flex justify-between items-center mb-2 flex-shrink-0">
                <label
                  htmlFor="sql"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  {t("common.sqlQuery")}
                </label>
              </div>
              {previewError && (
                <div className="mb-2 p-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded">
                  {previewError}
                </div>
              )}
              <div className="flex-1 min-h-0 px-2">
                <SqlEditor
                  value={sql}
                  onChange={handleSqlChange}
                  schema={schema}
                />
              </div>
            </div>
          </ResizablePanel>

          <div className="flex gap-2 w-full justify-end p-2">
            <div className="flex gap-2">
              <Button
                size="xs"
                variant="outline"
                onClick={handleFormatSql}
                disabled={!sql.trim()}
              >
                <span>Format SQL</span>
                <span className="ml-1 text-xs opacity-60">⌥⇧F</span>
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={handlePreview}
                disabled={isPreviewLoading || !sql.trim()}
              >
                <span>{"Preview"}</span>
                <span className="ml-1 text-xs opacity-60">⌘⏎</span>
              </Button>
              <Button size="xs" onClick={handleCreate}>
                {t("common.createDataView")}
              </Button>
            </div>
          </div>
          <ResizableHandle />

          <ResizablePanel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0">
                {isPreviewMode ? (
                  <GridViewForView
                    tableName={`vw_${nodeId}`}
                    databaseName={space}
                    view={{
                      id: "tempviewid",
                      name: "tempviewname",
                      type: ViewTypeEnum.Grid,
                      table_id: nodeId,
                      query: `select * from vw_${nodeId}`,
                    }}
                    isEditable={false}
                    className="h-full"
                  />
                ) : (
                  <div className="flex-1 min-h-0 h-full flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                      {t("common.noPreviewData")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
