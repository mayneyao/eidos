import { IUIColumn } from "@/hooks/use-table"

export const checkNewFieldNameIsOk = (
  name: string,
  currentField: IUIColumn,
  columns: IUIColumn[]
) => {
  if (name.length < 1) {
    return false
  }
  if (currentField && currentField.name === name) {
    return true
  }
  if (columns.find((column) => column.name === name)) {
    return false
  }
  return true
}
