import { useContext, useEffect, useRef, useState } from "react"

import type { IField } from "@/packages/core/types/IField"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { Input } from "@/components/ui/input"

import { checkNewFieldNameIsOk } from "./helper"
import { TableContext } from "../hooks"

interface IFieldNameEditProps {
  field: IField
  tableName: string
  databaseName: string
  onEditEnd?: () => void
}

export const FieldNameEdit = ({
  field,
  tableName,
  databaseName,
  onEditEnd,
}: IFieldNameEditProps) => {
  const [error, setError] = useState<string>()

  const { isView } = useContext(TableContext)
  const { uiColumns } = useUiColumns(tableName, databaseName)
  const handleNewFieldNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    if (!field) return
    const isOk = checkNewFieldNameIsOk(newName, field, uiColumns)
    if (!isOk) {
      if (newName.length === 0) {
        setError("Field name cannot be empty")
      } else {
        setError("Field name already exists")
      }
    } else {
      setError("")
    }
    setNewFieldName(e.target.value)
  }

  const handleChangeFieldName = async () => {
    if (!field) return
    const tableColumnName = field.table_column_name
    if (field.name === newFieldName) {
      return
    }
    const isOk = checkNewFieldNameIsOk(newFieldName, field, uiColumns)
    if (isOk) {
      updateFieldName(tableColumnName, newFieldName)
      onEditEnd && onEditEnd()
    }
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const { updateFieldName } = useTableOperation(tableName, databaseName)
  const [newFieldName, setNewFieldName] = useState<string>(field?.name ?? "")

  useEffect(() => {
    if (field) {
      setNewFieldName(field.name)
    }
  }, [field])

  return (
    <div className="flex flex-col gap-1 w-full">
      <Input
        ref={inputRef}
        id="fieldName"
        value={newFieldName}
        onBlur={handleChangeFieldName}
        autoFocus
        disabled={isView}
        autoComplete="off"
        onChange={handleNewFieldNameChange}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleChangeFieldName()
          }
          if (e.key === "Escape") {
            onEditEnd && onEditEnd()
          }
        }}
        className="col-span-3 h-7 text-xs"
      />
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  )
}
