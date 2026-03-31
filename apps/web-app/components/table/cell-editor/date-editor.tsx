import { useEffect, useState } from "react"
import { useUpdateEffect } from "ahooks"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { EmptyValue, getLayoutClasses } from "./common"
import type { CellEditorProps } from "./types"
import { useCellEditor } from "./use-cell-editor"

interface IDateEditorProps extends CellEditorProps<string> {}

export const DateEditor = ({
  value,
  onChange,
  isEditing,
  onFinishEditing,
  onCancelEditing,
  layout = "flow",
  disabled = false,
}: IDateEditorProps) => {
  const [_value, setValue] = useState<string>(value)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

  const { isActuallyEditing, handleKeyDown, finishEditing, cancelEditing } =
    useCellEditor({
      isEditing,
      onFinishEditing,
      onCancelEditing,
      originalValue: value,
      setValue,
    })

  // Auto-open popover when entering edit mode
  useEffect(() => {
    if (isActuallyEditing) {
      setIsPopoverOpen(true)
    }
  }, [isActuallyEditing])

  useUpdateEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  useEffect(() => {
    setValue(value)
  }, [value])

  const handleDateSelect = (d: Date | undefined) => {
    if (d) {
      setValue(d.toISOString())
      setIsPopoverOpen(false)
      finishEditing()
    }
  }

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open)
    if (!open) {
      finishEditing()
    }
  }

  const containerClasses = getLayoutClasses(layout, isActuallyEditing, disabled)

  return (
    <div className={containerClasses}>
      <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger
          className={cn(
            "flex h-full w-full items-center justify-start font-normal",
            !_value && "text-muted-foreground"
          )}
          onKeyDown={handleKeyDown}
          onClick={() => setIsPopoverOpen(true)}
          tabIndex={0}
        >
          <span className="text-sm">
            {_value ? new Date(_value).toLocaleDateString() : <EmptyValue />}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={_value ? new Date(_value) : undefined}
            onSelect={handleDateSelect}
            className="rounded-md border-none outline-hidden"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
