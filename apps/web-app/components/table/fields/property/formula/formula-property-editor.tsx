import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { FieldType } from "@/packages/core/fields/const"
import type { FormulaProperty } from "@/packages/core/fields/formula"
import type { IField } from "@/packages/core/types/IField"
import { FunctionSquareIcon, Type, Link2, FileIcon, Edit3 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import type { CodeMirrorFormulaEditorRef } from "@/components/formula-editor/codemirror-editor"
import { useCurrentUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

// lazy import FormulaEditor
const FormulaEditor = lazy(
  () => import("../../../views/grid/plugins/formula-editor")
)

interface IFieldPropertyEditorProps {
  uiColumn: IField<FormulaProperty>
  onPropertyChange: (property: FormulaProperty) => void
  isCreateNew?: boolean
}

const displayTypeOptions = [
  {
    value: FieldType.Text,
    label: "Text",
    icon: Type,
    description: "Plain text output",
  },
  {
    value: FieldType.URL,
    label: "URL",
    icon: Link2,
    description: "Clickable link",
  },
  {
    value: FieldType.File,
    label: "Files",
    icon: FileIcon,
    description: "File preview",
  },
]

export const FormulaPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { t } = useTranslation()
  const { formula = "" } = props.uiColumn.property ?? ({} as FormulaProperty)
  const [displayType, setDisplayType] = useState(
    props.uiColumn.property.displayType ?? FieldType.Text
  )
  const ref = useRef<HTMLDivElement>(null)
  const editorRef = useRef<CodeMirrorFormulaEditorRef>(null)
  const [isOpen, setIsOpen] = useState(false)
  const { uiColumns } = useCurrentUiColumns()

  // Sync with external changes
  useEffect(() => {
    setDisplayType(props.uiColumn.property.displayType ?? FieldType.Text)
  }, [props.uiColumn.property.displayType])

  const handleChangeFieldDisplayType = (value: FieldType) => {
    setDisplayType(value)
    props.onPropertyChange({ ...props.uiColumn.property, displayType: value })
  }

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        editorRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Truncate long formula for display
  const displayFormula =
    formula.length > 50 ? formula.slice(0, 50) + "..." : formula || ""

  return (
    <div className="space-y-3" ref={ref}>
      <Separator />

      {/* Formula Editor Section */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.formula.formula")}
        </Label>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <button className="w-full group">
              <div
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-md",
                  "bg-muted/50 border border-muted-foreground/20",
                  "hover:border-primary/50 hover:bg-muted",
                  "transition-colors duration-150 text-left"
                )}
              >
                <FunctionSquareIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <code className="flex-1 text-xs font-mono text-foreground truncate">
                  {displayFormula || (
                    <span className="text-muted-foreground italic">
                      {t("table.propertyEditor.formula.clickToEdit")}
                    </span>
                  )}
                </code>
                <Edit3 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0 border-none w-[500px]"
            container={ref.current!}
            side="left"
            align="start"
            alignOffset={20}
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
                  {t("table.propertyEditor.formula.loading")}
                </div>
              }
            >
              <FormulaEditor
                editorRef={editorRef}
                closeEditor={() => setIsOpen(false)}
                formulaField={props.uiColumn}
                uiColumns={uiColumns}
                rowId={null}
              />
            </Suspense>
          </PopoverContent>
        </Popover>
      </div>

      {/* Display Type Section */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.formula.displayAs")}
        </Label>
        <div className="grid grid-cols-3 gap-1.5">
          {displayTypeOptions.map((option) => {
            const Icon = option.icon
            const isSelected = displayType === option.value
            return (
              <button
                key={option.value}
                onClick={() => handleChangeFieldDisplayType(option.value)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1",
                  "px-2 py-2 rounded-lg border-2 transition-all duration-150",
                  "hover:border-accent hover:bg-accent/5",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    isSelected ? "text-primary" : "text-foreground"
                  )}
                >
                  {option.label}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {displayTypeOptions.find((o) => o.value === displayType)?.description}
        </p>
      </div>
    </div>
  )
}
