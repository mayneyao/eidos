import { useEffect, useState } from "react"

import { Checkbox } from "@/apps/web-app/components/ui/checkbox"
import useChangeEffect from "../hooks/use-change-effect"
import type { CellEditorProps } from "./types"
import { useCellEditor } from "./use-cell-editor"

interface ICheckboxEditorProps extends CellEditorProps<boolean> {}

export const CheckboxEditor = ({
  value,
  onChange,
  isEditing,
  onFinishEditing,
  onCancelEditing,
  layout = "flow",
}: ICheckboxEditorProps) => {
  const [_value, setValue] = useState<boolean>(value)

  const { isActuallyEditing, handleKeyDown, finishEditing, cancelEditing } =
    useCellEditor({
      isEditing,
      onFinishEditing,
      onCancelEditing,
      originalValue: value,
      setValue,
    })

  // When entering edit mode via Enter, auto-toggle value and finish editing
  useEffect(() => {
    if (isActuallyEditing && isEditing) {
      const newValue = !_value
      setValue(newValue)
      onChange(newValue)
      finishEditing()
    }
  }, [isEditing, isActuallyEditing])

  useChangeEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  useEffect(() => {
    setValue(value)
  }, [value])

  const handleToggle = (checked: boolean) => {
    setValue(checked)
    onChange(checked)
    finishEditing()
  }

  // Checkbox typically uses inline layout
  const containerClasses =
    layout === "inline"
      ? "inline-flex items-center px-2"
      : "flex items-center px-2 w-full h-full"

  return (
    <div className={containerClasses} onKeyDown={handleKeyDown} tabIndex={0}>
      <Checkbox
        checked={Boolean(_value)}
        onCheckedChange={handleToggle}
        className="h-4 w-4"
      />
    </div>
  )
}
