import { useState, useEffect } from "react"

export const meta = {
  type: "tableView",
  componentName: "MyListView",
  tableView: {
    title: "List View",
    type: "list",
    description: "This is a list view",
  },
}

const getRows = async (ctx) => {
  const rows = await eidos.currentSpace.table(ctx.tableId).rows.query(
    {},
    {
      viewId: ctx.viewId,
    }
  )
  return rows
}

export function MyListView({ ctx }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    getRows(ctx).then((rows) => {
      setRows(rows)
    })
  }, [ctx])

  return (
    <div>
      {rows.map((row) => (
        <div key={row.id}>{row.title}</div>
      ))}
    </div>
  )
}
