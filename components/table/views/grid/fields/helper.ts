import { IField } from "@/lib/store/interface"

export const checkNewFieldNameIsOk = (
  name: string,
  currentField: IField,
  columns: IField[]
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
