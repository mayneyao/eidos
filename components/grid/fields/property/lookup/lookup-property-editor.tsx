import { useMemo, useState } from "react"

import { FieldType } from "@/lib/fields/const"
import { ILinkProperty } from "@/lib/fields/link"
import { ILookupProperty } from "@/lib/fields/lookup"
import { IField } from "@/lib/store/interface"
import { useSqlite } from "@/hooks/use-sqlite"
import { useCurrentUiColumns, useUiColumns } from "@/hooks/use-ui-columns"
import { Button } from "@/components/ui/button"

interface IFieldPropertyEditorProps {
  uiColumn: IField<ILookupProperty>
  onPropertyChange: (property: any) => void
  onSave?: () => void
  isCreateNew?: boolean
}

export const LookupPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { uiColumns } = useCurrentUiColumns()
  const { sqlite } = useSqlite()
  const allLinkFields = uiColumns.filter(
    (field) => field.type === FieldType.Link
  )

  const [properties, setProperties] = useState<ILookupProperty>(
    props.uiColumn.property
  )

  const linkField = useMemo<IField<ILinkProperty> | undefined>(() => {
    return allLinkFields.find(
      (field) => field.table_column_name === properties.linkFieldId
    )
  }, [allLinkFields, properties.linkFieldId])

  const { uiColumns: linkTableFields } = useUiColumns(
    linkField?.property.linkTableName
  )

  const handleUpdateProperties = (key: string, value: any) => {
    setProperties((prev) => {
      const newProperties = { ...prev, [key]: value }
      props.onPropertyChange(newProperties)
      if (sqlite) {
        sqlite.updateLookupColumn(
          props.uiColumn.table_name,
          props.uiColumn.table_column_name
        )
      }
      return newProperties
    })
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <select
        name=""
        id="linkFieldId"
        value={properties.linkFieldId}
        onChange={(e) => handleUpdateProperties("linkFieldId", e.target.value)}
      >
        <option value="">Select a link field in this table</option>
        {allLinkFields.map((field) => {
          return (
            <option
              value={field.table_column_name}
              key={field.table_column_name}
            >
              {field.name || "Untitled Field"}
            </option>
          )
        })}
      </select>

      <select
        name=""
        id="lookupTargetFieldId"
        value={properties.lookupTargetFieldId}
        onChange={(e) =>
          handleUpdateProperties("lookupTargetFieldId", e.target.value)
        }
      >
        <option value="">Select field you want to lookup</option>
        {linkTableFields.map((field) => {
          return (
            <option
              value={field.table_column_name}
              key={field.table_column_name}
            >
              {field.name || "Untitled Field"}
            </option>
          )
        })}
      </select>
      {props.isCreateNew && <Button onClick={props.onSave}>Save</Button>}
    </div>
  )
}
