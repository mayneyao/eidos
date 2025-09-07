import { useState } from "react"
import { useUpdateEffect } from "ahooks"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { EmptyValue } from "./common"

interface IDateEditorProps {
  value: string
  onChange: (value: string) => void
  isEditing: boolean
  onFinishEditing?: () => void
}

export const DateEditor = ({
  value,
  onChange,
  isEditing,
  onFinishEditing,
}: IDateEditorProps) => {
  const [_value, setValue] = useState<string>(value)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

  useUpdateEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isEditing) {
      e.preventDefault()
      setIsPopoverOpen(true)
    }
  }

  const handleDateSelect = (d: Date | undefined) => {
    if (d) {
      setValue(d.toISOString())
      setIsPopoverOpen(false)
      onFinishEditing?.()
    }
  }

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open)
    if (!open) {
      onFinishEditing?.()
    }
  }

  return (
    <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger
        className={cn(
          "flex h-full w-full items-center justify-start font-normal px-2",
          !_value && "text-muted-foreground"
        )}
        onKeyDown={handleKeyDown}
        onClick={() => setIsPopoverOpen(true)}
        tabIndex={0}
      >
        {_value ? new Date(_value).toLocaleDateString() : <EmptyValue />}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={_value ? new Date(_value) : undefined}
          onSelect={handleDateSelect}
          className="rounded-md border-none outline-none"
        />
      </PopoverContent>
    </Popover>
  )
}
