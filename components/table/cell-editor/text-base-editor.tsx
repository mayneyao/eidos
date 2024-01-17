import { useState } from "react"

import { Input } from "@/components/ui/input"

import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue } from "./common"

interface ITextBaseEditorProps {
  value: string | null
  onChange: (value: string | null) => void
  type?: "text" | "number" | "url"
  isEditing: boolean
}
export const TextBaseEditor = ({
  value,
  isEditing,
  onChange,
  type = "text",
}: ITextBaseEditorProps) => {
  const [_value, setValue] = useState(value)

  useChangeEffect(() => {
    onChange(_value || null)
  }, [_value, onChange])

  if (!isEditing) {
    if (type === "number") {
      return (
        <div className="flex h-full w-full items-center truncate">{_value}</div>
      )
    }
    return (
      <div className="flex h-full w-full items-center truncate">
        {_value?.length ? _value : <EmptyValue />}
      </div>
    )
  }
  return (
    <div className="w-full">
      <Input
        value={_value || ""}
        type={type}
        onChange={(e) => {
          setValue(e.target.value)
        }}
      ></Input>
    </div>
  )
}
