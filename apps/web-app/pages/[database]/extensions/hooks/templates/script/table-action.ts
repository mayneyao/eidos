export const meta = {
  type: "tableAction",
  funcName: "toggleChecked",
  tableAction: {
    name: "Toggle Checked Status",
    description: "Toggles the checked status of the selected record",
  },
}

export async function toggleChecked(
  input: Record<string, any>,
  ctx: {
    tableId: string
    viewId: string
    rowId: string
  }
) {
  const { tableId, viewId, rowId } = ctx
  await eidos.currentSpace.table(tableId).rows.update(rowId, {
    checked: !input.checked,
  })
  return {
    success: true,
  }
}
