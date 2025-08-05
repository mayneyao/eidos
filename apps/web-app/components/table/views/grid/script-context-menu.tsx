import { useEffect, useState } from "react"
import { ZapIcon } from "lucide-react"
import { RowsManager } from "@/packages/core/sdk/rows"
import type {
  IExtension,
  TableActionMeta,
} from "@/packages/core/types/IExtension"

import { ContextMenuItem } from "@/components/ui/context-menu"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useCurrentUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { useScriptFunction } from "../../../script-container/hook"

export const ScriptContextMenu = ({
  getRows,
}: {
  getRows: () => any[] | undefined
}) => {
  const { space, tableId, viewId } = useCurrentPathInfo()
  const { sqlite } = useSqlite(space)
  const { callFunction } = useScriptFunction()
  const { fieldRawColumnNameFieldMap } = useCurrentUiColumns()
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
            {script.meta!.tableAction.name}
          </ContextMenuItem>
        )
      })}
    </>
  )
}
