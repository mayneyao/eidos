import * as React from "react"
import { useClickAway } from "ahooks"
import {
  BaselineIcon,
  CalendarDaysIcon,
  CheckSquareIcon,
  Clock3Icon,
  HashIcon,
  ImageIcon,
  Link2Icon,
  LinkIcon,
  SigmaIcon,
  StarIcon,
  TagIcon,
  TagsIcon,
  TextSearchIcon,
  UserIcon,
} from "lucide-react"

import { FieldType } from "@/lib/fields/const"
import { IField } from "@/lib/store/interface"
import { cn, generateColumnName } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Button } from "@/components/ui/button"

import { useTableAppStore } from "../store"
import {
  NotImplementEditor,
  PropertyEditorTypeMap,
} from "./field-property-editor"

export function FieldAppendPanel({
  addField,
  uiColumns,
}: {
  addField: (
    fieldName: string,
    fieldType: FieldType,
    property?: any
  ) => Promise<void>
  uiColumns: IField[]
}) {
  const [currentField, setCurrentField] = React.useState<IField>()
  const { tableName } = useCurrentPathInfo()
  const ref = React.useRef<HTMLDivElement>(null)
  const { isAddFieldEditorOpen, setIsAddFieldEditorOpen } = useTableAppStore()
  const fieldTypes = [
    { name: "Text", value: FieldType.Text, icon: BaselineIcon },
    { name: "Number", value: FieldType.Number, icon: HashIcon },
    { name: "Select", value: FieldType.Select, icon: TagIcon },
    { name: "MultiSelect", value: FieldType.MultiSelect, icon: TagsIcon },
    {
      name: "Checkbox",
      value: FieldType.Checkbox,
      icon: CheckSquareIcon,
    },
    { name: "Rating", value: FieldType.Rating, icon: StarIcon },

    { name: "URL", value: FieldType.URL, icon: Link2Icon },
    { name: "Date", value: FieldType.Date, icon: CalendarDaysIcon },
    { name: "Files", value: FieldType.File, icon: ImageIcon },
    {
      name: "Formula",
      value: FieldType.Formula,
      icon: SigmaIcon,
    },
    {
      name: "Link",
      value: FieldType.Link,
      icon: LinkIcon,
      disable: false,
    },
    {
      name: "Lookup",
      value: FieldType.Lookup,
      icon: TextSearchIcon,
    },
    {
      name: "Created Time",
      value: FieldType.CreatedTime,
      icon: Clock3Icon,
    },
    {
      name: "Last Edited Time",
      value: FieldType.LastEditedTime,
      icon: Clock3Icon,
    },
    {
      name: "Created By",
      value: FieldType.CreatedBy,
      icon: UserIcon,
    },
    {
      name: "Last Edited By",
      value: FieldType.LastEditedBy,
      icon: UserIcon,
    },
  ]

  const handleUpdateField = (draftFieldProperty: any) => {
    currentField &&
      setCurrentField({
        ...currentField,
        property: {
          ...currentField?.property,
          ...draftFieldProperty,
        },
      })
  }

  const Editor =
    PropertyEditorTypeMap[currentField?.type ?? "select"] ?? NotImplementEditor

  const handleCreateField = (field: (typeof fieldTypes)[0]) => {
    // generate new field name, use field.name if it is not duplicated. otherwise, append a number
    let newFieldName = field.name
    if (uiColumns.some((col) => col.name === newFieldName)) {
      let i = 1
      while (uiColumns.some((col) => col.name === `${newFieldName} ${i}`)) {
        i++
      }
      newFieldName = `${newFieldName} ${i}`
    }
    // link field need to fill more property
    if (field.value === FieldType.Link) {
      setCurrentField({
        name: newFieldName,
        type: field.value,
        table_column_name: generateColumnName(),
        table_name: tableName!,
        property: {},
      })
    } else {
      addField(newFieldName, field.value).then(() =>
        setIsAddFieldEditorOpen(false)
      )
    }
  }

  const handleSaveField = () => {
    if (currentField) {
      addField(
        currentField.name,
        currentField.type,
        currentField.property
      ).then(() => setIsAddFieldEditorOpen(false))
    }
  }

  // useClickAway(
  //   () => {
  //     isAddFieldEditorOpen && setIsAddFieldEditorOpen(false)
  //   },
  //   ref,
  //   ["mousedown", "touchstart"]
  // )

  useClickAway(
    (e) => {
      const res = document.querySelectorAll(".click-outside-ignore")
      if (Array.from(res).some((node) => node.contains(e.target as Node))) {
        return
      }
      if (ref.current?.contains(e.target as Node)) {
        return
      }
      isAddFieldEditorOpen && setIsAddFieldEditorOpen(false)
    },
    ref,
    ["mousedown", "touchstart"]
  )

  return (
    <div
      ref={ref}
      className={cn(
        "absolute right-0 top-0 z-50 h-full w-[350px] bg-white shadow-lg dark:bg-slate-950"
      )}
    >
      {currentField ? (
        <Editor
          uiColumn={currentField!}
          onPropertyChange={handleUpdateField}
          onSave={handleSaveField}
          isCreateNew
        />
      ) : (
        <div>
          <h2 className="relative px-6 text-lg font-semibold tracking-tight">
            add field
          </h2>
          <div className="space-y-1 p-2">
            {fieldTypes.map((field, i) => {
              const Icon = field.icon
              return (
                <React.Fragment key={`${field.name}-${field.value}`}>
                  {[FieldType.Formula, FieldType.CreatedTime].includes(
                    field.value
                  ) && <hr />}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start font-normal"
                    onClick={(e) => {
                      handleCreateField(field)
                    }}
                    disabled={field.disable}
                  >
                    <Icon className="mr-2 h-5 w-5" />
                    {field.name}
                  </Button>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
