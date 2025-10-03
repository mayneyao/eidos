import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { FieldType } from "@/packages/core/fields/const"
import type { FormulaProperty } from "@/packages/core/fields/formula"
import type { IField } from "@/packages/core/types/IField"
import { FunctionSquareIcon } from "lucide-react"

import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { CodeMirrorFormulaEditorRef } from "@/components/formula-editor/codemirror-editor"
import { useCurrentUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

// lazy import FormulaEditor
const FormulaEditor = lazy(
  () => import("../../../views/grid/plugins/formula-editor")
)
// import { FormulaEditor } from "../../../views/grid/plugins/formula-editor"

interface IFieldPropertyEditorProps {
  uiColumn: IField<FormulaProperty>
  onPropertyChange: (property: FormulaProperty) => void
  isCreateNew?: boolean
}

export const FormulaPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { formula = "upper(title)" } =
    props.uiColumn.property ?? ({} as FormulaProperty)
  const [displayType, setDisplayType] = useState(
    props.uiColumn.property.displayType
  )
  const ref = useRef<HTMLDivElement>(null)
  const editorRef = useRef<CodeMirrorFormulaEditorRef>(null)
  const [isOpen, setIsOpen] = useState(false)
  const { uiColumns } = useCurrentUiColumns()

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

  return (
    <div className="flex flex-col gap-8" ref={ref}>
      <div className="flex flex-col gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <p className="text-sm text-gray-500 flex items-start gap-2">
              <FunctionSquareIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {formula}
            </p>
          </PopoverTrigger>
          <PopoverContent
            className="p-0 border-none"
            container={ref.current!}
            side="left"
            align="start"
            alignOffset={20}
          >
            <Suspense fallback={<div className="flex items-center justify-center p-4">Loading Formula Editor...</div>}>
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
        <div className="flex items-center gap-2 justify-between">
          <Label>Display as</Label>
          <ToggleGroup
            type="single"
            size="sm"
            value={displayType}
            onValueChange={(value: string) => {
              if (value) handleChangeFieldDisplayType(value as any)
            }}
            className="w-[200px] click-outside-ignore border rounded-md p-0.5 bg-muted gap-1 flex"
          >
            <ToggleGroupItem
              value={FieldType.Text}
              className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-2.5 py-1 text-xs"
            >
              Text
            </ToggleGroupItem>
            <ToggleGroupItem
              value={FieldType.URL}
              className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-2.5 py-1 text-xs"
            >
              URL
            </ToggleGroupItem>
            <ToggleGroupItem
              value={FieldType.File}
              className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-2.5 py-1 text-xs"
            >
              Files
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </div>
  )
}
