import { useMemo, useState } from "react"

import { FieldType } from "@/lib/fields/const"
import { ILinkProperty } from "@/lib/fields/link"
import { ILookupProperty } from "@/lib/fields/lookup"
import { IField } from "@/lib/store/interface"
import { useSqlite } from "@/hooks/use-sqlite"
import { useCurrentUiColumns, useUiColumns } from "@/hooks/use-ui-columns"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Link Field</Label>
        <Select
          value={properties.linkFieldId}
          onValueChange={(v) => handleUpdateProperties("linkFieldId", v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Link Field" />
          </SelectTrigger>
          <SelectContent className="click-outside-ignore">
            {allLinkFields.map((field) => {
              return (
                <SelectItem
                  key={field.table_column_name}
                  value={field.table_column_name}
                >
                  {field.name || "Untitled Field"}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label>Lookup Field</Label>
        <Select
          value={properties.lookupTargetFieldId}
          onValueChange={(v) =>
            handleUpdateProperties("lookupTargetFieldId", v)
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Lookup Field" />
          </SelectTrigger>
          <SelectContent className="click-outside-ignore">
            {linkTableFields.map((field) => {
              return (
                <SelectItem
                  key={field.table_column_name}
                  value={field.table_column_name}
                >
                  {field.name || "Untitled Field"}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
      {props.isCreateNew && <Button onClick={props.onSave}>Save</Button>}
    </div>
  )
}
