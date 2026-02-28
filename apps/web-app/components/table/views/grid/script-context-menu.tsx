import { useEffect, useState } from "react"
import { ZapIcon } from "lucide-react"
import { RowsManager } from "@/packages/core/sdk/rows"
import type {
  IExtension,
  TableActionMeta,
} from "@/packages/core/types/IExtension"

import { NativeContextMenuItem as ContextMenuItem } from "@/components/ui/native-context-menu"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useCurrentUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { getTableIdByRawTableName } from "@/lib/utils"

import { useScriptFunction } from "../../../script-container/hook"
import { useTableContext } from "../../hooks"

export const ScriptContextMenu = ({
  getRows,
  count,
}: {
  getRows: () => any[] | undefined
  count: string
}) => {
  const { space, viewId, tableName } = useTableContext()
  const { sqlite } = useSqlite(space)
  const { callFunction } = useScriptFunction()
  const { fieldRawColumnNameFieldMap } = useCurrentUiColumns()

  // Convert rawTableName to tableId
  const tableId = getTableIdByRawTableName(tableName)
  const [tableActionScripts, setTableActionScripts] = useState<
    IExtension<TableActionMeta>[]
  >([])

  useEffect(() => {
    if (!sqlite) return

    const fetchTableActionScripts = async () => {
      try {
        const scripts =
          await sqlite.extension.getTableActionExtensions("enabled")
        setTableActionScripts(scripts as IExtension<TableActionMeta>[])
      } catch (error) {
        console.error("Failed to fetch table action scripts:", error)
        setTableActionScripts([])
      }
    }

    fetchTableActionScripts()
  }, [sqlite])

  const handleScriptActionCall = async (
    action: IExtension<TableActionMeta>
  ) => {
    const rows = getRows()
    if (!rows?.length) return

    for (const row of rows) {
      const rowJson = RowsManager.rawData2Json(row, fieldRawColumnNameFieldMap)

      await callFunction({
        input: rowJson,
        command: action.meta!.funcName,
        context: {
          tableId,
          viewId,
          rowId: row._id,
        },
        code: action.code,
        id: action.id,
        space: space,
      })
    }
  }

  return (
    <>
      {tableActionScripts.map((script) => {
        return (
          <ContextMenuItem
            key={script.id}
            onClick={() => {
              handleScriptActionCall(script)
            }}
          >
            <ZapIcon className="pr-2" />
            {script.meta!.tableAction.name} ({count})
          </ContextMenuItem>
        )
      })}
    </>
  )
}
