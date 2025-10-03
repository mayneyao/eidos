import React, { useEffect, useState } from "react"

export const meta = {
  type: "tableView",
  componentName: "MyListView",
  tableView: {
    title: "List View",
    type: "list",
    description: "This is a list view",
  },
}

const getRows = async (ctx: { tableId: string; viewId?: string }) => {
  // @ts-ignore - eidos is injected at runtime
  const rows = await eidos.currentSpace.table(ctx.tableId).rows.query(
    {},
    {
      viewId: ctx.viewId,
    }
  )
  return rows
}

export function MyListView() {
  const [rows, setRows] = useState<any[]>([])

  // Get tableId and viewId from URL path
  // URL structure: <extid>.block.<spaceId>.eidos.localhost:13127/<tableid>/<viewid>
  const pathParts = window.location.pathname.split("/")
  const tableId = pathParts[pathParts.length - 2]
  const viewId = pathParts[pathParts.length - 1]

  useEffect(() => {
    if (tableId) {
      getRows({ tableId, viewId }).then((rows) => {
        setRows(rows)
      })
    }
  }, [tableId, viewId])

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Custom List View</h2>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="p-3 border rounded-lg hover:bg-gray-50">
            {row.title || row.name || row.id}
          </div>
        ))}
      </div>
    </div>
  )
}
