import { useEffect, useRef, useState } from "react"

import { IField } from "@/lib/store/interface"
import { useTableOperation } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"
import { Input } from "@/components/ui/input"

import { checkNewFieldNameIsOk } from "./helper"

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
    <div className="flex flex-col gap-2">
      <Input
        ref={inputRef}
        id="fieldName"
        value={newFieldName}
        onBlur={handleChangeFieldName}
        autoFocus
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
        className="col-span-3 h-[32px]"
      />
      {error && <div className="text-red-500">{error}</div>}
    </div>
  )
}
