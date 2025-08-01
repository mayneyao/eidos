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
  const rows = await eidos.currentSpace.table(ctx.tableId).rows.query(
    {},
    {
      viewId: ctx.viewId,
    }
  )
  return rows
}

export function MyListView() {
  const [rows, setRows] = useState([])

  const tableId = window.location.pathname.split("/")[1]
  useEffect(() => {
    getRows({ tableId }).then((rows) => {
      setRows(rows)
    })
  }, [tableId])

  return (
    <div>
      {rows.map((row) => (
        <div key={row.id}>{row.title}</div>
      ))}
    </div>
  )
}
