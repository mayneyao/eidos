import { useState } from "react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue } from "./common"

interface IDateEditorProps {
  value: string
  onChange: (value: string) => void
  isEditing: boolean
}

export const DateEditor = ({
  value,
  onChange,
  isEditing,
}: IDateEditorProps) => {
  const [_value, setValue] = useState<string>(value)

  useChangeEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-full w-[280px] items-center  justify-start font-normal",
          !_value && "text-muted-foreground"
        )}
      >
        {_value ? new Date(_value).toLocaleDateString() : <EmptyValue />}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={_value ? new Date(_value) : undefined}
          onSelect={(d) => {
            d && setValue(d.toISOString())
          }}
          className="rounded-md border-none outline-none"
        />
      </PopoverContent>
    </Popover>
  )
}
