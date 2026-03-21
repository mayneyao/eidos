import { useMemo, useState, useEffect } from "react"
import { FieldType } from "@/packages/core/fields/const"
import type { ILinkProperty } from "@/packages/core/fields/link"
import type { ILookupProperty } from "@/packages/core/fields/lookup"
import type { IField } from "@/packages/core/types/IField"
import { TextSearch, Link2, ArrowRight, Check, Info } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { FieldSelector } from "@/components/table/fields/field-selector"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import {
  useCurrentUiColumns,
  useUiColumns,
} from "@/apps/web-app/hooks/use-ui-columns"

interface IFieldPropertyEditorProps {
  uiColumn: IField<ILookupProperty>
  onPropertyChange: (property: any) => void
  onSave?: () => void
  isCreateNew?: boolean
  showSaveButton?: boolean
}

export const LookupPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { t } = useTranslation()
  const { uiColumns } = useCurrentUiColumns()
  const { sqlite } = useSqlite()

  const allLinkFields = uiColumns.filter(
    (field) => field.type === FieldType.Link
  )

  const [properties, setProperties] = useState<ILookupProperty>(
    props.uiColumn.property
  )

  // Sync with external changes
  useEffect(() => {
    setProperties(props.uiColumn.property)
  }, [props.uiColumn.property])

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

  const selectedLinkField = allLinkFields.find(
    (f) => f.table_column_name === properties.linkFieldId
  )

  const selectedLookupField = allowedLookupTargetFields.find(
    (f) => f.table_column_name === properties.lookupTargetFieldId
  )

  return (
    <div className="space-y-3">
      <Separator />

      {/* Header */}
      <div className="flex items-center gap-2">
        <TextSearch className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.lookup.lookupSettings")}
        </span>
      </div>

      {/* Link Field Selection */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.lookup.linkField")}
        </Label>
        <FieldSelector
          fields={allLinkFields}
          value={properties.linkFieldId}
          onChange={(value) => {
            handleUpdateProperties("linkFieldId", value)
            // Reset lookup target when link field changes
            handleUpdateProperties("lookupTargetFieldId", "")
          }}
          className="w-full"
        />
        <p className="text-[10px] text-muted-foreground">
          {t("table.propertyEditor.lookup.linkFieldDescription")}
        </p>
      </div>

      {/* Lookup Field Selection */}
      <div className="space-y-1.5">
        <Label
          className={cn(
            "text-xs font-medium",
            !linkField && "text-muted-foreground"
          )}
        >
          {t("table.propertyEditor.lookup.lookupField")}
        </Label>
        <FieldSelector
          fields={allowedLookupTargetFields}
          value={properties.lookupTargetFieldId}
          onChange={(value) => {
            handleUpdateProperties("lookupTargetFieldId", value)
          }}
          className="w-full"
          disabled={!linkField}
        />
        {!linkField ? (
          <p className="text-[10px] text-muted-foreground">
            {t("table.propertyEditor.lookup.selectLinkFirst")}
          </p>
        ) : allowedLookupTargetFields.length === 0 ? (
          <p className="text-[10px] text-destructive">
            {t("table.propertyEditor.lookup.noFieldsAvailable")}
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            {t("table.propertyEditor.lookup.lookupFieldDescription")}
          </p>
        )}
      </div>

      {/* Summary Card */}
      {selectedLinkField && selectedLookupField && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border p-2 text-[11px]",
            "bg-muted/50 border-border"
          )}
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />
            <span className="truncate max-w-[80px]">
              {selectedLinkField.name}
            </span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TextSearch className="h-3.5 w-3.5" />
            <span className="truncate max-w-[80px]">
              {selectedLookupField.name}
            </span>
          </div>
        </div>
      )}

      {/* Info Note */}
      {linkField && (
        <div
          className={cn(
            "flex items-start gap-1.5 rounded-md border p-2 text-[11px]",
            "bg-muted/50 border-border"
          )}
        >
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span className="text-muted-foreground leading-relaxed">
            {t("table.propertyEditor.lookup.lookupInfo", {
              linkTable:
                linkField.property.linkTableName || t("common.untitled"),
            })}
          </span>
        </div>
      )}

      {/* Save Button */}
      {props.showSaveButton && (
        <Button
          onClick={props.onSave}
          className="h-7 text-xs w-full"
          size="sm"
          disabled={!properties.linkFieldId || !properties.lookupTargetFieldId}
        >
          {t("common.save")}
        </Button>
      )}
    </div>
  )
}
