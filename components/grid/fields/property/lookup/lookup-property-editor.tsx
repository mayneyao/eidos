import { useMemo, useState } from "react"

import { FieldType } from "@/lib/fields/const"
import { ILinkProperty } from "@/lib/fields/link"
import { ILookupProperty } from "@/lib/fields/lookup"
import { IField } from "@/lib/store/interface"
import { useSqlite } from "@/hooks/use-sqlite"
import { useCurrentUiColumns, useUiColumns } from "@/hooks/use-ui-columns"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { FieldSelector } from "@/components/table/field-selector"

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
  const allowedLookupTargetFields = useMemo(() => {
    // lookup target table is current table
    if (linkField?.property.linkTableName === props.uiColumn.table_name) {
      return linkTableFields.filter((field) => field.type !== FieldType.Lookup)
    }
    return linkTableFields
  }, [
    linkField?.property.linkTableName,
    linkTableFields,
    props.uiColumn.table_name,
  ])

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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Link Field</Label>
        <FieldSelector
          fields={allLinkFields}
          value={properties.linkFieldId}
          onChange={(value) => {
            handleUpdateProperties("linkFieldId", value)
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Lookup Field</Label>
        <FieldSelector
          fields={allowedLookupTargetFields}
          value={properties.lookupTargetFieldId}
          onChange={(value) => {
            handleUpdateProperties("lookupTargetFieldId", value)
          }}
        />
      </div>
      {props.isCreateNew && <Button onClick={props.onSave}>Save</Button>}
    </div>
  )
}
