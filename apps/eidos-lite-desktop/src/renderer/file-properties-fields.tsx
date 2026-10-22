import { useEffect, useRef, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSnapshot,
  EidosFileSqlPrimitive,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { Plus } from "lucide-react"
import {
  useEidosFileUI,
  type EidosFileEditorDataSource,
  EidosFileRecordFieldEditor,
  isEidosFileFieldWritable,
  eidosFileRecordFieldText,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@eidos.space/eidos-file-ui"
import { FilePropertiesSection } from "./file-properties-section"
import { FilePropertiesCreate } from "./file-properties-create"
import { useEidosLiteI18n } from "./i18n"

/** The inspector edits values; field definitions belong in the file manager. */
function EditableProperty({
  field,
  row,
  disabled,
  onEdit,
  onCreateOption,
  registerCommit,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  disabled: boolean
  onEdit(field: EidosFileFieldInfo, value: EidosFileSqlPrimitive): Promise<void>
  onCreateOption(field: EidosFileFieldInfo, name: string): Promise<void>
  registerCommit?: (fieldId: string, commit: () => boolean) => () => void
}) {
  const commitRef = useRef<(() => boolean) | null>(null)
  useEffect(
    () => registerCommit?.(field.id, () => commitRef.current?.() ?? true),
    [field.id, registerCommit]
  )
  return (
    <EidosFileRecordFieldEditor
      field={field}
      row={row}
      disabled={disabled}
      appearance="compact"
      commitRef={commitRef}
      onChange={(value) => onEdit(field, value)}
      onCreateOption={
        field.type === "multi-select" || field.type === "select"
          ? (name) => onCreateOption(field, name)
          : undefined
      }
    />
  )
}

export function FilePropertiesFields({
  source,
  table,
  row,
  view,
  disabled,
  readOnly = false,
  onEdit,
  onSnapshot,
  onCreateOption,
  registerCommit,
}: {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  row: EidosFileRow
  view: EidosFileViewInfo
  disabled: boolean
  readOnly?: boolean
  onEdit(field: EidosFileFieldInfo, value: EidosFileSqlPrimitive): Promise<void>
  onSnapshot(snapshot: EidosFileSnapshot): void
  onCreateOption(field: EidosFileFieldInfo, name: string): Promise<void>
  registerCommit?: (fieldId: string, commit: () => boolean) => () => void
}) {
  const { timeZone } = useEidosFileUI()
  const { t } = useEidosLiteI18n()
  const [create, setCreate] = useState(false)
  const configurableFields = table.fields.filter(
    (field) => field.settings?.isSystem !== true && field.valueKind !== "system"
  )
  const fields = configurableFields
    .filter((field) => !field.isHidden && !view.hiddenFields.includes(field.id))
    .sort(
      (a, b) =>
        (view.orderMap?.[a.id] ?? a.position ?? 0) -
        (view.orderMap?.[b.id] ?? b.position ?? 0)
    )
  return (
    <FilePropertiesSection title={t("Custom properties")}>
      {fields.map((field) => (
        <div className="file-properties-field" key={field.id}>
          <span className="file-properties-field-label" title={field.name}>
            <span>{field.name}:</span>
          </span>
          <div className="min-w-0">
            {!readOnly &&
            isEidosFileFieldWritable(field) &&
            [
              "text",
              "number",
              "integer",
              "checkbox",
              "date",
              "datetime",
              "url",
              "rating",
              "select",
              "multi-select",
            ].includes(field.type) ? (
              <EditableProperty
                field={field}
                row={row}
                disabled={disabled}
                onEdit={onEdit}
                onCreateOption={onCreateOption}
                registerCommit={registerCommit}
              />
            ) : (
              <span className="file-properties-readonly-value">
                {eidosFileRecordFieldText(row, field, timeZone) || "—"}
              </span>
            )}
          </div>
        </div>
      ))}
      {!readOnly && (
        <div className="file-properties-controls">
          <Popover open={create} onOpenChange={setCreate}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("Add property")}
                title={t("Add property")}
                disabled={disabled}
              >
                <Plus />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <FilePropertiesCreate
                disabled={disabled}
                onCancel={() => setCreate(false)}
                onCreate={async (input) => {
                  onSnapshot(await source.addField(table.table.id, input))
                  setCreate(false)
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </FilePropertiesSection>
  )
}
